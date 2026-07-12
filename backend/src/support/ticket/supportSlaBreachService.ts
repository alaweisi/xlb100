import type { PoolConnection } from "mysql2/promise";
import type { CityCode, RequestContext, SupportTicketPriority } from "@xlb/types";
import { withTransaction } from "../../dal/transaction.js";
import { eventOutboxRepository, type EventOutboxRepository } from "../../events/eventOutbox.js";
import { generateEventId } from "../../events/eventIds.js";
import { generateSupportTicketEventId } from "./supportTicketIds.js";
import { supportTicketRepository, type SupportTicketRepository } from "./supportTicketRepository.js";
import {
  supportSlaBreachRepository, type SupportSlaBreachKind,
  type SupportSlaBreachRepository,
} from "./supportSlaBreachRepository.js";

type TransactionRunner = <T>(fn: (connection: PoolConnection) => Promise<T>) => Promise<T>;

const PRIORITY_LADDER: SupportTicketPriority[] = ["low", "normal", "high", "urgent", "critical"];

export function nextSupportPriority(priority: SupportTicketPriority): SupportTicketPriority {
  return PRIORITY_LADDER[Math.min(PRIORITY_LADDER.indexOf(priority) + 1, PRIORITY_LADDER.length - 1)]!;
}

export class SupportSlaBreachService {
  constructor(
    private readonly repository: SupportSlaBreachRepository = supportSlaBreachRepository,
    private readonly tickets: SupportTicketRepository = supportTicketRepository,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  private async recordBreach(connection: PoolConnection, input: {
    cityCode: CityCode; ticketId: string; kind: SupportSlaBreachKind; dueAt: Date;
    priority: SupportTicketPriority; version: number;
  }): Promise<boolean> {
    const newPriority = nextSupportPriority(input.priority);
    if (!await this.repository.markBreachCas(connection, {
      cityCode: input.cityCode, ticketId: input.ticketId, kind: input.kind,
      expectedVersion: input.version, newPriority,
    })) return false;
    const ticket = await this.tickets.findForUpdate(connection, input.cityCode, input.ticketId);
    if (!ticket) return false;
    await this.tickets.insertEvent(connection, {
      ticketEventId: generateSupportTicketEventId(), cityCode: input.cityCode, ticketId: input.ticketId,
      eventType: "sla_breached", actorType: "system", actorId: null, visibility: "internal",
      content: null, payload: { breachKind: input.kind, dueAt: input.dueAt.toISOString(),
        oldPriority: input.priority, newPriority, version: ticket.version },
      idempotencyKey: `sla:${input.kind}:${input.ticketId}`,
    });
    await this.outbox.insertEvent(connection, {
      eventId: generateEventId(), eventType: "support.sla.breached",
      aggregateType: "support_ticket", aggregateId: input.ticketId, cityCode: input.cityCode,
      payload: { ticketId: input.ticketId, cityCode: input.cityCode, breachKind: input.kind,
        dueAt: input.dueAt.toISOString(), oldPriority: input.priority,
        newPriority, version: ticket.version },
    });
    return true;
  }

  async catchUpInTransaction(connection: PoolConnection, input: {
    cityCode: CityCode;
    ticketId: string;
    includeFirstResponse: boolean;
    includeResolution: boolean;
  }) {
    let ticket = await this.tickets.findForUpdate(connection, input.cityCode, input.ticketId);
    if (!ticket || ["resolved", "closed"].includes(ticket.status)) return ticket;
    const [clockRows] = await connection.query<({ now_at: Date } & import("mysql2/promise").RowDataPacket)[]>(
      "SELECT CURRENT_TIMESTAMP(3) AS now_at",
    );
    const now = clockRows[0]!.now_at.getTime();
    if (input.includeFirstResponse && ticket.firstRespondedAt === null
      && ticket.slaFirstResponseBreachedAt === null && ticket.slaFirstResponseDueAt
      && new Date(ticket.slaFirstResponseDueAt).getTime() <= now) {
      await this.recordBreach(connection, { cityCode: input.cityCode, ticketId: input.ticketId,
        kind: "first_response", dueAt: new Date(ticket.slaFirstResponseDueAt),
        priority: ticket.priority, version: ticket.version });
      ticket = await this.tickets.findForUpdate(connection, input.cityCode, input.ticketId);
    }
    if (ticket && input.includeResolution && ticket.slaResolutionBreachedAt === null
      && ticket.slaResolutionDueAt && new Date(ticket.slaResolutionDueAt).getTime() <= now) {
      await this.recordBreach(connection, { cityCode: input.cityCode, ticketId: input.ticketId,
        kind: "resolution", dueAt: new Date(ticket.slaResolutionDueAt),
        priority: ticket.priority, version: ticket.version });
      ticket = await this.tickets.findForUpdate(connection, input.cityCode, input.ticketId);
    }
    return ticket;
  }

  private async processKind(cityCode: CityCode, kind: SupportSlaBreachKind, limit: number): Promise<number> {
    return this.transactionRunner(async (connection) => {
      const candidates = await this.repository.claimOverdue(connection, cityCode, kind, limit);
      let processed = 0;
      for (const candidate of candidates) {
        if (await this.recordBreach(connection, { cityCode, ticketId: candidate.ticketId, kind,
          dueAt: candidate.dueAt, priority: candidate.priority, version: candidate.version })) processed += 1;
      }
      return processed;
    });
  }

  async runOnce(context: RequestContext, cityCode: CityCode, limit = 25): Promise<{ processed: number }> {
    if (context.cityCode !== cityCode || cityCode === "__global__") throw new Error("support SLA city scope mismatch");
    const firstResponse = await this.processKind(cityCode, "first_response", limit);
    // Each breach kind gets an independent bounded batch so a busy
    // first-response queue cannot starve resolution processing.
    const resolution = await this.processKind(cityCode, "resolution", limit);
    return { processed: firstResponse + resolution };
  }
}

export const supportSlaBreachService = new SupportSlaBreachService();
