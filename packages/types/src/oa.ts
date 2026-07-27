import type { CityCode } from "./city.js";
import type { Role } from "./rbac.js";

export const OA_PERMISSION_KEYS = [
  "oa.workbench.read",
  "oa.task.read",
  "oa.task.manage",
  "oa.approval.read",
  "oa.approval.request",
  "oa.approval.decide",
  "oa.notification.read",
  "oa.organization.read",
  "oa.organization.manage",
  "oa.authorization.read",
  "oa.authorization.manage",
  "oa.audit.read",
  "oa.activity.read",
  "operations.orders.read",
  "operations.catalog.read",
  "operations.catalog.manage",
  "operations.certification.read",
  "operations.certification.decide",
  "operations.dispatch.read",
  "operations.dispatch.manage",
  "aftersale.read",
  "aftersale.manage",
  "enterprise.read",
  "enterprise.manage",
  "finance.settlement.read",
  "finance.settlement.review",
  "finance.withdrawal.read",
  "finance.withdrawal.review",
  "support.read",
  "support.manage",
  "support.quality.read",
  "support.quality.manage",
  "reviews.read",
  "reviews.moderate",
  "marketing.read",
  "marketing.manage",
] as const;

export type OaPermissionKey = (typeof OA_PERMISSION_KEYS)[number];
export type OaOrganizationType = "headquarters" | "branch";
export type OaLifecycleStatus = "active" | "suspended" | "revoked";
export type OaTaskStatus =
  | "open"
  | "claimed"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";
export type OaTaskPriority = "low" | "normal" | "high" | "urgent";
export type OaApprovalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "expired";
export type OaApprovalDecision = "approved" | "rejected" | "returned";
export type OaActivityFreshness = "live" | "stale" | "disconnected";

export interface OaBackofficeContext {
  sessionId: string;
  tokenJti: string;
  membershipId: string;
  organizationId: string;
  authzVersion: number;
}

export interface OaOrganization {
  organizationId: string;
  organizationCode: string;
  name: string;
  organizationType: OaOrganizationType;
  parentOrganizationId: string | null;
  status: OaLifecycleStatus;
  version: number;
}

export interface OaMembership {
  membershipId: string;
  userId: string;
  username?: string;
  organizationId: string;
  organizationName: string;
  organizationType: OaOrganizationType;
  status: OaLifecycleStatus;
  authzVersion: number;
  legacyRole: Role;
  roles?: OaRole[];
}

export interface OaRole {
  roleId: string;
  organizationId: string;
  roleKey: string;
  name: string;
  status: OaLifecycleStatus;
  version: number;
  permissions: OaPermissionKey[];
}

export interface OaDelegationGrant {
  grantId: string;
  grantorOrganizationId: string;
  granteeOrganizationId: string;
  cityCode: CityCode;
  permissionKey: OaPermissionKey;
  status: "pending" | "active" | "revoked" | "expired";
  validFrom: string;
  validTo: string | null;
  version: number;
  grantedByMembershipId: string;
  approvedByMembershipId: string | null;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface OaPrincipal {
  userId: string;
  username: string;
  legacyRole: Role;
  sessionId: string;
  membershipId: string;
  organization: OaOrganization;
  permissions: OaPermissionKey[];
  permissionCityCodes: Partial<Record<OaPermissionKey, CityCode[]>>;
  cityCodes: CityCode[];
  authzVersion: number;
}

export interface OaScopeSummary {
  organization: OaOrganization;
  cityCodes: CityCode[];
  permissions: OaPermissionKey[];
}

export interface OaTask {
  taskId: string;
  organizationId: string;
  cityCode: CityCode;
  title: string;
  description: string | null;
  priority: OaTaskPriority;
  status: OaTaskStatus;
  assigneeMembershipId: string | null;
  createdByMembershipId: string;
  dueAt: string | null;
  blockedReason: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OaApprovalStep {
  approvalStepId: string;
  approvalRequestId: string;
  stepOrder: number;
  organizationId: string;
  requiredPermission: OaPermissionKey;
  status: "pending" | "approved" | "rejected" | "returned" | "skipped";
  decidedByMembershipId: string | null;
  decidedAt: string | null;
  version: number;
}

export interface OaApprovalRequest {
  approvalRequestId: string;
  organizationId: string;
  cityCode: CityCode;
  requestType: string;
  title: string;
  description: string | null;
  requestedByMembershipId: string;
  status: OaApprovalStatus;
  currentStepOrder: number;
  sourceDomain: string | null;
  sourceReferenceId: string | null;
  version: number;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps?: OaApprovalStep[];
}

export interface OaApprovalDecisionRecord {
  decisionId: string;
  approvalRequestId: string;
  approvalStepId: string;
  decision: OaApprovalDecision;
  reason: string;
  decidedByMembershipId: string;
  createdAt: string;
}

export interface OaProcessEvent {
  eventId: string;
  organizationId: string;
  cityCode: CityCode | null;
  aggregateType: "task" | "approval" | "authorization" | "organization";
  aggregateId: string;
  eventType: string;
  actorMembershipId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface OaActivityItem {
  activityId: string;
  sourceEventId: string;
  organizationId: string;
  organizationName: string;
  cityCode: CityCode;
  sourceDomain: string;
  eventType: string;
  summary: string;
  occurredAt: string;
  projectedAt: string;
  freshness: OaActivityFreshness;
}

export interface OaAuditRecord {
  auditId: string;
  actorUserId: string | null;
  actorMembershipId: string | null;
  organizationId: string | null;
  cityCode: CityCode | null;
  permissionKey: OaPermissionKey | null;
  action: string;
  targetType: string;
  targetId: string | null;
  decision: "allowed" | "denied";
  reasonCode: string;
  traceId: string;
  createdAt: string;
}

export interface OaNotification {
  notificationId: string;
  organizationId: string;
  cityCode: CityCode | null;
  notificationType: string;
  title: string;
  body: string;
  sourceType: string;
  sourceId: string;
  deepLink: string | null;
  readAt: string | null;
  archivedAt: string | null;
  version: number;
  createdAt: string;
}

export interface OaWorkbenchResponse {
  ok: true;
  principal: OaPrincipal;
  tasks: OaTask[];
  approvals: OaApprovalRequest[];
  activities: OaActivityItem[];
  generatedAt: string;
}

export interface OaMeResponse {
  ok: true;
  principal: OaPrincipal;
}

export interface OaOrganizationsResponse {
  ok: true;
  organizations: OaOrganization[];
}

export interface OaOrganizationResponse {
  ok: true;
  organization: OaOrganization;
  idempotentReplay?: boolean;
}

export interface OaRolesResponse {
  ok: true;
  roles: OaRole[];
}

export interface OaRoleResponse {
  ok: true;
  role: OaRole;
  idempotentReplay?: boolean;
}

export interface OaMembershipsResponse {
  ok: true;
  memberships: OaMembership[];
}

export interface OaMembershipResponse {
  ok: true;
  membership: OaMembership;
  idempotentReplay?: boolean;
}

export interface OaDelegationsResponse {
  ok: true;
  delegations: OaDelegationGrant[];
}

export interface OaDelegationResponse {
  ok: true;
  delegation: OaDelegationGrant;
  idempotentReplay?: boolean;
}

export interface OaScopeResponse {
  ok: true;
  scope: OaScopeSummary;
}

export interface OaLogoutResponse {
  ok: true;
}

export interface OaTaskListResponse {
  ok: true;
  tasks: OaTask[];
}

export interface OaTaskResponse {
  ok: true;
  task: OaTask;
  idempotentReplay?: boolean;
}

export interface OaApprovalListResponse {
  ok: true;
  approvals: OaApprovalRequest[];
}

export interface OaApprovalResponse {
  ok: true;
  approval: OaApprovalRequest;
  idempotentReplay?: boolean;
}

export interface OaActivityListResponse {
  ok: true;
  activities: OaActivityItem[];
  generatedAt: string;
}

export interface OaAuditListResponse {
  ok: true;
  records: OaAuditRecord[];
}

export interface OaNotificationListResponse {
  ok: true;
  notifications: OaNotification[];
  unreadCount: number;
}

export interface OaNotificationCountResponse {
  ok: true;
  unreadCount: number;
}

export interface OaNotificationMutationResponse {
  ok: true;
  notification: OaNotification;
}

export interface CreateOaTaskRequest {
  cityCode: CityCode;
  organizationId: string;
  title: string;
  description?: string;
  priority?: OaTaskPriority;
  assigneeMembershipId?: string;
  dueAt?: string;
  idempotencyKey: string;
  reason: string;
}

export interface OaTaskActionRequest {
  expectedVersion: number;
  idempotencyKey: string;
  reason: string;
  assigneeMembershipId?: string;
  blockedReason?: string;
}

export interface CreateOaApprovalRequest {
  cityCode: CityCode;
  organizationId: string;
  requestType: string;
  title: string;
  description?: string;
  sourceDomain?: string;
  sourceReferenceId?: string;
  requiredPermission: OaPermissionKey;
  idempotencyKey: string;
  reason: string;
}

export interface OaApprovalDecisionRequest {
  expectedVersion: number;
  decision: OaApprovalDecision;
  reason: string;
  idempotencyKey: string;
}

export interface OaApprovalActionRequest {
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
}

export interface CreateOaOrganizationRequest {
  organizationCode: string;
  name: string;
  parentOrganizationId: string;
  cityCodes: CityCode[];
  reason: string;
  idempotencyKey: string;
}

export interface UpdateOaOrganizationRequest {
  expectedVersion: number;
  name?: string;
  status?: OaLifecycleStatus;
  cityCodes?: CityCode[];
  reason: string;
  idempotencyKey: string;
}

export interface CreateOaRoleRequest {
  organizationId: string;
  roleKey: string;
  name: string;
  permissions: OaPermissionKey[];
  reason: string;
  idempotencyKey: string;
}

export interface UpdateOaRoleRequest {
  expectedVersion: number;
  name?: string;
  status?: OaLifecycleStatus;
  permissions?: OaPermissionKey[];
  reason: string;
  idempotencyKey: string;
}

export interface CreateOaMembershipRequest {
  organizationId: string;
  adminUserId: string;
  roleIds: string[];
  reason: string;
  idempotencyKey: string;
}

export interface UpdateOaMembershipRequest {
  expectedAuthzVersion: number;
  status?: OaLifecycleStatus;
  roleIds?: string[];
  reason: string;
  idempotencyKey: string;
}

export interface CreateOaDelegationRequest {
  granteeOrganizationId: string;
  cityCode: CityCode;
  permissionKey: OaPermissionKey;
  validTo?: string;
  reason: string;
  idempotencyKey: string;
}

export interface RevokeOaDelegationRequest {
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
}

export type ApproveOaDelegationRequest = RevokeOaDelegationRequest;

export interface CreateOaAdminHandoffRequest {
  targetPath: string;
  permissionKey: OaPermissionKey;
  cityCode: CityCode;
}

export interface OaAdminHandoffResponse {
  ok: true;
  ticket: string;
  targetPath: string;
  cityCode: CityCode;
  expiresAt: string;
}

export interface ExchangeOaAdminHandoffRequest {
  ticket: string;
}

export interface OaAdminHandoffExchangeResponse {
  ok: true;
  token: string;
  userId: string;
  role: string;
  username: string;
  sessionId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationType: OaOrganizationType;
  expiresAt: string;
  targetPath: string;
  cityCode: CityCode;
}
