import type { CityCode } from "./city.js";

export type SupportTicketSource =
  | "customer"
  | "worker"
  | "enterprise"
  | "admin"
  | "system";

export type SupportTicketType =
  | "order_question"
  | "order_dispute"
  | "service_complaint"
  | "withdrawal_issue"
  | "account_issue"
  | "safety"
  | "other";

export type SupportTicketPriority = "low" | "normal" | "high" | "urgent" | "critical";

export type SupportTicketStatus =
  | "open"
  | "processing"
  | "waiting_requester"
  | "escalated"
  | "resolved"
  | "closed";

export type SupportTicketEventType =
  | "created"
  | "commented"
  | "assigned"
  | "status_changed"
  | "escalated"
  | "resolved"
  | "reopened"
  | "closed";

export type SupportTicketActorType =
  | "customer"
  | "worker"
  | "admin"
  | "operator"
  | "system"
  | "bot";

export type SupportTicketEventVisibility = "requester" | "internal" | "all";

export interface SupportTicket {
  ticketId: string;
  cityCode: CityCode;
  source: SupportTicketSource;
  requesterId: string;
  businessClientId: string | null;
  type: SupportTicketType;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  subject: string;
  description: string;
  relatedOrderId: string | null;
  relatedWorkerId: string | null;
  linkedAftersaleComplaintId: string | null;
  assignedAgentId: string | null;
  assignedSkillGroupId: string | null;
  slaFirstResponseDueAt: string | null;
  slaResolutionDueAt: string | null;
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketEvent {
  ticketEventId: string;
  cityCode: CityCode;
  ticketId: string;
  eventType: SupportTicketEventType;
  actorType: SupportTicketActorType;
  actorId: string | null;
  visibility: SupportTicketEventVisibility;
  content: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  events: SupportTicketEvent[];
}

export interface CreateSupportTicketRequest {
  type: SupportTicketType;
  priority: SupportTicketPriority;
  subject: string;
  description: string;
  relatedOrderId?: string;
  relatedWorkerId?: string;
  linkedAftersaleComplaintId?: string;
  idempotencyKey: string;
}

export interface AddSupportTicketCommentRequest {
  content: string;
  idempotencyKey: string;
}

export interface AdminAddSupportTicketCommentRequest extends AddSupportTicketCommentRequest {
  visibility: SupportTicketEventVisibility;
}

export interface ReopenSupportTicketRequest {
  reason?: string;
  idempotencyKey: string;
}

export interface AssignSupportTicketRequest {
  assignedAgentId: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface EscalateSupportTicketRequest {
  reason: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface ResolveSupportTicketRequest {
  resolutionCode: string;
  resolutionNote?: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface CloseSupportTicketRequest {
  reason?: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface SupportTicketListFilters {
  source?: SupportTicketSource;
  type?: SupportTicketType;
  priority?: SupportTicketPriority;
  status?: SupportTicketStatus;
  requesterId?: string;
  relatedOrderId?: string;
  assignedAgentId?: string;
  cursor?: string;
  limit?: number;
}

export interface SupportTicketResponse {
  ok: true;
  ticket: SupportTicket;
}

export interface SupportTicketDetailResponse {
  ok: true;
  detail: SupportTicketDetail;
}

export interface SupportTicketListResponse {
  ok: true;
  tickets: SupportTicket[];
  nextCursor: string | null;
}

export interface SupportTicketMutationResponse extends SupportTicketResponse {
  event: SupportTicketEvent;
  idempotent: boolean;
}

export interface SupportTicketOutboxEventPayload {
  ticketId: string;
  cityCode: CityCode;
  source: SupportTicketSource;
  type: SupportTicketType;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  requesterId: string;
  actorId: string | null;
  version: number;
  occurredAt: string;
}
