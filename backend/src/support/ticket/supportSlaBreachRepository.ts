import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { CityCode, SupportTicketPriority } from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";

export type SupportSlaBreachKind = "first_response" | "resolution";

export type SupportSlaBreachCandidate = {
  ticketId: string;
  dueAt: Date;
  priority: SupportTicketPriority;
  version: number;
};

type CandidateRow = RowDataPacket & {
  ticket_id: string;
  due_at: Date;
  priority: SupportTicketPriority;
  version: number | string;
};

export class SupportSlaBreachRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async claimOverdue(
    connection: PoolConnection,
    cityCode: CityCode,
    kind: SupportSlaBreachKind,
    limit = 25,
  ): Promise<SupportSlaBreachCandidate[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const first = kind === "first_response";
    const due = first ? "sla_first_response_due_at" : "sla_resolution_due_at";
    const marker = first ? "sla_first_response_breached_at" : "sla_resolution_breached_at";
    const extra = first ? "AND first_responded_at IS NULL" : "";
    const [rows] = await connection.query<CandidateRow[]>(
      `SELECT ticket_id,${due} AS due_at,priority,version FROM support_tickets
       WHERE city_code=? AND status NOT IN ('resolved','closed')
         AND ${due} IS NOT NULL AND ${due}<=CURRENT_TIMESTAMP(3)
         AND ${marker} IS NULL ${extra}
       ORDER BY ${due} ASC,ticket_id ASC LIMIT ? FOR UPDATE SKIP LOCKED`,
      [cityCode, safeLimit],
    );
    return rows.map((row) => ({ ticketId: row.ticket_id, dueAt: row.due_at,
      priority: row.priority, version: Number(row.version) }));
  }

  async markBreachCas(connection: PoolConnection, input: {
    cityCode: CityCode;
    ticketId: string;
    kind: SupportSlaBreachKind;
    expectedVersion: number;
    newPriority: SupportTicketPriority;
  }): Promise<boolean> {
    const marker = input.kind === "first_response"
      ? "sla_first_response_breached_at" : "sla_resolution_breached_at";
    const due = input.kind === "first_response"
      ? "sla_first_response_due_at" : "sla_resolution_due_at";
    const extra = input.kind === "first_response" ? "AND first_responded_at IS NULL" : "";
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE support_tickets SET ${marker}=CURRENT_TIMESTAMP(3),priority=?,version=version+1
       WHERE city_code=? AND ticket_id=? AND version=? AND ${marker} IS NULL
         AND ${due} IS NOT NULL AND ${due}<=CURRENT_TIMESTAMP(3)
         AND status NOT IN ('resolved','closed') ${extra}`,
      [input.newPriority, input.cityCode, input.ticketId, input.expectedVersion],
    );
    return result.affectedRows === 1;
  }
}

export const supportSlaBreachRepository = new SupportSlaBreachRepository();
