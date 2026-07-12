import type {
  AddSupportTicketCommentRequest, AdminAddSupportTicketCommentRequest, AssignSupportTicketRequest,
  ClaimSupportTicketRequest, CloseSupportTicketRequest, CreateSupportTicketRequest, EscalateSupportTicketRequest,
  ReopenSupportTicketRequest, ResolveSupportTicketRequest, SupportTicket, SupportTicketDetailResponse,
  SupportTicketEvent, SupportTicketListFilters, SupportTicketListResponse,
  SupportTicketMutationResponse, SupportTicketResponse,
  AddSupportAgentSkillGroupRequest, CreateSupportAgentRequest, CreateSupportSkillGroupRequest,
  DeleteSupportAgentRequest, DeleteSupportSkillGroupRequest, RemoveSupportAgentSkillGroupRequest,
  RemoveSupportAgentSkillGroupResponse, SupportAgent, SupportAgentListFilters,
  SupportAgentListResponse, SupportAgentResponse, SupportAgentSkillGroupMembership,
  SupportAgentSkillGroupListResponse, SupportAgentSkillGroupResponse, SupportSkillGroup, SupportSkillGroupListFilters,
  SupportSkillGroupListResponse, SupportSkillGroupResponse, UpdateSupportAgentRequest,
  UpdateSupportSkillGroupRequest,
  CreateSupportSlaPolicyRequest, ReviseSupportSlaPolicyRequest, SupportSlaPolicy,
  SupportSlaPolicyListFilters, SupportSlaPolicyListResponse, SupportSlaPolicyResponse,
  AcceptSupportConversationRequest, CloseSupportConversationRequest, CreateSupportConversationRequest,
  MarkSupportConversationReadRequest, SendSupportMessageRequest, SupportConversationDetailResponse,
  SupportConversationListFilters, SupportConversationListResponse, SupportConversationResponse,
  SupportMessageListFilters, SupportMessageListResponse, SupportMessageResponse,
  SupportRealtimeTicketResponse, TransferSupportConversationRequest,
  CreateSupportKbArticleRequest, CreateSupportKbRevisionRequest, PublishSupportKbRevisionRequest,
  ReviewSupportKbRevisionRequest, SupportBotRunResponse, SupportKbMutationResponse,
  SubmitSupportCsatRequest,SupportCsatResponse,CreateSupportQualityRubricRequest,SupportQualityRubricResponse,
  CreateSupportQualityReviewRequest,SupportQualityReviewResponse,SupportQualityDashboardResponse,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

type JsonObject = Record<string, unknown>;
const SOURCES = ["customer", "worker", "enterprise", "admin", "system"] as const;
const TYPES = ["order_question", "order_dispute", "service_complaint", "withdrawal_issue", "account_issue", "safety", "other"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent", "critical"] as const;
const STATUSES = ["open", "processing", "waiting_requester", "escalated", "resolved", "closed"] as const;
const EVENT_TYPES = ["created", "commented", "assigned", "claimed", "status_changed", "escalated", "resolved", "reopened", "closed", "sla_breached"] as const;
const ACTOR_TYPES = ["customer", "worker", "admin", "operator", "system", "bot"] as const;
const VISIBILITIES = ["requester", "internal", "all"] as const;
const AGENT_LIFECYCLE_STATUSES = ["active", "suspended"] as const;
const AGENT_WORK_STATUSES = ["offline", "online", "busy"] as const;

function object(value: unknown, label: string): JsonObject { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`); return value as JsonObject; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`); return value; }
function nullableString(value: unknown, label: string): string | null { if (value === null) return null; return string(value, label); }
function integer(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative integer`); return value; }
function positiveInteger(value: unknown, label: string): number { const parsed = integer(value, label); if (parsed === 0) throw new TypeError(`${label} must be a positive integer`); return parsed; }
function routingLanguage(value: unknown, label: string): string | null { const parsed = nullableString(value, label); if (parsed !== null && !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(parsed)) throw new TypeError(`${label} must be a canonical lowercase language tag`); return parsed; }
function boolean(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`); return value; }
function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T { const parsed = string(value, label); if (!(values as readonly string[]).includes(parsed)) throw new TypeError(`${label} has an unsupported value`); return parsed as T; }
function ok(value: unknown, label: string): JsonObject { const parsed = object(value, label); if (parsed.ok !== true) throw new TypeError(`${label}.ok must be true`); return parsed; }

function ticket(value: unknown): SupportTicket {
  const item = object(value, "support ticket");
  string(item.ticketId, "support ticket.ticketId"); string(item.cityCode, "support ticket.cityCode"); oneOf(item.source, SOURCES, "support ticket.source");
  string(item.requesterId, "support ticket.requesterId"); nullableString(item.businessClientId, "support ticket.businessClientId"); oneOf(item.type, TYPES, "support ticket.type");
  oneOf(item.priority, PRIORITIES, "support ticket.priority"); oneOf(item.status, STATUSES, "support ticket.status"); string(item.subject, "support ticket.subject"); string(item.description, "support ticket.description");
  for (const field of ["relatedOrderId", "relatedWorkerId", "linkedAftersaleComplaintId", "assignedAgentId", "assignedSkillGroupId", "slaFirstResponseDueAt", "slaResolutionDueAt", "firstRespondedAt", "slaFirstResponseBreachedAt", "slaResolutionBreachedAt", "resolvedAt", "closedAt", "resolutionCode"] as const) nullableString(item[field], `support ticket.${field}`);
  routingLanguage(item.routingLanguage, "support ticket.routingLanguage");
  integer(item.version, "support ticket.version"); string(item.createdAt, "support ticket.createdAt"); string(item.updatedAt, "support ticket.updatedAt"); return value as SupportTicket;
}

function event(value: unknown): SupportTicketEvent {
  const item = object(value, "support ticket event");
  string(item.ticketEventId, "support ticket event.ticketEventId"); string(item.cityCode, "support ticket event.cityCode"); string(item.ticketId, "support ticket event.ticketId");
  oneOf(item.eventType, EVENT_TYPES, "support ticket event.eventType"); oneOf(item.actorType, ACTOR_TYPES, "support ticket event.actorType"); nullableString(item.actorId, "support ticket event.actorId");
  oneOf(item.visibility, VISIBILITIES, "support ticket event.visibility"); nullableString(item.content, "support ticket event.content"); object(item.payload, "support ticket event.payload"); string(item.createdAt, "support ticket event.createdAt"); return value as SupportTicketEvent;
}

function agent(value: unknown): SupportAgent {
  const item = object(value, "support agent");
  string(item.agentId, "support agent.agentId"); string(item.cityCode, "support agent.cityCode");
  string(item.adminUserId, "support agent.adminUserId"); string(item.displayName, "support agent.displayName");
  oneOf(item.lifecycleStatus, AGENT_LIFECYCLE_STATUSES, "support agent.lifecycleStatus");
  oneOf(item.workStatus, AGENT_WORK_STATUSES, "support agent.workStatus");
  integer(item.version, "support agent.version"); string(item.createdAt, "support agent.createdAt");
  string(item.updatedAt, "support agent.updatedAt"); return value as SupportAgent;
}

function skillGroup(value: unknown): SupportSkillGroup {
  const item = object(value, "support skill group");
  string(item.skillGroupId, "support skill group.skillGroupId"); string(item.cityCode, "support skill group.cityCode");
  string(item.name, "support skill group.name");
  if (!Array.isArray(item.matchedTypes)) throw new TypeError("support skill group.matchedTypes must be an array");
  item.matchedTypes.forEach((type) => oneOf(type, TYPES, "support skill group.matchedTypes item"));
  if (!Array.isArray(item.matchedLanguages)) throw new TypeError("support skill group.matchedLanguages must be an array");
  item.matchedLanguages.forEach((language) => string(language, "support skill group.matchedLanguages item"));
  if (typeof item.priorityWeight !== "number" || !Number.isSafeInteger(item.priorityWeight)) throw new TypeError("support skill group.priorityWeight must be an integer");
  boolean(item.isDefault, "support skill group.isDefault"); boolean(item.isActive, "support skill group.isActive");
  integer(item.version, "support skill group.version"); string(item.createdAt, "support skill group.createdAt");
  string(item.updatedAt, "support skill group.updatedAt"); return value as SupportSkillGroup;
}

function membership(value: unknown): SupportAgentSkillGroupMembership {
  const item = object(value, "support agent skill-group membership");
  string(item.cityCode, "membership.cityCode"); string(item.agentId, "membership.agentId");
  string(item.skillGroupId, "membership.skillGroupId"); integer(item.proficiency, "membership.proficiency");
  boolean(item.isPrimary, "membership.isPrimary"); boolean(item.isActive, "membership.isActive");
  string(item.createdAt, "membership.createdAt"); string(item.updatedAt, "membership.updatedAt");
  return value as SupportAgentSkillGroupMembership;
}

function slaPolicy(value: unknown): SupportSlaPolicy {
  const item = object(value, "support SLA policy");
  string(item.policyId, "support SLA policy.policyId");
  string(item.policySeriesId, "support SLA policy.policySeriesId");
  const revision = positiveInteger(item.revision, "support SLA policy.revision");
  const supersedesPolicyId = nullableString(item.supersedesPolicyId, "support SLA policy.supersedesPolicyId");
  if ((revision === 1) !== (supersedesPolicyId === null)) throw new TypeError("support SLA policy revision link is invalid");
  string(item.cityCode, "support SLA policy.cityCode");
  oneOf(item.type, TYPES, "support SLA policy.type");
  oneOf(item.priority, PRIORITIES, "support SLA policy.priority");
  const firstResponseMinutes = positiveInteger(item.firstResponseMinutes, "support SLA policy.firstResponseMinutes");
  const resolutionMinutes = positiveInteger(item.resolutionMinutes, "support SLA policy.resolutionMinutes");
  if (resolutionMinutes < firstResponseMinutes) throw new TypeError("support SLA policy resolutionMinutes cannot be shorter than firstResponseMinutes");
  const effectiveFrom = string(item.effectiveFrom, "support SLA policy.effectiveFrom");
  const effectiveTo = nullableString(item.effectiveTo, "support SLA policy.effectiveTo");
  if (!Number.isFinite(Date.parse(effectiveFrom)) || (effectiveTo !== null && (!Number.isFinite(Date.parse(effectiveTo)) || Date.parse(effectiveTo) <= Date.parse(effectiveFrom)))) throw new TypeError("support SLA policy effective window is invalid");
  boolean(item.isActive, "support SLA policy.isActive");
  positiveInteger(item.version, "support SLA policy.version");
  string(item.createdAt, "support SLA policy.createdAt");
  string(item.updatedAt, "support SLA policy.updatedAt");
  return value as SupportSlaPolicy;
}

export function validateSupportTicketResponse(value: unknown): SupportTicketResponse { const result = ok(value, "support ticket response"); ticket(result.ticket); return value as SupportTicketResponse; }
export function validateSupportTicketDetailResponse(value: unknown): SupportTicketDetailResponse { const result = ok(value, "support ticket detail response"); const detail = object(result.detail, "support ticket detail"); ticket(detail.ticket); if (!Array.isArray(detail.events)) throw new TypeError("support ticket detail.events must be an array"); detail.events.forEach(event); return value as SupportTicketDetailResponse; }
export function validateSupportTicketListResponse(value: unknown): SupportTicketListResponse { const result = ok(value, "support ticket list response"); if (!Array.isArray(result.tickets)) throw new TypeError("support ticket list response.tickets must be an array"); result.tickets.forEach(ticket); nullableString(result.nextCursor, "support ticket list response.nextCursor"); return value as SupportTicketListResponse; }
export function validateSupportTicketMutationResponse(value: unknown): SupportTicketMutationResponse { const result = ok(value, "support ticket mutation response"); ticket(result.ticket); event(result.event); boolean(result.idempotent, "support ticket mutation response.idempotent"); return value as SupportTicketMutationResponse; }
export function validateSupportAgentResponse(value: unknown): SupportAgentResponse { const result = ok(value, "support agent response"); agent(result.agent); return value as SupportAgentResponse; }
export function validateSupportAgentListResponse(value: unknown): SupportAgentListResponse { const result = ok(value, "support agent list response"); if (!Array.isArray(result.agents)) throw new TypeError("support agent list response.agents must be an array"); result.agents.forEach(agent); nullableString(result.nextCursor, "support agent list response.nextCursor"); return value as SupportAgentListResponse; }
export function validateSupportSkillGroupResponse(value: unknown): SupportSkillGroupResponse { const result = ok(value, "support skill-group response"); skillGroup(result.skillGroup); return value as SupportSkillGroupResponse; }
export function validateSupportSkillGroupListResponse(value: unknown): SupportSkillGroupListResponse { const result = ok(value, "support skill-group list response"); if (!Array.isArray(result.skillGroups)) throw new TypeError("support skill-group list response.skillGroups must be an array"); result.skillGroups.forEach(skillGroup); nullableString(result.nextCursor, "support skill-group list response.nextCursor"); return value as SupportSkillGroupListResponse; }
export function validateSupportAgentSkillGroupResponse(value: unknown): SupportAgentSkillGroupResponse { const result = ok(value, "support agent skill-group response"); agent(result.agent); membership(result.membership); return value as SupportAgentSkillGroupResponse; }
export function validateSupportAgentSkillGroupListResponse(value: unknown): SupportAgentSkillGroupListResponse { const result = ok(value, "support agent skill-group list response"); if (!Array.isArray(result.memberships)) throw new TypeError("support agent skill-group list response.memberships must be an array"); result.memberships.forEach(membership); return value as SupportAgentSkillGroupListResponse; }
export function validateRemoveSupportAgentSkillGroupResponse(value: unknown): RemoveSupportAgentSkillGroupResponse { const result = ok(value, "remove support agent skill-group response"); agent(result.agent); string(result.removedSkillGroupId, "remove support agent skill-group response.removedSkillGroupId"); return value as RemoveSupportAgentSkillGroupResponse; }
export function validateSupportSlaPolicyResponse(value: unknown): SupportSlaPolicyResponse { const result = ok(value, "support SLA policy response"); slaPolicy(result.policy); return value as SupportSlaPolicyResponse; }
export function validateSupportSlaPolicyListResponse(value: unknown): SupportSlaPolicyListResponse { const result = ok(value, "support SLA policy list response"); if (!Array.isArray(result.policies)) throw new TypeError("support SLA policy list response.policies must be an array"); result.policies.forEach(slaPolicy); nullableString(result.nextCursor, "support SLA policy list response.nextCursor"); return value as SupportSlaPolicyListResponse; }

function conversation(value: unknown): void { const item = object(value, "support conversation"); string(item.conversationId, "conversation.conversationId"); string(item.cityCode, "conversation.cityCode"); oneOf(item.source, ["customer", "worker", "enterprise"] as const, "conversation.source"); string(item.requesterId, "conversation.requesterId"); nullableString(item.businessClientId, "conversation.businessClientId"); oneOf(item.status, ["queueing", "active", "transferred", "closed"] as const, "conversation.status"); nullableString(item.assignedAgentId, "conversation.assignedAgentId"); nullableString(item.linkedTicketId, "conversation.linkedTicketId"); integer(item.lastServerSeq, "conversation.lastServerSeq"); positiveInteger(item.version, "conversation.version"); for (const key of ["startedAt", "createdAt", "updatedAt"] as const) string(item[key], `conversation.${key}`); for (const key of ["acceptedAt", "transferredAt", "closedAt"] as const) nullableString(item[key], `conversation.${key}`); }
function message(value: unknown): void { const item = object(value, "support message"); string(item.messageId, "message.messageId"); string(item.cityCode, "message.cityCode"); string(item.conversationId, "message.conversationId"); oneOf(item.senderType, ["customer", "worker", "agent", "system"] as const, "message.senderType"); nullableString(item.senderId, "message.senderId"); string(item.clientMessageId, "message.clientMessageId"); positiveInteger(item.serverSeq, "message.serverSeq"); oneOf(item.messageType, ["text", "image", "system"] as const, "message.messageType"); nullableString(item.textContent, "message.textContent"); nullableString(item.mediaAssetId, "message.mediaAssetId"); string(item.createdAt, "message.createdAt"); }
export function validateSupportConversationResponse(value: unknown): SupportConversationResponse { const result = ok(value, "conversation response"); conversation(result.conversation); return value as SupportConversationResponse; }
export function validateSupportConversationListResponse(value: unknown): SupportConversationListResponse { const result = ok(value, "conversation list response"); if (!Array.isArray(result.conversations)) throw new TypeError("conversations must be an array"); result.conversations.forEach(conversation); nullableString(result.nextCursor, "conversation list nextCursor"); return value as SupportConversationListResponse; }
export function validateSupportConversationDetailResponse(value: unknown): SupportConversationDetailResponse { const result = ok(value, "conversation detail response"); conversation(result.conversation); if (!Array.isArray(result.messages)) throw new TypeError("messages must be an array"); result.messages.forEach(message); return value as SupportConversationDetailResponse; }
export function validateSupportMessageResponse(value: unknown): SupportMessageResponse { const result = ok(value, "message response"); message(result.message); boolean(result.idempotent, "message response.idempotent"); return value as SupportMessageResponse; }
export function validateSupportMessageListResponse(value: unknown): SupportMessageListResponse { const result = ok(value, "message list response"); if (!Array.isArray(result.messages)) throw new TypeError("messages must be an array"); result.messages.forEach(message); if (result.nextAfterSeq !== null) integer(result.nextAfterSeq, "nextAfterSeq"); boolean(result.hasMore, "hasMore"); return value as SupportMessageListResponse; }
export function validateSupportRealtimeTicketResponse(value: unknown): SupportRealtimeTicketResponse { const result = ok(value, "realtime ticket response"); string(result.ticket, "realtime ticket"); string(result.expiresAt, "realtime ticket expiry"); return value as SupportRealtimeTicketResponse; }
export function validateSupportCsatResponse(value:unknown):SupportCsatResponse{const r=ok(value,"CSAT response"),c=object(r.csat,"CSAT");string(c.csatId,"csatId");integer(c.score,"score");return value as SupportCsatResponse}
export function validateSupportQualityRubricResponse(value:unknown):SupportQualityRubricResponse{const r=ok(value,"rubric response"),x=object(r.rubric,"rubric");string(x.rubricId,"rubricId");string(x.rubricVersionId,"rubricVersionId");return value as SupportQualityRubricResponse}
export function validateSupportQualityReviewResponse(value:unknown):SupportQualityReviewResponse{const r=ok(value,"review response"),x=object(r.review,"review");string(x.qualityReviewId,"qualityReviewId");return value as SupportQualityReviewResponse}
export function validateSupportQualityDashboardResponse(value:unknown):SupportQualityDashboardResponse{const r=ok(value,"quality dashboard");object(r.dashboard,"dashboard");return value as SupportQualityDashboardResponse}
export function validateSupportKbMutationResponse(value: unknown): SupportKbMutationResponse { const result=ok(value,"knowledge response"),article=object(result.article,"knowledge article"),version=object(result.version,"knowledge version"); for(const key of ["articleId","cityCode","slug","language","lifecycleStatus","createdByAdminId"] as const) string(article[key],`article.${key}`); positiveInteger(article.version,"article.version"); for(const key of ["articleVersionId","cityCode","articleId","title","bodyMarkdown","reviewStatus","createdByAdminId","contentSha256"] as const) string(version[key],`version.${key}`); positiveInteger(version.revision,"version.revision"); if(!Array.isArray(version.keywords)||!Array.isArray(version.intentTags))throw new TypeError("knowledge terms must be arrays"); return value as SupportKbMutationResponse; }
export function validateSupportBotRunResponse(value: unknown): SupportBotRunResponse { const result=ok(value,"Bot run response"),run=object(result.run,"Bot run"); for(const key of ["botRunId","cityCode","conversationId","triggerMessageId","provider","providerStatus","providerRuleVersion","decision"] as const) string(run[key],`run.${key}`); if(run.externalProviderExecuted!==false)throw new TypeError("Bot run cannot claim external provider execution"); integer(run.confidenceBasisPoints,"run.confidenceBasisPoints"); if(!Array.isArray(run.reasonCodes)||!Array.isArray(run.matchedArticleVersionIds))throw new TypeError("Bot audit arrays are required"); return value as SupportBotRunResponse; }

function queryString(filters: object): string { const query = new URLSearchParams(); for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") query.set(key, String(value)); const encoded = query.toString(); return encoded ? `?${encoded}` : ""; }
const ticketPath = (base: string, ticketId: string) => `${base}/${encodeURIComponent(ticketId)}`;
const idempotent = { retry: "idempotent" as const };

export function createRequesterSupportApi(client: ApiClient) {
  const base = "/api/support/tickets";
  const conversationsBase = "/api/support/conversations";
  return {
    createSupportTicket(body: CreateSupportTicketRequest): Promise<SupportTicketResponse> { return client.post(base, body, { ...idempotent, validate: validateSupportTicketResponse }); },
    listSupportTickets(filters: SupportTicketListFilters = {}): Promise<SupportTicketListResponse> { return client.get(`${base}${queryString(filters)}`, { validate: validateSupportTicketListResponse }); },
    getSupportTicket(ticketId: string): Promise<SupportTicketDetailResponse> { return client.get(ticketPath(base, ticketId), { validate: validateSupportTicketDetailResponse }); },
    addSupportTicketComment(ticketId: string, body: AddSupportTicketCommentRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/events`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    reopenSupportTicket(ticketId: string, body: ReopenSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/reopen`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    createSupportConversation(body: CreateSupportConversationRequest): Promise<SupportConversationResponse> { return client.post(conversationsBase, body, { ...idempotent, validate: validateSupportConversationResponse }); },
    listSupportConversations(filters: SupportConversationListFilters = {}): Promise<SupportConversationListResponse> { return client.get(`${conversationsBase}${queryString(filters)}`, { validate: validateSupportConversationListResponse }); },
    getSupportConversation(conversationId: string): Promise<SupportConversationDetailResponse> { return client.get(ticketPath(conversationsBase, conversationId), { validate: validateSupportConversationDetailResponse }); },
    listSupportMessages(conversationId: string, filters: SupportMessageListFilters = {}): Promise<SupportMessageListResponse> { return client.get(`${ticketPath(conversationsBase, conversationId)}/messages${queryString(filters)}`, { validate: validateSupportMessageListResponse }); },
    sendSupportMessage(conversationId: string, body: SendSupportMessageRequest): Promise<SupportMessageResponse> { return client.post(`${ticketPath(conversationsBase, conversationId)}/messages`, body, { ...idempotent, validate: validateSupportMessageResponse }); },
    markSupportConversationRead(conversationId: string, body: MarkSupportConversationReadRequest): Promise<SupportConversationResponse> { return client.post(`${ticketPath(conversationsBase, conversationId)}/read`, body, { ...idempotent, validate: validateSupportConversationResponse }); },
    createSupportRealtimeTicket(): Promise<SupportRealtimeTicketResponse> { return client.post("/api/support/realtime-ticket", {}, { validate: validateSupportRealtimeTicketResponse }); },
    submitSupportTicketCsat(ticketId:string,body:SubmitSupportCsatRequest):Promise<SupportCsatResponse>{return client.post(`${ticketPath(base,ticketId)}/csat`,body,{...idempotent,validate:validateSupportCsatResponse})},
    submitSupportConversationCsat(conversationId:string,body:SubmitSupportCsatRequest):Promise<SupportCsatResponse>{return client.post(`${ticketPath(conversationsBase,conversationId)}/csat`,body,{...idempotent,validate:validateSupportCsatResponse})},
  };
}

export function createAdminSupportApi(client: ApiClient) {
  const base = "/api/internal/support/tickets";
  const agentsBase = "/api/internal/support/agents";
  const groupsBase = "/api/internal/support/skill-groups";
  const slaPoliciesBase = "/api/internal/support/sla-policies";
  const conversationsBase = "/api/internal/support/conversations";
  const kbBase = "/api/internal/support/kb/articles";
  return {
    listSupportTickets(filters: SupportTicketListFilters = {}): Promise<SupportTicketListResponse> { return client.get(`${base}${queryString(filters)}`, { validate: validateSupportTicketListResponse }); },
    getSupportTicket(ticketId: string): Promise<SupportTicketDetailResponse> { return client.get(ticketPath(base, ticketId), { validate: validateSupportTicketDetailResponse }); },
    assignSupportTicket(ticketId: string, body: AssignSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/assign`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    claimSupportTicket(ticketId: string, body: ClaimSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/claim`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    addSupportTicketComment(ticketId: string, body: AdminAddSupportTicketCommentRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/events`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    escalateSupportTicket(ticketId: string, body: EscalateSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/escalate`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    resolveSupportTicket(ticketId: string, body: ResolveSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/resolve`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    closeSupportTicket(ticketId: string, body: CloseSupportTicketRequest): Promise<SupportTicketMutationResponse> { return client.post(`${ticketPath(base, ticketId)}/close`, body, { ...idempotent, validate: validateSupportTicketMutationResponse }); },
    listSupportConversations(filters: SupportConversationListFilters = {}): Promise<SupportConversationListResponse> { return client.get(`${conversationsBase}${queryString(filters)}`, { validate: validateSupportConversationListResponse }); },
    getSupportConversation(conversationId: string): Promise<SupportConversationDetailResponse> { return client.get(ticketPath(conversationsBase, conversationId), { validate: validateSupportConversationDetailResponse }); },
    listSupportMessages(conversationId: string, filters: SupportMessageListFilters = {}): Promise<SupportMessageListResponse> { return client.get(`${ticketPath(conversationsBase, conversationId)}/messages${queryString(filters)}`, { validate: validateSupportMessageListResponse }); },
    sendSupportMessage(conversationId: string, body: SendSupportMessageRequest): Promise<SupportMessageResponse> { return client.post(`${ticketPath(conversationsBase, conversationId)}/messages`, body, { ...idempotent, validate: validateSupportMessageResponse }); },
    acceptSupportConversation(conversationId: string, body: AcceptSupportConversationRequest): Promise<SupportConversationResponse> { return client.post(`${ticketPath(conversationsBase, conversationId)}/accept`, body, { ...idempotent, validate: validateSupportConversationResponse }); },
    transferSupportConversation(conversationId: string, body: TransferSupportConversationRequest): Promise<SupportConversationResponse> { return client.post(`${ticketPath(conversationsBase, conversationId)}/transfer`, body, { ...idempotent, validate: validateSupportConversationResponse }); },
    closeSupportConversation(conversationId: string, body: CloseSupportConversationRequest): Promise<SupportConversationResponse> { return client.post(`${ticketPath(conversationsBase, conversationId)}/close`, body, { ...idempotent, validate: validateSupportConversationResponse }); },
    createSupportKbArticle(body: CreateSupportKbArticleRequest): Promise<SupportKbMutationResponse> { return client.post(kbBase, body, { ...idempotent, validate: validateSupportKbMutationResponse }); },
    createSupportKbRevision(articleId: string, body: CreateSupportKbRevisionRequest): Promise<SupportKbMutationResponse> { return client.post(`${ticketPath(kbBase,articleId)}/versions`,body,{...idempotent,validate:validateSupportKbMutationResponse}); },
    submitSupportKbRevision(articleId:string,versionId:string,body:ReviewSupportKbRevisionRequest):Promise<SupportKbMutationResponse>{return client.post(`${ticketPath(kbBase,articleId)}/versions/${encodeURIComponent(versionId)}/submit`,body,{...idempotent,validate:validateSupportKbMutationResponse});},
    approveSupportKbRevision(articleId:string,versionId:string,body:ReviewSupportKbRevisionRequest):Promise<SupportKbMutationResponse>{return client.post(`${ticketPath(kbBase,articleId)}/versions/${encodeURIComponent(versionId)}/approve`,body,{...idempotent,validate:validateSupportKbMutationResponse});},
    rejectSupportKbRevision(articleId:string,versionId:string,body:ReviewSupportKbRevisionRequest):Promise<SupportKbMutationResponse>{return client.post(`${ticketPath(kbBase,articleId)}/versions/${encodeURIComponent(versionId)}/reject`,body,{...idempotent,validate:validateSupportKbMutationResponse});},
    publishSupportKbRevision(articleId:string,body:PublishSupportKbRevisionRequest):Promise<SupportKbMutationResponse>{return client.post(`${ticketPath(kbBase,articleId)}/publish`,body,{...idempotent,validate:validateSupportKbMutationResponse});},
    runSupportBot(conversationId:string,messageId:string):Promise<SupportBotRunResponse>{return client.post(`/api/internal/support/bot/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/run`,{},{validate:validateSupportBotRunResponse});},
    listSupportAgents(filters: SupportAgentListFilters = {}): Promise<SupportAgentListResponse> { return client.get(`${agentsBase}${queryString(filters)}`, { validate: validateSupportAgentListResponse }); },
    getSupportAgent(agentId: string): Promise<SupportAgentResponse> { return client.get(ticketPath(agentsBase, agentId), { validate: validateSupportAgentResponse }); },
    createSupportAgent(body: CreateSupportAgentRequest): Promise<SupportAgentResponse> { return client.post(agentsBase, body, { ...idempotent, validate: validateSupportAgentResponse }); },
    updateSupportAgent(agentId: string, body: UpdateSupportAgentRequest): Promise<SupportAgentResponse> { return client.patch(ticketPath(agentsBase, agentId), body, { ...idempotent, validate: validateSupportAgentResponse }); },
    deleteSupportAgent(agentId: string, body: DeleteSupportAgentRequest): Promise<SupportAgentResponse> { return client.delete(ticketPath(agentsBase, agentId), body, { ...idempotent, validate: validateSupportAgentResponse }); },
    listAgentSkillGroups(agentId: string): Promise<SupportAgentSkillGroupListResponse> { return client.get(`${ticketPath(agentsBase, agentId)}/skill-groups`, { validate: validateSupportAgentSkillGroupListResponse }); },
    addSupportAgentSkillGroup(agentId: string, body: AddSupportAgentSkillGroupRequest): Promise<SupportAgentSkillGroupResponse> { return client.post(`${ticketPath(agentsBase, agentId)}/skill-groups`, body, { ...idempotent, validate: validateSupportAgentSkillGroupResponse }); },
    removeSupportAgentSkillGroup(agentId: string, skillGroupId: string, body: RemoveSupportAgentSkillGroupRequest): Promise<RemoveSupportAgentSkillGroupResponse> { return client.delete(`${ticketPath(agentsBase, agentId)}/skill-groups/${encodeURIComponent(skillGroupId)}`, body, { ...idempotent, validate: validateRemoveSupportAgentSkillGroupResponse }); },
    listSupportSkillGroups(filters: SupportSkillGroupListFilters = {}): Promise<SupportSkillGroupListResponse> { return client.get(`${groupsBase}${queryString(filters)}`, { validate: validateSupportSkillGroupListResponse }); },
    getSupportSkillGroup(skillGroupId: string): Promise<SupportSkillGroupResponse> { return client.get(ticketPath(groupsBase, skillGroupId), { validate: validateSupportSkillGroupResponse }); },
    createSupportSkillGroup(body: CreateSupportSkillGroupRequest): Promise<SupportSkillGroupResponse> { return client.post(groupsBase, body, { ...idempotent, validate: validateSupportSkillGroupResponse }); },
    updateSupportSkillGroup(skillGroupId: string, body: UpdateSupportSkillGroupRequest): Promise<SupportSkillGroupResponse> { return client.patch(ticketPath(groupsBase, skillGroupId), body, { ...idempotent, validate: validateSupportSkillGroupResponse }); },
    deleteSupportSkillGroup(skillGroupId: string, body: DeleteSupportSkillGroupRequest): Promise<SupportSkillGroupResponse> { return client.delete(ticketPath(groupsBase, skillGroupId), body, { ...idempotent, validate: validateSupportSkillGroupResponse }); },
    listSupportSlaPolicies(filters: SupportSlaPolicyListFilters = {}): Promise<SupportSlaPolicyListResponse> { return client.get(`${slaPoliciesBase}${queryString(filters)}`, { validate: validateSupportSlaPolicyListResponse }); },
    getSupportSlaPolicy(policyId: string): Promise<SupportSlaPolicyResponse> { return client.get(ticketPath(slaPoliciesBase, policyId), { validate: validateSupportSlaPolicyResponse }); },
    createSupportSlaPolicy(body: CreateSupportSlaPolicyRequest): Promise<SupportSlaPolicyResponse> { return client.post(slaPoliciesBase, body, { ...idempotent, validate: validateSupportSlaPolicyResponse }); },
    reviseSupportSlaPolicy(policyId: string, body: ReviseSupportSlaPolicyRequest): Promise<SupportSlaPolicyResponse> { return client.patch(ticketPath(slaPoliciesBase, policyId), body, { ...idempotent, validate: validateSupportSlaPolicyResponse }); },
    updateSupportSlaPolicy(policyId: string, body: ReviseSupportSlaPolicyRequest): Promise<SupportSlaPolicyResponse> { return client.patch(ticketPath(slaPoliciesBase, policyId), body, { ...idempotent, validate: validateSupportSlaPolicyResponse }); },
    createSupportQualityRubric(body:CreateSupportQualityRubricRequest):Promise<SupportQualityRubricResponse>{return client.post("/api/internal/support/quality/rubrics",body,{...idempotent,validate:validateSupportQualityRubricResponse})},
    createSupportQualityReview(body:CreateSupportQualityReviewRequest):Promise<SupportQualityReviewResponse>{return client.post("/api/internal/support/quality/reviews",body,{...idempotent,validate:validateSupportQualityReviewResponse})},
    getSupportQualityDashboard():Promise<SupportQualityDashboardResponse>{return client.get("/api/internal/support/quality/dashboard",{validate:validateSupportQualityDashboardResponse})},
  };
}
