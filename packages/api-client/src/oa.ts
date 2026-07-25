import type {
  CityCode,
  CreateOaAdminHandoffRequest,
  ApproveOaDelegationRequest,
  CreateOaDelegationRequest,
  CreateOaMembershipRequest,
  CreateOaOrganizationRequest,
  CreateOaApprovalRequest,
  CreateOaRoleRequest,
  CreateOaTaskRequest,
  OaApprovalActionRequest,
  OaActivityListResponse,
  OaApprovalDecisionRequest,
  OaApprovalListResponse,
  OaApprovalResponse,
  OaApprovalStatus,
  OaAuditListResponse,
  OaLogoutResponse,
  OaDelegationResponse,
  OaDelegationsResponse,
  OaMeResponse,
  OaAdminHandoffResponse,
  OaMembershipResponse,
  OaMembershipsResponse,
  OaNotificationCountResponse,
  OaNotificationListResponse,
  OaNotificationMutationResponse,
  OaOrganizationsResponse,
  OaOrganizationResponse,
  OaRoleResponse,
  OaRolesResponse,
  OaScopeResponse,
  OaTaskActionRequest,
  OaTaskListResponse,
  OaTaskResponse,
  OaTaskStatus,
  OaWorkbenchResponse,
  RevokeOaDelegationRequest,
  UpdateOaMembershipRequest,
  UpdateOaOrganizationRequest,
  UpdateOaRoleRequest,
} from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

export interface OaTaskListQuery {
  cityCode?: CityCode;
  status?: OaTaskStatus;
  assignee?: "me" | "all";
}

export interface OaApprovalListQuery {
  cityCode?: CityCode;
  status?: OaApprovalStatus;
  requestedBy?: "me" | "all";
}

export interface OaActivityQuery {
  cityCode?: CityCode;
  limit?: number;
}

export interface OaAuditQuery {
  cityCode?: CityCode;
  targetType?: string;
  targetId?: string;
  limit?: number;
}

export type OaTaskAction = "claim" | "start" | "block" | "complete" | "delegate" | "cancel";

function query(input: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function createOaApi(client: ApiClient) {
  return {
    getMe() {
      return client.get<OaMeResponse>("/api/oa/me", { retry: "idempotent" });
    },
    logout() {
      return client.post<OaLogoutResponse>("/api/oa/logout");
    },
    createAdminHandoff(input: CreateOaAdminHandoffRequest) {
      return client.post<OaAdminHandoffResponse>("/api/oa/admin-handoffs", input);
    },
    getScope() {
      return client.get<OaScopeResponse>("/api/oa/scopes", { retry: "idempotent" });
    },
    listOrganizations() {
      return client.get<OaOrganizationsResponse>("/api/oa/organizations", {
        retry: "idempotent",
      });
    },
    createOrganization(input: CreateOaOrganizationRequest) {
      return client.post<OaOrganizationResponse>("/api/oa/organizations", input, {
        retry: "idempotent",
      });
    },
    updateOrganization(organizationId: string, input: UpdateOaOrganizationRequest) {
      return client.post<OaOrganizationResponse>(
        `/api/oa/organizations/${encodeURIComponent(organizationId)}`,
        input,
        { retry: "idempotent" },
      );
    },
    listRoles(organizationId?: string) {
      return client.get<OaRolesResponse>(`/api/oa/roles${query({ organizationId })}`, {
        retry: "idempotent",
      });
    },
    createRole(input: CreateOaRoleRequest) {
      return client.post<OaRoleResponse>("/api/oa/roles", input, { retry: "idempotent" });
    },
    updateRole(roleId: string, input: UpdateOaRoleRequest) {
      return client.post<OaRoleResponse>(
        `/api/oa/roles/${encodeURIComponent(roleId)}`,
        input,
        { retry: "idempotent" },
      );
    },
    listMemberships(organizationId?: string) {
      return client.get<OaMembershipsResponse>(
        `/api/oa/memberships${query({ organizationId })}`,
        { retry: "idempotent" },
      );
    },
    createMembership(input: CreateOaMembershipRequest) {
      return client.post<OaMembershipResponse>("/api/oa/memberships", input, {
        retry: "idempotent",
      });
    },
    updateMembership(membershipId: string, input: UpdateOaMembershipRequest) {
      return client.post<OaMembershipResponse>(
        `/api/oa/memberships/${encodeURIComponent(membershipId)}`,
        input,
        { retry: "idempotent" },
      );
    },
    listDelegations() {
      return client.get<OaDelegationsResponse>("/api/oa/delegations", {
        retry: "idempotent",
      });
    },
    createDelegation(input: CreateOaDelegationRequest) {
      return client.post<OaDelegationResponse>("/api/oa/delegations", input, {
        retry: "idempotent",
      });
    },
    approveDelegation(grantId: string, input: ApproveOaDelegationRequest) {
      return client.post<OaDelegationResponse>(
        `/api/oa/delegations/${encodeURIComponent(grantId)}/approve`,
        input,
        { retry: "idempotent" },
      );
    },
    revokeDelegation(grantId: string, input: RevokeOaDelegationRequest) {
      return client.post<OaDelegationResponse>(
        `/api/oa/delegations/${encodeURIComponent(grantId)}/revoke`,
        input,
        { retry: "idempotent" },
      );
    },
    getWorkbench() {
      return client.get<OaWorkbenchResponse>("/api/oa/workbench", { retry: "idempotent" });
    },
    listTasks(input: OaTaskListQuery = {}) {
      return client.get<OaTaskListResponse>(`/api/oa/tasks${query(input)}`, {
        retry: "idempotent",
      });
    },
    getTask(taskId: string) {
      return client.get<OaTaskResponse>(`/api/oa/tasks/${encodeURIComponent(taskId)}`, {
        retry: "idempotent",
      });
    },
    createTask(input: CreateOaTaskRequest) {
      return client.post<OaTaskResponse>("/api/oa/tasks", input, { retry: "idempotent" });
    },
    transitionTask(taskId: string, action: OaTaskAction, input: OaTaskActionRequest) {
      return client.post<OaTaskResponse>(
        `/api/oa/tasks/${encodeURIComponent(taskId)}/${action}`,
        input,
        { retry: "idempotent" },
      );
    },
    listApprovals(input: OaApprovalListQuery = {}) {
      return client.get<OaApprovalListResponse>(`/api/oa/approvals${query(input)}`, {
        retry: "idempotent",
      });
    },
    getApproval(approvalRequestId: string) {
      return client.get<OaApprovalResponse>(
        `/api/oa/approvals/${encodeURIComponent(approvalRequestId)}`,
        { retry: "idempotent" },
      );
    },
    createApproval(input: CreateOaApprovalRequest) {
      return client.post<OaApprovalResponse>("/api/oa/approvals", input, {
        retry: "idempotent",
      });
    },
    decideApproval(approvalRequestId: string, input: OaApprovalDecisionRequest) {
      return client.post<OaApprovalResponse>(
        `/api/oa/approvals/${encodeURIComponent(approvalRequestId)}/decision`,
        input,
        { retry: "idempotent" },
      );
    },
    transitionApproval(
      approvalRequestId: string,
      action: "resubmit" | "withdraw",
      input: OaApprovalActionRequest,
    ) {
      return client.post<OaApprovalResponse>(
        `/api/oa/approvals/${encodeURIComponent(approvalRequestId)}/${action}`,
        input,
        { retry: "idempotent" },
      );
    },
    listActivity(input: OaActivityQuery = {}) {
      return client.get<OaActivityListResponse>(`/api/oa/activity${query(input)}`, {
        retry: "idempotent",
      });
    },
    listNotifications(input: { status?: "all" | "unread" | "archived"; limit?: number } = {}) {
      return client.get<OaNotificationListResponse>(`/api/oa/notifications${query(input)}`, {
        retry: "idempotent",
      });
    },
    getNotificationUnreadCount() {
      return client.get<OaNotificationCountResponse>("/api/oa/notifications/unread-count", {
        retry: "idempotent",
      });
    },
    markNotificationRead(notificationId: string) {
      return client.post<OaNotificationMutationResponse>(
        `/api/oa/notifications/${encodeURIComponent(notificationId)}/read`,
      );
    },
    archiveNotification(notificationId: string) {
      return client.post<OaNotificationMutationResponse>(
        `/api/oa/notifications/${encodeURIComponent(notificationId)}/archive`,
      );
    },
    listAuditRecords(input: OaAuditQuery = {}) {
      return client.get<OaAuditListResponse>(`/api/oa/audit-records${query(input)}`, {
        retry: "idempotent",
      });
    },
  };
}

export type OaApi = ReturnType<typeof createOaApi>;

export const oaApi = {
  forClient: createOaApi,
};
