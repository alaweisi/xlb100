import type { PoolConnection } from "mysql2/promise";
import type {
  AddSupportTicketCommentRequest, AdminAddSupportTicketCommentRequest, AssignSupportTicketRequest,
  CityCode, CloseSupportTicketRequest, CreateSupportTicketRequest, EscalateSupportTicketRequest,
  OutboxEventType, ReopenSupportTicketRequest, RequestContext, ResolveSupportTicketRequest,
  SupportTicket, SupportTicketActorType, SupportTicketDetail, SupportTicketEvent,
  SupportTicketEventType, SupportTicketEventVisibility, SupportTicketListFilters,
  SupportTicketMutationResponse, SupportTicketOutboxEventPayload, SupportTicketStatus,
} from "@xlb/types";
import {
  addSupportTicketCommentRequestSchema, adminAddSupportTicketCommentRequestSchema,
  assignSupportTicketRequestSchema, closeSupportTicketRequestSchema,
  createSupportTicketRequestSchema, escalateSupportTicketRequestSchema,
  reopenSupportTicketRequestSchema, resolveSupportTicketRequestSchema,
  supportTicketListFiltersSchema,
} from "@xlb/validators";
import { withTransaction } from "../../dal/transaction.js";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { eventOutboxRepository, type EventOutboxRepository } from "../../events/eventOutbox.js";
import { generateEventId } from "../../events/eventIds.js";
import { supportDomainReferenceReader, type SupportDomainReferenceReader } from "./supportDomainReferenceReader.js";
import { generateSupportTicketEventId, generateSupportTicketId } from "./supportTicketIds.js";
import { supportTicketRepository, type SupportTicketRepository, type TicketCursor } from "./supportTicketRepository.js";
import { assertSupportTicketTransition } from "./supportTicketStateMachine.js";

type TransactionRunner = <T>(fn: (connection: PoolConnection) => Promise<T>) => Promise<T>;
type RequesterIdentity = { source: "customer" | "worker"; requesterId: string };

export class SupportTicketValidationError extends Error {}
export class SupportTicketForbiddenError extends Error {}
export class SupportTicketNotFoundError extends Error {}
export class SupportTicketConflictError extends Error {}

function requireCity(context: RequestContext): CityCode {
  let cityCode: CityCode;
  try {
    cityCode = assertCityScopedContext(context);
  } catch (error) {
    throw new SupportTicketValidationError(error instanceof Error ? error.message : "invalid city_code scope");
  }
  if (cityCode === "__global__") {
    throw new SupportTicketValidationError("a non-global city_code is required");
  }
  return cityCode;
}

function requireUser(context: RequestContext): string {
  if (!context.userId) throw new SupportTicketForbiddenError("authenticated user identity is required");
  return context.userId;
}

function requesterIdentity(context: RequestContext): RequesterIdentity {
  if (context.appType === "customer" && context.role === "customer") {
    return { source: "customer", requesterId: requireUser(context) };
  }
  if (context.appType === "worker" && context.role === "worker") {
    return { source: "worker", requesterId: requireUser(context) };
  }
  throw new SupportTicketForbiddenError("support ticket requester access requires customer or worker role");
}

function requireAdminRead(context: RequestContext): void {
  if (context.appType !== "admin" || !["admin", "operator", "auditor"].includes(context.role)) {
    throw new SupportTicketForbiddenError("support ticket read access requires an admin-scoped role");
  }
}

function requireAdminWrite(context: RequestContext): void {
  if (context.appType !== "admin" || !["admin", "operator"].includes(context.role)) {
    throw new SupportTicketForbiddenError("support ticket operations require admin or operator role");
  }
}

function parseBody<T>(schema: { safeParse: (value: unknown) =>
  { success: true; data: T } | { success: false; error: { flatten: () => unknown } } }, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new SupportTicketValidationError(JSON.stringify(parsed.error.flatten()));
  return parsed.data;
}

function sameCreate(existing: SupportTicket, input: CreateSupportTicketRequest, relatedWorkerId: string | null): boolean {
  return existing.type === input.type && existing.priority === input.priority
    && existing.subject === input.subject && existing.description === input.description
    && existing.relatedOrderId === (input.relatedOrderId ?? null)
    && existing.relatedWorkerId === relatedWorkerId
    && existing.linkedAftersaleComplaintId === (input.linkedAftersaleComplaintId ?? null);
}

function encodeCursor(ticket: SupportTicket): string {
  return Buffer.from(JSON.stringify({ createdAt: ticket.createdAt, ticketId: ticket.ticketId }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): TicketCursor | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))
      || typeof value.ticketId !== "string" || !value.ticketId || value.ticketId.length > 64) throw new Error();
    return { createdAt: value.createdAt, ticketId: value.ticketId };
  } catch {
    throw new SupportTicketValidationError("invalid support ticket cursor");
  }
}

export class SupportTicketService {
  constructor(
    private readonly repository: SupportTicketRepository = supportTicketRepository,
    private readonly referenceReader: SupportDomainReferenceReader = supportDomainReferenceReader,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  private async validateReferences(connection: PoolConnection, input: {
    cityCode: CityCode; identity: RequesterIdentity; request: CreateSupportTicketRequest; relatedWorkerId: string | null;
  }): Promise<void> {
    const { cityCode, identity, request, relatedWorkerId } = input;
    if (identity.source === "worker") {
      if ((request.relatedWorkerId && request.relatedWorkerId !== identity.requesterId)
        || relatedWorkerId !== identity.requesterId) {
        throw new SupportTicketForbiddenError("worker tickets may only reference the authenticated worker");
      }
      if (!await this.referenceReader.hasEnabledWorkerBinding(connection, cityCode, identity.requesterId)) {
        throw new SupportTicketForbiddenError("worker is not enabled in the requested city");
      }
    } else if (relatedWorkerId
      && !await this.referenceReader.hasEnabledWorkerBinding(connection, cityCode, relatedWorkerId)) {
      throw new SupportTicketNotFoundError("related worker was not found in this city");
    }
    if (identity.source === "customer" && relatedWorkerId && !request.relatedOrderId) {
      throw new SupportTicketValidationError("customer relatedWorkerId requires an owned relatedOrderId");
    }

    if (request.relatedOrderId) {
      const order = await this.referenceReader.loadOwnedOrder(connection, {
        cityCode, orderId: request.relatedOrderId, source: identity.source, requesterId: identity.requesterId,
      });
      if (!order) throw new SupportTicketNotFoundError("related order was not found for this requester in this city");
      if (identity.source === "customer" && relatedWorkerId && order.workerId !== relatedWorkerId) {
        throw new SupportTicketForbiddenError("related worker is not assigned to the related order");
      }
    }
    if (request.linkedAftersaleComplaintId) {
      if (identity.source !== "customer") {
        throw new SupportTicketForbiddenError("only the owning customer may link an aftersale complaint");
      }
      const complaint = await this.referenceReader.loadComplaint(connection, {
        cityCode, complaintId: request.linkedAftersaleComplaintId, orderId: request.relatedOrderId!,
        customerId: identity.requesterId,
      });
      if (!complaint) throw new SupportTicketNotFoundError("linked complaint was not found for the same city, order, and owner");
    }
  }

  private async insertEvent(connection: PoolConnection, input: {
    cityCode: CityCode; ticketId: string; eventType: SupportTicketEventType; context: RequestContext;
    visibility: SupportTicketEventVisibility; content: string | null; payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<SupportTicketEvent> {
    const ticketEventId = generateSupportTicketEventId();
    await this.repository.insertEvent(connection, {
      ticketEventId, cityCode: input.cityCode, ticketId: input.ticketId, eventType: input.eventType,
      actorType: input.context.role as SupportTicketActorType, actorId: requireUser(input.context),
      visibility: input.visibility, content: input.content, payload: input.payload,
      idempotencyKey: input.idempotencyKey,
    });
    return this.repository.findEventById(connection, input.cityCode, ticketEventId);
  }

  private assertIdempotentEvent(existing: SupportTicketEvent, expectedType: SupportTicketEventType): void {
    if (existing.eventType !== expectedType) {
      throw new SupportTicketConflictError("idempotency key was used for a different ticket mutation");
    }
  }

  private assertCanonicalReplay(existing: SupportTicketEvent, expected: {
    eventType: SupportTicketEventType;
    content?: string | null;
    visibility?: SupportTicketEventVisibility;
    payload?: Record<string, unknown>;
  }): void {
    this.assertIdempotentEvent(existing, expected.eventType);
    if (expected.content !== undefined && existing.content !== expected.content) {
      throw new SupportTicketConflictError("idempotency key was used with different content");
    }
    if (expected.visibility !== undefined && existing.visibility !== expected.visibility) {
      throw new SupportTicketConflictError("idempotency key was used with different visibility");
    }
    for (const [key, value] of Object.entries(expected.payload ?? {})) {
      if (existing.payload[key] !== value) {
        throw new SupportTicketConflictError("idempotency key was used with different mutation parameters");
      }
    }
  }

  private async insertOutbox(connection: PoolConnection, ticket: SupportTicket, eventType: OutboxEventType, context: RequestContext): Promise<void> {
    const payload: SupportTicketOutboxEventPayload = {
      ticketId: ticket.ticketId, cityCode: ticket.cityCode, source: ticket.source, type: ticket.type,
      priority: ticket.priority, status: ticket.status, requesterId: ticket.requesterId,
      actorId: requireUser(context), version: ticket.version, occurredAt: new Date().toISOString(),
    };
    await this.outbox.insertEvent(connection, {
      eventId: generateEventId(), eventType, aggregateType: "support_ticket", aggregateId: ticket.ticketId,
      cityCode: ticket.cityCode, payload: { ...payload },
    });
  }

  async create(context: RequestContext, body: unknown): Promise<{ ticket: SupportTicket }> {
    const cityCode = requireCity(context);
    const identity = requesterIdentity(context);
    const input = parseBody<CreateSupportTicketRequest>(createSupportTicketRequestSchema, body);
    const relatedWorkerId = identity.source === "worker" ? identity.requesterId : input.relatedWorkerId ?? null;
    const attempt = () => this.transactionRunner(async (connection) => {
      const existing = await this.repository.findByCreateIdempotencyForUpdate(
        connection, cityCode, identity.source, identity.requesterId, input.idempotencyKey,
      );
      if (existing) {
        if (!sameCreate(existing, input, relatedWorkerId)) throw new SupportTicketConflictError("idempotency key was used for a different ticket");
        return { ticket: existing };
      }
      await this.validateReferences(connection, { cityCode, identity, request: input, relatedWorkerId });
      const ticketId = generateSupportTicketId();
      await this.repository.insertTicket(connection, {
        ticketId, cityCode, source: identity.source, requesterId: identity.requesterId,
        type: input.type, priority: input.priority, subject: input.subject, description: input.description,
        relatedOrderId: input.relatedOrderId ?? null, relatedWorkerId,
        linkedAftersaleComplaintId: input.linkedAftersaleComplaintId ?? null, idempotencyKey: input.idempotencyKey,
      });
      const ticket = (await this.repository.findForUpdate(connection, cityCode, ticketId))!;
      await this.insertEvent(connection, {
        cityCode, ticketId, eventType: "created", context, visibility: "all", content: input.description,
        payload: { status: "open", version: ticket.version }, idempotencyKey: input.idempotencyKey,
      });
      await this.insertOutbox(connection, ticket, "support.ticket.created", context);
      return { ticket };
    });
    try {
      return await attempt();
    } catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      return this.transactionRunner(async (connection) => {
        const existing = await this.repository.findByCreateIdempotencyForUpdate(
          connection, cityCode, identity.source, identity.requesterId, input.idempotencyKey,
        );
        if (!existing) throw error;
        if (!sameCreate(existing, input, relatedWorkerId)) {
          throw new SupportTicketConflictError("idempotency key was used for a different ticket");
        }
        return { ticket: existing };
      });
    }
  }

  async listRequester(context: RequestContext, query: unknown): Promise<{ tickets: SupportTicket[]; nextCursor: string | null }> {
    const cityCode = requireCity(context);
    const identity = requesterIdentity(context);
    const filters = parseBody<SupportTicketListFilters>(supportTicketListFiltersSchema, query);
    const limit = filters.limit ?? 20;
    const tickets = await this.repository.listTickets(context, cityCode,
      { ...filters, source: undefined, requesterId: undefined }, limit, decodeCursor(filters.cursor), identity);
    return { tickets, nextCursor: tickets.length === limit ? encodeCursor(tickets[tickets.length - 1]!) : null };
  }

  async listAdmin(context: RequestContext, query: unknown): Promise<{ tickets: SupportTicket[]; nextCursor: string | null }> {
    requireAdminRead(context);
    const cityCode = requireCity(context);
    const filters = parseBody<SupportTicketListFilters>(supportTicketListFiltersSchema, query);
    const limit = filters.limit ?? 20;
    const tickets = await this.repository.listTickets(context, cityCode, filters, limit, decodeCursor(filters.cursor));
    return { tickets, nextCursor: tickets.length === limit ? encodeCursor(tickets[tickets.length - 1]!) : null };
  }

  async getRequester(context: RequestContext, ticketId: string): Promise<SupportTicketDetail> {
    const cityCode = requireCity(context);
    const identity = requesterIdentity(context);
    const ticket = await this.repository.findTicket(context, cityCode, ticketId, identity);
    if (!ticket) throw new SupportTicketNotFoundError("support ticket was not found");
    return { ticket, events: await this.repository.listEvents(context, cityCode, ticketId, true) };
  }

  async getAdmin(context: RequestContext, ticketId: string): Promise<SupportTicketDetail> {
    requireAdminRead(context);
    const cityCode = requireCity(context);
    const ticket = await this.repository.findTicket(context, cityCode, ticketId);
    if (!ticket) throw new SupportTicketNotFoundError("support ticket was not found");
    return { ticket, events: await this.repository.listEvents(context, cityCode, ticketId, false) };
  }

  private assertRequesterOwns(ticket: SupportTicket, identity: RequesterIdentity): void {
    if (ticket.source !== identity.source || ticket.requesterId !== identity.requesterId) {
      throw new SupportTicketNotFoundError("support ticket was not found");
    }
  }

  async commentRequester(context: RequestContext, ticketId: string, body: unknown): Promise<SupportTicketMutationResponse> {
    const cityCode = requireCity(context);
    const identity = requesterIdentity(context);
    const input = parseBody<AddSupportTicketCommentRequest>(addSupportTicketCommentRequestSchema, body);
    return this.transactionRunner(async (connection) => {
      const ticket = await this.repository.findForUpdate(connection, cityCode, ticketId);
      if (!ticket) throw new SupportTicketNotFoundError("support ticket was not found");
      this.assertRequesterOwns(ticket, identity);
      const existing = await this.repository.findEventByIdempotencyForUpdate(connection, cityCode, ticketId, input.idempotencyKey);
      if (existing) {
        this.assertCanonicalReplay(existing, { eventType: "commented", content: input.content, visibility: "requester" });
        return { ok: true, ticket, event: existing, idempotent: true };
      }
      if (ticket.status === "closed") throw new SupportTicketConflictError("closed tickets do not accept comments");
      const event = await this.insertEvent(connection, {
        cityCode, ticketId, eventType: "commented", context, visibility: "requester", content: input.content,
        payload: { status: ticket.status, version: ticket.version }, idempotencyKey: input.idempotencyKey,
      });
      return { ok: true, ticket, event, idempotent: false };
    });
  }

  async commentAdmin(context: RequestContext, ticketId: string, body: unknown): Promise<SupportTicketMutationResponse> {
    requireAdminWrite(context);
    const cityCode = requireCity(context);
    const input = parseBody<AdminAddSupportTicketCommentRequest>(adminAddSupportTicketCommentRequestSchema, body);
    return this.transactionRunner(async (connection) => {
      let ticket = await this.repository.findForUpdate(connection, cityCode, ticketId);
      if (!ticket) throw new SupportTicketNotFoundError("support ticket was not found");
      const existing = await this.repository.findEventByIdempotencyForUpdate(connection, cityCode, ticketId, input.idempotencyKey);
      if (existing) {
        this.assertCanonicalReplay(existing, { eventType: "commented", content: input.content, visibility: input.visibility });
        return { ok: true, ticket, event: existing, idempotent: true };
      }
      if (ticket.status === "closed") throw new SupportTicketConflictError("closed tickets do not accept comments");
      if (ticket.firstRespondedAt === null) {
        if (!await this.repository.markFirstResponse(connection, { cityCode, ticketId, expectedVersion: ticket.version })) {
          throw new SupportTicketConflictError("support ticket version conflict");
        }
        ticket = (await this.repository.findForUpdate(connection, cityCode, ticketId))!;
      }
      const event = await this.insertEvent(connection, {
        cityCode, ticketId, eventType: "commented", context, visibility: input.visibility, content: input.content,
        payload: { status: ticket.status, version: ticket.version }, idempotencyKey: input.idempotencyKey,
      });
      return { ok: true, ticket, event, idempotent: false };
    });
  }

  async reopen(context: RequestContext, ticketId: string, body: unknown): Promise<SupportTicketMutationResponse> {
    const cityCode = requireCity(context);
    const identity = requesterIdentity(context);
    const input = parseBody<ReopenSupportTicketRequest>(reopenSupportTicketRequestSchema, body);
    return this.transactionRunner(async (connection) => {
      let ticket = await this.repository.findForUpdate(connection, cityCode, ticketId);
      if (!ticket) throw new SupportTicketNotFoundError("support ticket was not found");
      this.assertRequesterOwns(ticket, identity);
      const existing = await this.repository.findEventByIdempotencyForUpdate(connection, cityCode, ticketId, input.idempotencyKey);
      if (existing) {
        this.assertCanonicalReplay(existing, { eventType: "reopened", content: input.reason ?? null });
        return { ok: true, ticket, event: existing, idempotent: true };
      }
      if (ticket.status !== "resolved") {
        throw new SupportTicketConflictError("only resolved tickets may be reopened");
      }
      assertSupportTicketTransition(ticket.status, "processing");
      if (!await this.repository.updateStatusCas(connection, {
        cityCode, ticketId, status: "processing", expectedVersion: ticket.version,
      })) throw new SupportTicketConflictError("support ticket version conflict");
      ticket = (await this.repository.findForUpdate(connection, cityCode, ticketId))!;
      const event = await this.insertEvent(connection, {
        cityCode, ticketId, eventType: "reopened", context, visibility: "all", content: input.reason ?? null,
        payload: { from: "resolved", to: "processing", version: ticket.version }, idempotencyKey: input.idempotencyKey,
      });
      await this.insertOutbox(connection, ticket, "support.ticket.reopened", context);
      return { ok: true, ticket, event, idempotent: false };
    });
  }

  async assign(context: RequestContext, ticketId: string, body: unknown): Promise<SupportTicketMutationResponse> {
    requireAdminWrite(context);
    const cityCode = requireCity(context);
    const input = parseBody<AssignSupportTicketRequest>(assignSupportTicketRequestSchema, body);
    return this.transactionRunner(async (connection) => {
      let ticket = await this.repository.findForUpdate(connection, cityCode, ticketId);
      if (!ticket) throw new SupportTicketNotFoundError("support ticket was not found");
      const existing = await this.repository.findEventByIdempotencyForUpdate(connection, cityCode, ticketId, input.idempotencyKey);
      if (existing) {
        this.assertCanonicalReplay(existing, {
          eventType: "assigned", payload: { assignedAgentId: input.assignedAgentId, expectedVersion: input.expectedVersion },
        });
        return { ok: true, ticket, event: existing, idempotent: true };
      }
      if (ticket.version !== input.expectedVersion) throw new SupportTicketConflictError("support ticket version conflict");
      if (["resolved", "closed"].includes(ticket.status)) {
        throw new SupportTicketConflictError("resolved or closed tickets cannot be assigned");
      }
      const targetStatus = ticket.status === "open" ? "processing" : ticket.status;
      if (ticket.status === "open") assertSupportTicketTransition(ticket.status, targetStatus);
      if (!await this.referenceReader.isAssignableAgent(
        connection, cityCode, input.assignedAgentId, ticket.assignedSkillGroupId,
      )) {
        throw new SupportTicketForbiddenError(ticket.assignedSkillGroupId
          ? "assigned agent must have an active Support profile in the ticket skill group"
          : "assigned agent is not a current admin/operator with explicit scope for this city");
      }
      const from = ticket.status;
      if (!await this.repository.updateAssignmentCas(connection, {
        cityCode, ticketId, assignedAgentId: input.assignedAgentId, status: targetStatus,
        expectedVersion: input.expectedVersion,
      })) throw new SupportTicketConflictError("support ticket version conflict");
      ticket = (await this.repository.findForUpdate(connection, cityCode, ticketId))!;
      const event = await this.insertEvent(connection, {
        cityCode, ticketId, eventType: "assigned", context, visibility: "internal", content: null,
        payload: { assignedAgentId: input.assignedAgentId, expectedVersion: input.expectedVersion,
          from, to: ticket.status, version: ticket.version },
        idempotencyKey: input.idempotencyKey,
      });
      await this.insertOutbox(connection, ticket, "support.ticket.assigned", context);
      return { ok: true, ticket, event, idempotent: false };
    });
  }

  private async statusMutation(context: RequestContext, ticketId: string, input: {
    status: SupportTicketStatus; expectedVersion: number; idempotencyKey: string;
    eventType: SupportTicketEventType; outboxType: OutboxEventType; content: string | null;
    visibility: SupportTicketEventVisibility; resolutionCode?: string;
  }): Promise<SupportTicketMutationResponse> {
    requireAdminWrite(context);
    const cityCode = requireCity(context);
    return this.transactionRunner(async (connection) => {
      let ticket = await this.repository.findForUpdate(connection, cityCode, ticketId);
      if (!ticket) throw new SupportTicketNotFoundError("support ticket was not found");
      const existing = await this.repository.findEventByIdempotencyForUpdate(connection, cityCode, ticketId, input.idempotencyKey);
      if (existing) {
        this.assertCanonicalReplay(existing, {
          eventType: input.eventType, content: input.content,
          payload: { expectedVersion: input.expectedVersion, resolutionCode: input.resolutionCode ?? null },
        });
        return { ok: true, ticket, event: existing, idempotent: true };
      }
      if (ticket.version !== input.expectedVersion) throw new SupportTicketConflictError("support ticket version conflict");
      assertSupportTicketTransition(ticket.status, input.status);
      const from = ticket.status;
      if (input.status === "resolved" && ticket.linkedAftersaleComplaintId && ticket.relatedOrderId) {
        const complaint = await this.referenceReader.loadComplaint(connection, {
          cityCode, complaintId: ticket.linkedAftersaleComplaintId, orderId: ticket.relatedOrderId,
        });
        if (!complaint || !["resolved", "closed"].includes(complaint.status)) {
          throw new SupportTicketConflictError("linked aftersale complaint must be resolved before the ticket");
        }
      }
      if (!await this.repository.updateStatusCas(connection, {
        cityCode, ticketId, status: input.status, expectedVersion: input.expectedVersion,
        resolutionCode: input.resolutionCode,
      })) throw new SupportTicketConflictError("support ticket version conflict");
      ticket = (await this.repository.findForUpdate(connection, cityCode, ticketId))!;
      const event = await this.insertEvent(connection, {
        cityCode, ticketId, eventType: input.eventType, context, visibility: input.visibility, content: input.content,
        payload: { from, to: ticket.status, expectedVersion: input.expectedVersion,
          resolutionCode: input.resolutionCode ?? null, version: ticket.version },
        idempotencyKey: input.idempotencyKey,
      });
      await this.insertOutbox(connection, ticket, input.outboxType, context);
      return { ok: true, ticket, event, idempotent: false };
    });
  }

  async escalate(context: RequestContext, ticketId: string, body: unknown): Promise<SupportTicketMutationResponse> {
    const input = parseBody<EscalateSupportTicketRequest>(escalateSupportTicketRequestSchema, body);
    return this.statusMutation(context, ticketId, {
      status: "escalated", expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey,
      eventType: "escalated", outboxType: "support.ticket.escalated", content: input.reason, visibility: "all",
    });
  }

  async resolve(context: RequestContext, ticketId: string, body: unknown): Promise<SupportTicketMutationResponse> {
    const input = parseBody<ResolveSupportTicketRequest>(resolveSupportTicketRequestSchema, body);
    return this.statusMutation(context, ticketId, {
      status: "resolved", expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey,
      eventType: "resolved", outboxType: "support.ticket.resolved", content: input.resolutionNote ?? null,
      visibility: "all", resolutionCode: input.resolutionCode,
    });
  }

  async close(context: RequestContext, ticketId: string, body: unknown): Promise<SupportTicketMutationResponse> {
    const input = parseBody<CloseSupportTicketRequest>(closeSupportTicketRequestSchema, body);
    return this.statusMutation(context, ticketId, {
      status: "closed", expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey,
      eventType: "closed", outboxType: "support.ticket.closed", content: input.reason ?? null, visibility: "all",
    });
  }
}

export const supportTicketService = new SupportTicketService();
