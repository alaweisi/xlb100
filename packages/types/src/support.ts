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
  | "claimed"
  | "status_changed"
  | "escalated"
  | "resolved"
  | "reopened"
  | "closed"
  | "sla_breached";

export type SupportSlaBreachKind = "first_response" | "resolution";
export type SupportTicketWorkbenchView = "mine" | "skill_group" | "all";
export type SupportTicketWorkbenchSort = "sla_due";

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
  routingLanguage: string | null;
  slaFirstResponseDueAt: string | null;
  slaResolutionDueAt: string | null;
  firstRespondedAt: string | null;
  slaFirstResponseBreachedAt: string | null;
  slaResolutionBreachedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type SupportConversationSource = "customer" | "worker" | "enterprise";
export type SupportConversationStatus = "queueing" | "active" | "transferred" | "closed";
export type SupportConversationParticipantType = "customer" | "worker" | "agent";
export type SupportMessageSenderType = SupportConversationParticipantType | "system";
export type SupportMessageType = "text" | "image" | "system";

export interface SupportConversation {
  conversationId: string;
  cityCode: CityCode;
  source: SupportConversationSource;
  requesterId: string;
  businessClientId: string | null;
  status: SupportConversationStatus;
  assignedAgentId: string | null;
  linkedTicketId: string | null;
  lastServerSeq: number;
  version: number;
  startedAt: string;
  acceptedAt: string | null;
  transferredAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  messageId: string;
  cityCode: CityCode;
  conversationId: string;
  senderType: SupportMessageSenderType;
  senderId: string | null;
  clientMessageId: string;
  serverSeq: number;
  messageType: SupportMessageType;
  textContent: string | null;
  mediaAssetId: string | null;
  createdAt: string;
}

export interface CreateSupportConversationRequest { linkedTicketId?: string; idempotencyKey: string; }
export interface SendSupportMessageRequest {
  clientMessageId: string;
  messageType: "text" | "image";
  textContent?: string;
  mediaAssetId?: string;
  idempotencyKey: string;
}
export interface MarkSupportConversationReadRequest { lastReadServerSeq: number; expectedVersion: number; idempotencyKey: string; }
export interface AcceptSupportConversationRequest { expectedVersion: number; idempotencyKey: string; }
export interface TransferSupportConversationRequest { assignedAgentId: string; expectedVersion: number; idempotencyKey: string; }
export interface CloseSupportConversationRequest { reason?: string; expectedVersion: number; idempotencyKey: string; }
export interface SupportConversationListFilters { status?: SupportConversationStatus; view?: "mine" | "queue" | "all"; cursor?: string; limit?: number; }
export interface SupportMessageListFilters { afterSeq?: number; limit?: number; }
export interface SupportConversationResponse { ok: true; conversation: SupportConversation; }
export interface SupportConversationListResponse { ok: true; conversations: SupportConversation[]; nextCursor: string | null; }
export interface SupportConversationDetailResponse { ok: true; conversation: SupportConversation; messages: SupportMessage[]; }
export interface SupportMessageResponse { ok: true; message: SupportMessage; idempotent: boolean; }
export interface SupportMessageListResponse { ok: true; messages: SupportMessage[]; nextAfterSeq: number | null; hasMore: boolean; }
export interface SupportRealtimeTicketResponse { ok: true; ticket: string; expiresAt: string; }

export type SupportRealtimeClientFrame =
  | { type: "subscribe"; protocolVersion: 1; requestId: string; conversationId: string; afterSeq: number }
  | { type: "send_message"; protocolVersion: 1; requestId: string; conversationId: string; clientMessageId: string; messageType: "text" | "image"; textContent?: string; mediaAssetId?: string }
  | { type: "mark_read"; protocolVersion: 1; requestId: string; conversationId: string; lastReadServerSeq: number }
  | { type: "ping"; protocolVersion: 1; requestId: string };

export type SupportRealtimeServerFrame =
  | { type: "ready"; protocolVersion: 1; connectionId: string; serverTime: string }
  | { type: "catchup"; protocolVersion: 1; requestId: string; conversationId: string; messages: SupportMessage[]; hasMore: boolean }
  | { type: "message_created"; protocolVersion: 1; conversationId: string; message: SupportMessage }
  | { type: "conversation_updated"; protocolVersion: 1; conversation: SupportConversation }
  | { type: "message_ack"; protocolVersion: 1; requestId: string; message: SupportMessage; idempotent: boolean }
  | { type: "error"; protocolVersion: 1; requestId?: string; code: string; message: string }
  | { type: "pong"; protocolVersion: 1; requestId: string; serverTime: string };

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
  /** Optional canonical BCP-47-like routing preference; it is not identity metadata. */
  preferredLanguage?: string;
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

export interface ClaimSupportTicketRequest {
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
  view?: SupportTicketWorkbenchView;
  sort?: SupportTicketWorkbenchSort;
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

export interface SupportSlaBreachedOutboxEventPayload {
  ticketId: string;
  cityCode: CityCode;
  breachKind: SupportSlaBreachKind;
  dueAt: string;
  oldPriority: SupportTicketPriority;
  newPriority: SupportTicketPriority;
  version: number;
}

export type SupportAgentLifecycleStatus = "active" | "suspended";
export type SupportAgentWorkStatus = "offline" | "online" | "busy";

export interface SupportAgent {
  agentId: string;
  cityCode: CityCode;
  adminUserId: string;
  displayName: string;
  lifecycleStatus: SupportAgentLifecycleStatus;
  workStatus: SupportAgentWorkStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportSkillGroup {
  skillGroupId: string;
  cityCode: CityCode;
  name: string;
  matchedTypes: SupportTicketType[];
  matchedLanguages: string[];
  priorityWeight: number;
  isDefault: boolean;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportAgentSkillGroupMembership {
  cityCode: CityCode;
  agentId: string;
  skillGroupId: string;
  proficiency: number;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportAgentRequest {
  adminUserId: string;
  displayName: string;
  lifecycleStatus?: SupportAgentLifecycleStatus;
  workStatus?: SupportAgentWorkStatus;
  idempotencyKey: string;
}

export interface UpdateSupportAgentRequest {
  displayName?: string;
  lifecycleStatus?: SupportAgentLifecycleStatus;
  workStatus?: SupportAgentWorkStatus;
  expectedVersion: number;
  idempotencyKey: string;
}

/** DELETE is a versioned soft delete that sets lifecycleStatus=suspended. */
export interface DeleteSupportAgentRequest {
  expectedVersion: number;
  idempotencyKey: string;
}

export interface SupportAgentListFilters {
  lifecycleStatus?: SupportAgentLifecycleStatus;
  workStatus?: SupportAgentWorkStatus;
  adminUserId?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateSupportSkillGroupRequest {
  name: string;
  matchedTypes: SupportTicketType[];
  matchedLanguages: string[];
  priorityWeight?: number;
  isDefault?: boolean;
  isActive?: boolean;
  idempotencyKey: string;
}

export interface UpdateSupportSkillGroupRequest {
  name?: string;
  matchedTypes?: SupportTicketType[];
  matchedLanguages?: string[];
  priorityWeight?: number;
  isDefault?: boolean;
  isActive?: boolean;
  expectedVersion: number;
  idempotencyKey: string;
}

/** DELETE is a versioned soft delete that sets isActive=false. */
export interface DeleteSupportSkillGroupRequest {
  expectedVersion: number;
  idempotencyKey: string;
}

export interface SupportSkillGroupListFilters {
  isActive?: boolean;
  isDefault?: boolean;
  cursor?: string;
  limit?: number;
}

export interface AddSupportAgentSkillGroupRequest {
  skillGroupId: string;
  proficiency?: number;
  isPrimary?: boolean;
  expectedAgentVersion: number;
  idempotencyKey: string;
}

export interface RemoveSupportAgentSkillGroupRequest {
  expectedAgentVersion: number;
  idempotencyKey: string;
}

export interface SupportAgentResponse {
  ok: true;
  agent: SupportAgent;
}

export interface SupportAgentListResponse {
  ok: true;
  agents: SupportAgent[];
  nextCursor: string | null;
}

export interface SupportSkillGroupResponse {
  ok: true;
  skillGroup: SupportSkillGroup;
}

export interface SupportSkillGroupListResponse {
  ok: true;
  skillGroups: SupportSkillGroup[];
  nextCursor: string | null;
}

export interface SupportAgentSkillGroupResponse extends SupportAgentResponse {
  membership: SupportAgentSkillGroupMembership;
}

export interface SupportAgentSkillGroupListResponse {
  ok: true;
  memberships: SupportAgentSkillGroupMembership[];
}

export interface RemoveSupportAgentSkillGroupResponse extends SupportAgentResponse {
  removedSkillGroupId: string;
}

export interface SupportSlaPolicy {
  policyId: string;
  policySeriesId: string;
  revision: number;
  supersedesPolicyId: string | null;
  cityCode: CityCode;
  type: SupportTicketType;
  priority: SupportTicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportSlaPolicyRequest {
  type: SupportTicketType;
  priority: SupportTicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
  idempotencyKey: string;
}

/** Creates an append-only revision; the referenced revision is never overwritten. */
export interface ReviseSupportSlaPolicyRequest {
  firstResponseMinutes?: number;
  resolutionMinutes?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  expectedVersion: number;
  idempotencyKey: string;
}

export type UpdateSupportSlaPolicyRequest = ReviseSupportSlaPolicyRequest;

export interface SupportSlaPolicyListFilters {
  type?: SupportTicketType;
  priority?: SupportTicketPriority;
  isActive?: boolean;
  effectiveAt?: string;
  cursor?: string;
  limit?: number;
}

export interface SupportSlaPolicyResponse {
  ok: true;
  policy: SupportSlaPolicy;
}

export interface SupportSlaPolicyListResponse {
  ok: true;
  policies: SupportSlaPolicy[];
  nextCursor: string | null;
}

export type SupportQualityTargetType = "ticket" | "conversation";
export interface SubmitSupportCsatRequest { score: 1|2|3|4|5; comment?: string; idempotencyKey: string; }
export interface SupportCsat { csatId:string;cityCode:string;targetType:SupportQualityTargetType;targetId:string;score:number;comment:string|null; }
export interface SupportCsatResponse { ok:true;csat:SupportCsat; }
export interface SupportRubricCriterion { key:string;weight:number;maxScore:number;label?:string; }
export interface CreateSupportQualityRubricRequest { name:string;criteria:SupportRubricCriterion[]; }
export interface SupportQualityRubric { rubricId:string;rubricVersionId:string;name:string;criteria:SupportRubricCriterion[];contentHash:string; }
export interface SupportQualityRubricResponse { ok:true;rubric:SupportQualityRubric; }
export interface CreateSupportQualityReviewRequest { targetType:SupportQualityTargetType;targetId:string;rubricVersionId:string;criterionScores:Record<string,number>;finding?:string;idempotencyKey:string; }
export interface SupportQualityReview { qualityReviewId:string;overallScore:number;rubricSnapshot:SupportRubricCriterion[];rubricContentHash:string; }
export interface SupportQualityReviewResponse { ok:true;review:SupportQualityReview; }
export interface SupportQualityDashboard { response_count:number|string;average_score:number|string;score_1:number|string;score_2:number|string;score_3:number|string;score_4:number|string;score_5:number|string;review_count:number|string;average_review_score:number|string; }
export interface SupportQualityDashboardResponse { ok:true;dashboard:SupportQualityDashboard; }

export type SupportKbArticleStatus = "draft" | "published" | "archived";
export type SupportKbReviewStatus = "draft" | "pending_review" | "approved" | "rejected";
export type SupportKbReviewAction = "submitted" | "approved" | "rejected" | "published" | "archived";
export interface SupportKbArticle {
  articleId: string; cityCode: CityCode; slug: string; language: string;
  lifecycleStatus: SupportKbArticleStatus; currentDraftVersionId: string | null;
  publishedVersionId: string | null; version: number; createdByAdminId: string;
}
export interface SupportKbArticleVersion {
  articleVersionId: string; cityCode: CityCode; articleId: string; revision: number;
  title: string; summary: string | null; bodyMarkdown: string; keywords: string[]; intentTags: string[];
  reviewStatus: SupportKbReviewStatus; createdByAdminId: string; contentSha256: string;
}
export interface CreateSupportKbArticleRequest {
  slug: string; language: string; categoryId?: string; skuId?: string; title: string; summary?: string;
  bodyMarkdown: string; keywords: string[]; intentTags: string[]; idempotencyKey: string;
}
export interface CreateSupportKbRevisionRequest {
  expectedVersion: number; title: string; summary?: string; bodyMarkdown: string;
  keywords: string[]; intentTags: string[]; idempotencyKey: string;
}
export interface ReviewSupportKbRevisionRequest { note?: string; idempotencyKey: string; }
export interface PublishSupportKbRevisionRequest { versionId: string; expectedVersion: number; idempotencyKey: string; }
export interface SupportKbMutationResponse { ok: true; article: SupportKbArticle; version: SupportKbArticleVersion; idempotent?: boolean; }

export type SupportBotProvider = "deterministic" | "mock";
export type SupportBotProviderStatus = "matched_local" | "no_match_local" | "forced_mock";
export type SupportBotDecision = "reply" | "hand_off" | "no_match";
export interface SupportBotRun {
  botRunId: string; cityCode: CityCode; conversationId: string; triggerMessageId: string;
  provider: SupportBotProvider; providerStatus: SupportBotProviderStatus; externalProviderExecuted: false;
  providerRuleVersion: string; intent: string | null; confidenceBasisPoints: number;
  sensitiveClassification: string | null; decision: SupportBotDecision; reasonCodes: string[];
  matchedArticleVersionIds: string[]; responseMessageId: string | null;
}
export interface SupportBotRunResponse { ok: true; run: SupportBotRun; }
