import type {
  AddSupportTicketCommentRequest, AdminAddSupportTicketCommentRequest, AssignSupportTicketRequest,
  CloseSupportTicketRequest, CreateSupportTicketRequest, EscalateSupportTicketRequest,
  ReopenSupportTicketRequest, ResolveSupportTicketRequest, SupportTicket, SupportTicketDetailResponse,
  SupportTicketEvent, SupportTicketListFilters, SupportTicketListResponse,
  SupportTicketMutationResponse, SupportTicketResponse,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

type JsonObject = Record<string, unknown>;
const SOURCES = ["customer", "worker", "enterprise", "admin", "system"] as const;
const TYPES = ["order_question", "order_dispute", "service_complaint", "withdrawal_issue", "account_issue", "safety", "other"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent", "critical"] as const;
const STATUSES = ["open", "processing", "waiting_requester", "escalated", "resolved", "closed"] as const;
const EVENT_TYPES = ["created", "commented", "assigned", "status_changed", "escalated", "resolved", "reopened", "closed"] as const;
const ACTOR_TYPES = ["customer", "worker", "admin", "operator", "system", "bot"] as const;
const VISIBILITIES = ["requester", "internal", "all"] as const;

function object(value: unknown, label: string): JsonObject { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`); return value as JsonObject; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`); return value; }
function nullableString(value: unknown, label: string): string | null { if (value === null) return null; return string(value, label); }
function integer(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`); return value; }
function boolean(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`); return value; }
function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T { const parsed = string(value, label); if (!(values as readonly string[]).includes(parsed)) throw new TypeError(`${label} has an unsupported value`); return parsed as T; }
function ok(value: unknown, label: string): JsonObject { const parsed = object(value, label); if (parsed.ok !== true) throw new TypeError(`${label}.ok must be true`); return parsed; }

function ticket(value: unknown): SupportTicket {
  const item = object(value, "support ticket");
  string(item.ticketId, "support ticket.ticketId"); string(item.cityCode, "support ticket.cityCode"); oneOf(item.source, SOURCES, "support ticket.source");
  string(item.requesterId, "support ticket.requesterId"); nullableString(item.businessClientId, "support ticket.businessClientId"); oneOf(item.type, TYPES, "support ticket.type");
  oneOf(item.priority, PRIORITIES, "support ticket.priority"); oneOf(item.status, STATUSES, "support ticket.status"); string(item.subject, "support ticket.subject"); string(item.description, "support ticket.description");
  for (const field of ["relatedOrderId", "relatedWorkerId", "linkedAftersaleComplaintId", "assignedAgentId", "assignedSkillGroupId", "slaFirstResponseDueAt", "slaResolutionDueAt", "firstRespondedAt", "resolvedAt", "closedAt", "resolutionCode"] as const) nullableString(item[field], `support ticket.${field}`);
  integer(item.version, "support ticket.version"); string(item.createdAt, "support ticket.createdAt"); string(item.updatedAt, "support ticket.updatedAt"); return value as SupportTicket;
}

function event(value: unknown): SupportTicketEvent {
  const item = object(value, "support ticket event");
  string(item.ticketEventId, "support ticket event.ticketEventId"); string(item.cityCode, "support ticket event.cityCode"); string(item.ticketId, "support ticket event.ticketId");
  oneOf(item.eventType, EVENT_TYPES, "support ticket event.eventType"); oneOf(item.actorType, ACTOR_TYPES, "support ticket event.actorType"); nullableString(item.actorId, "support ticket event.actorId");
  oneOf(item.visibility, VISIBILITIES, "support ticket event.visibility"); nullableString(item.content, "support ticket event.content"); object(item.payload, "support ticket event.payload"); string(item.createdAt, "support ticket event.createdAt"); return value as SupportTicketEvent;
}

export function validateSupportTicketResponse(value: unknown): SupportTicketResponse { const result = ok(value, "support ticket response"); ticket(result.ticket); return value as SupportTicketResponse; }
export function validateSupportTicketDetailResponse(value: unknown): SupportTicketDetailResponse { const result = ok(value, "support ticket detail response"); const detail = object(result.detail, "support ticket detail"); ticket(detail.ticket); if (!Array.isArray(detail.events)) throw new TypeError("support ticket detail.events must be an array"); detail.events.forEach(event); return value as SupportTicketDetailResponse; }
export function validateSupportTicketListResponse(value: unknown): SupportTicketListResponse { const result = ok(value, "support ticket list response"); if (!Array.isArray(result.tickets)) throw new TypeError("support ticket list response.tickets must be an array"); result.tickets.forEach(ticket); nullableString(result.nextCursor, "support ticket list response.nextCursor"); return value as SupportTicketListResponse; }
export function validateSupportTicketMutationResponse(value: unknown): SupportTicketMutationResponse { const result = ok(value, "support ticket mutation response"); ticket(result.ticket); event(result.event); boolean(result.idempotent, "support ticket mutation response.idempotent"); return value as SupportTicketMutationResponse; }

function queryString(filters: SupportTicketListFilters): string { const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value)); const encoded = query.toString(); return encoded ? `?${encoded}` : ""; }
const ticketPath = (base: string, ticketId: string) => `${base}/${encodeURIComponent(ticketId)}`;
const idempotent = { retry: "idempotent" as const };

export function createRequesterSupportApi(client: ApiClient) {
  const base = "/api/support/tickets";
  return {
    createSupportTicket(body: CreateSupportTicketRequest): Promise<SupportTicketResponse> { return client.post(base, body, { ...idempotent, validate: validateSupportTicketResponse }); },
    listSupportTickets(filters: SupportTicketListFilters = {}): Promise<SupportTicketListResponse> { return client.get(`${base}${queryString(filters)}`, { validate: validateSupportTicketListResponse }); },
    getSupportTicket(ticketId: string): Promise<SupportTicketDetailResponse> { return client.get(ticketPath(base, ticketId), { validate: validateSupportTicketDetailResponse }); },
    addSupportTicketComment(ticketId: string, body: AddSupportTicketCommentRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/events`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    reopenSupportTicket(ticketId: string, body: ReopenSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/reopen`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
  };
}

export function createAdminSupportApi(client: ApiClient) {
  const base = "/api/internal/support/tickets";
  return {
    listSupportTickets(filters: SupportTicketListFilters = {}): Promise<SupportTicketListResponse> { return client.get(`${base}${queryString(filters)}`, { validate: validateSupportTicketListResponse }); },
    getSupportTicket(ticketId: string): Promise<SupportTicketDetailResponse> { return client.get(ticketPath(base, ticketId), { validate: validateSupportTicketDetailResponse }); },
    assignSupportTicket(ticketId: string, body: AssignSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/assign`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    addSupportTicketComment(ticketId: string, body: AdminAddSupportTicketCommentRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/events`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    escalateSupportTicket(ticketId: string, body: EscalateSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/escalate`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    resolveSupportTicket(ticketId: string, body: ResolveSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/resolve`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    closeSupportTicket(ticketId: string, body: CloseSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/close`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
  };
}
