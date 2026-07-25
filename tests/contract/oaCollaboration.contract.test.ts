import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../packages/api-client/src/createApiClient.js";
import { createOaApi } from "../../packages/api-client/src/oa.js";
import {
  createOaApprovalRequestSchema,
  createOaDelegationRequestSchema,
  createOaMembershipRequestSchema,
  createOaOrganizationRequestSchema,
  createOaRoleRequestSchema,
  createOaTaskRequestSchema,
  oaApprovalActionRequestSchema,
  oaApprovalDecisionRequestSchema,
  oaTaskActionRequestSchema,
  updateOaMembershipRequestSchema,
} from "../../packages/validators/src/index.js";
import { OA_PERMISSION_KEYS } from "../../packages/types/src/index.js";

function recordingClient() {
  const get = vi.fn(async <T>() => ({ ok: true } as T));
  const post = vi.fn(async <T>() => ({ ok: true } as T));
  return {
    get,
    post,
    patch: vi.fn(),
    delete: vi.fn(),
    postBinary: vi.fn(),
  } as unknown as ApiClient & { get: typeof get; post: typeof post };
}

describe("OA collaboration contract", () => {
  it("keeps permission keys unique and exposes the required control-plane capabilities", () => {
    expect(new Set(OA_PERMISSION_KEYS).size).toBe(OA_PERMISSION_KEYS.length);
    expect(OA_PERMISSION_KEYS).toEqual(expect.arrayContaining([
      "oa.workbench.read",
      "oa.task.manage",
      "oa.approval.decide",
      "oa.notification.read",
      "oa.authorization.manage",
      "oa.audit.read",
    ]));
  });

  it("accepts strict task and approval commands while rejecting reserved cities and client expansion", () => {
    const task = {
      cityCode: "hangzhou",
      organizationId: "xlb-branch-hangzhou",
      title: "处理杭州分公司异常订单",
      priority: "urgent",
      idempotencyKey: "oa-task-command-0001",
      reason: "总部运营协同",
    };
    expect(createOaTaskRequestSchema.safeParse(task).success).toBe(true);
    expect(createOaTaskRequestSchema.safeParse({ ...task, cityCode: "__global__" }).success).toBe(false);
    expect(createOaTaskRequestSchema.safeParse({ ...task, amount: 1 }).success).toBe(false);

    const approval = {
      cityCode: "hangzhou",
      organizationId: "xlb-branch-hangzhou",
      requestType: "operations.exception",
      title: "异常运营动作审批",
      requiredPermission: "operations.dispatch.manage",
      idempotencyKey: "oa-approval-command-0001",
      reason: "分公司申请总部复核",
    };
    expect(createOaApprovalRequestSchema.safeParse(approval).success).toBe(true);
    expect(createOaApprovalRequestSchema.safeParse({
      ...approval,
      requiredPermission: "finance.ledger.mutate",
    }).success).toBe(false);
  });

  it("requires optimistic versions, reasons and idempotency keys for workflow mutations", () => {
    expect(oaTaskActionRequestSchema.safeParse({
      expectedVersion: 2,
      idempotencyKey: "oa-task-transition-0001",
      reason: "处理完成并复核",
    }).success).toBe(true);
    expect(oaTaskActionRequestSchema.safeParse({
      expectedVersion: -1,
      idempotencyKey: "short",
      reason: "",
    }).success).toBe(false);
    expect(oaApprovalDecisionRequestSchema.safeParse({
      expectedVersion: 1,
      decision: "approved",
      reason: "证据完整，同意执行",
      idempotencyKey: "oa-approval-decision-0001",
    }).success).toBe(true);
    expect(oaApprovalActionRequestSchema.safeParse({
      expectedVersion: 2,
      reason: "补充材料后重新提交",
      idempotencyKey: "oa-approval-resubmit-0001",
    }).success).toBe(true);
  });

  it("keeps organization and authorization mutations strict, scoped and auditable", () => {
    expect(createOaOrganizationRequestSchema.safeParse({
      organizationCode: "hangzhou-west",
      name: "杭州西部分公司",
      parentOrganizationId: "oa-org-hq",
      cityCodes: ["hangzhou"],
      reason: "总部批准新建分公司",
      idempotencyKey: "oa-org-create-0001",
    }).success).toBe(true);
    expect(createOaOrganizationRequestSchema.safeParse({
      organizationCode: "hangzhou-west",
      name: "杭州西部分公司",
      parentOrganizationId: "oa-org-hq",
      cityCodes: ["__global__"],
      reason: "非法全局范围",
      idempotencyKey: "oa-org-create-0002",
    }).success).toBe(false);
    expect(createOaRoleRequestSchema.safeParse({
      organizationId: "oa-org-hangzhou",
      roleKey: "dispatch_reviewer",
      name: "调度复核员",
      permissions: ["operations.dispatch.read", "operations.dispatch.manage"],
      reason: "建立最小权限角色",
      idempotencyKey: "oa-role-create-0001",
    }).success).toBe(true);
    expect(createOaMembershipRequestSchema.safeParse({
      organizationId: "oa-org-hangzhou",
      adminUserId: "admin-hangzhou",
      roleIds: [],
      reason: "角色不能为空",
      idempotencyKey: "oa-member-create-0001",
    }).success).toBe(false);
    expect(updateOaMembershipRequestSchema.safeParse({
      expectedAuthzVersion: 3,
      reason: "没有任何变更",
      idempotencyKey: "oa-member-update-0001",
    }).success).toBe(false);
    expect(createOaDelegationRequestSchema.safeParse({
      granteeOrganizationId: "oa-org-hangzhou",
      cityCode: "hangzhou",
      permissionKey: "operations.dispatch.manage",
      reason: "总部委派杭州调度权限",
      idempotencyKey: "oa-grant-create-0001",
    }).success).toBe(true);
  });

  it("exposes idempotent management endpoints without placing identity state in URLs", async () => {
    const client = recordingClient();
    const api = createOaApi(client);
    await api.createOrganization({
      organizationCode: "hangzhou-west",
      name: "杭州西部分公司",
      parentOrganizationId: "oa-org-hq",
      cityCodes: ["hangzhou"],
      reason: "总部批准",
      idempotencyKey: "oa-org-create-0001",
    });
    await api.createDelegation({
      granteeOrganizationId: "oa-org-hangzhou",
      cityCode: "hangzhou",
      permissionKey: "operations.dispatch.manage",
      reason: "发起委派",
      idempotencyKey: "oa-grant-create-0001",
    });
    await api.approveDelegation("grant/unsafe", {
      expectedVersion: 0,
      reason: "独立复核通过",
      idempotencyKey: "oa-grant-approve-0001",
    });

    expect(client.post).toHaveBeenNthCalledWith(
      1,
      "/api/oa/organizations",
      expect.objectContaining({ cityCodes: ["hangzhou"] }),
      { retry: "idempotent" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      "/api/oa/delegations",
      expect.objectContaining({ permissionKey: "operations.dispatch.manage" }),
      { retry: "idempotent" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      3,
      "/api/oa/delegations/grant%2Funsafe/approve",
      expect.objectContaining({ expectedVersion: 0 }),
      { retry: "idempotent" },
    );
  });

  it("uses scoped OA endpoints and enables retry only for commands carrying idempotency keys", async () => {
    const client = recordingClient();
    const api = createOaApi(client);
    await api.listTasks({ cityCode: "hangzhou", assignee: "me" });
    await api.createTask({
      cityCode: "hangzhou",
      organizationId: "xlb-branch-hangzhou",
      title: "协同任务",
      idempotencyKey: "oa-task-command-0001",
      reason: "运营协同",
    });
    await api.transitionTask("task/unsafe", "complete", {
      expectedVersion: 1,
      idempotencyKey: "oa-task-transition-0001",
      reason: "处理完成",
    });
    await api.transitionApproval("approval/unsafe", "resubmit", {
      expectedVersion: 2,
      idempotencyKey: "oa-approval-resubmit-0001",
      reason: "补充材料后重新提交",
    });
    await api.markNotificationRead("notice/unsafe");
    await api.listAuditRecords({ targetType: "oa_task", targetId: "task-1", limit: 20 });

    expect(client.get).toHaveBeenCalledWith(
      "/api/oa/tasks?cityCode=hangzhou&assignee=me",
      { retry: "idempotent" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      1,
      "/api/oa/tasks",
      expect.objectContaining({ idempotencyKey: "oa-task-command-0001" }),
      { retry: "idempotent" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      2,
      "/api/oa/tasks/task%2Funsafe/complete",
      expect.objectContaining({ expectedVersion: 1 }),
      { retry: "idempotent" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      3,
      "/api/oa/approvals/approval%2Funsafe/resubmit",
      expect.objectContaining({ expectedVersion: 2 }),
      { retry: "idempotent" },
    );
    expect(client.post).toHaveBeenNthCalledWith(
      4,
      "/api/oa/notifications/notice%2Funsafe/read",
    );
    expect(client.get).toHaveBeenLastCalledWith(
      "/api/oa/audit-records?targetType=oa_task&targetId=task-1&limit=20",
      { retry: "idempotent" },
    );
  });
});
