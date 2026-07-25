import type {
  CityCode,
  CreateOaApprovalRequest,
  CreateOaTaskRequest,
  OaApprovalActionRequest,
  OaActivityListResponse,
  OaApprovalDecisionRequest,
  OaApprovalListResponse,
  OaApprovalResponse,
  OaApprovalStatus,
  OaAuditListResponse,
  OaLogoutResponse,
  OaMeResponse,
  OaNotificationCountResponse,
  OaNotificationListResponse,
  OaNotificationMutationResponse,
  OaOrganizationsResponse,
  OaScopeResponse,
  OaTaskActionRequest,
  OaTaskListResponse,
  OaTaskResponse,
  OaTaskStatus,
  OaWorkbenchResponse,
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
    getScope() {
      return client.get<OaScopeResponse>("/api/oa/scopes", { retry: "idempotent" });
    },
    listOrganizations() {
      return client.get<OaOrganizationsResponse>("/api/oa/organizations", {
        retry: "idempotent",
      });
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
