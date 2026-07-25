import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../backend/src/app.js";
import { closeMysqlPool, getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { oaActivityProjectionService } from "../../backend/src/oa/oaActivityProjectionService.js";
import { verifyToken } from "../../backend/src/auth/tokenAuth.js";

async function oaLogin(app: FastifyInstance, username: string): Promise<string> {
  const issued = await app.inject({
    method: "POST",
    url: "/api/auth/oa/code",
    payload: { username },
  });
  expect(issued.statusCode, issued.body).toBe(200);
  const debug = await app.inject({
    method: "GET",
    url: `/api/auth/oa/debug-code?username=${encodeURIComponent(username)}`,
  });
  expect(debug.statusCode, debug.body).toBe(200);
  const loggedIn = await app.inject({
    method: "POST",
    url: "/api/auth/oa/login",
    payload: { username, code: debug.json().code },
  });
  expect(loggedIn.statusCode, loggedIn.body).toBe(200);
  return loggedIn.json().token as string;
}

function authorization(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("OA collaboration lifecycle", { timeout: 60_000 }, () => {
  let app: FastifyInstance;
  let hqToken: string;
  let branchToken: string;
  let siblingToken: string;
  let createdTaskId: string;

  beforeAll(async () => {
    app = await buildApp();
    const siblingSetup = [
      `INSERT INTO admin_users (id, username, role)
       VALUES ('admin-hz-sibling', 'admin_hz_sibling', 'operator')`,
      `INSERT INTO admin_city_scopes (admin_user_id, city_code)
       VALUES ('admin-hz-sibling', 'hangzhou')`,
      `INSERT INTO oa_organizations (
         organization_id, organization_code, name, organization_type, parent_organization_id
       ) VALUES ('oa-org-hz-sibling', 'XLB-HZ-2', '杭州第二分公司', 'branch', 'oa-org-hq')`,
      `INSERT INTO oa_organization_closure (
         ancestor_organization_id, descendant_organization_id, depth
       ) VALUES
         ('oa-org-hz-sibling', 'oa-org-hz-sibling', 0),
         ('oa-org-hq', 'oa-org-hz-sibling', 1)`,
      `INSERT INTO oa_organization_city_assignments (organization_id, city_code)
       VALUES ('oa-org-hz-sibling', 'hangzhou')`,
      `INSERT INTO oa_memberships (
         membership_id, admin_user_id, organization_id, authz_version
       ) VALUES ('oa-member-hz-sibling', 'admin-hz-sibling', 'oa-org-hz-sibling', 1)`,
      `INSERT INTO oa_roles (
         role_id, organization_id, role_key, name
       ) VALUES ('oa-role-hz-sibling', 'oa-org-hz-sibling', 'branch_operator', '杭州第二分公司运营')`,
      `INSERT INTO oa_role_permissions (role_id, permission_key)
       SELECT 'oa-role-hz-sibling', permission_key
       FROM oa_role_permissions
       WHERE role_id = 'oa-role-branch-admin-hz'`,
      `INSERT INTO oa_membership_roles (membership_id, role_id)
       VALUES ('oa-member-hz-sibling', 'oa-role-hz-sibling')`,
      `INSERT INTO oa_delegation_grants (
         grant_id, grantor_organization_id, grantee_organization_id, city_code,
         permission_key, status, granted_by_membership_id, approved_by_membership_id,
         reason, idempotency_key_hash, request_fingerprint
       )
       SELECT CONCAT('oa-grant-hz2-', ROW_NUMBER() OVER (ORDER BY permission_key)),
              'oa-org-hq', 'oa-org-hz-sibling', 'hangzhou', permission_key, 'active',
              'oa-member-hq-global', 'oa-member-hq-global', 'integration sibling scope',
              SHA2(CONCAT('hz2:', permission_key), 256),
              SHA2(CONCAT('hz2-request:', permission_key), 256)
       FROM oa_role_permissions
       WHERE role_id = 'oa-role-hz-sibling'`,
    ];
    for (const statement of siblingSetup) await getMysqlPool().query(statement);
    hqToken = await oaLogin(app, "admin_global");
    branchToken = await oaLogin(app, "admin_hz");
    siblingToken = await oaLogin(app, "admin_hz_sibling");
  });

  afterAll(async () => {
    await app.close();
    await closeMysqlPool();
  });

  it("does not expose whether an OA username has an active membership", async () => {
    const username = `missing_oa_${randomUUID()}`;
    const issued = await app.inject({
      method: "POST",
      url: "/api/auth/oa/code",
      payload: { username },
    });
    expect(issued.statusCode, issued.body).toBe(200);

    const debug = await app.inject({
      method: "GET",
      url: `/api/auth/oa/debug-code?username=${encodeURIComponent(username)}`,
    });
    expect(debug.statusCode, debug.body).toBe(200);

    const loggedIn = await app.inject({
      method: "POST",
      url: "/api/auth/oa/login",
      payload: { username, code: debug.json().code },
    });
    expect(loggedIn.statusCode).toBe(401);
    expect(loggedIn.json()).toMatchObject({ error: "invalid OA credentials" });
  });

  it("resolves headquarters and branch scopes from server-side authorization state", async () => {
    const hq = await app.inject({ method: "GET", url: "/api/oa/me", headers: authorization(hqToken) });
    expect(hq.statusCode).toBe(200);
    expect(hq.json().principal).toMatchObject({
      organization: { organizationId: "oa-org-hq", organizationType: "headquarters" },
      cityCodes: expect.arrayContaining(["hangzhou", "shanghai", "beijing"]),
    });

    const branch = await app.inject({ method: "GET", url: "/api/oa/me", headers: authorization(branchToken) });
    expect(branch.statusCode).toBe(200);
    expect(branch.json().principal).toMatchObject({
      organization: { organizationId: "oa-org-hangzhou", organizationType: "branch" },
      cityCodes: ["hangzhou"],
    });
  });

  it("enforces city boundaries and replays idempotent task creation safely", async () => {
    const denied = await app.inject({
      method: "POST",
      url: "/api/oa/tasks",
      headers: authorization(branchToken),
      payload: {
        cityCode: "shanghai",
        organizationId: "oa-org-shanghai",
        title: "越权任务",
        idempotencyKey: `oa-denied-${randomUUID()}`,
        reason: "边界验证",
      },
    });
    expect(denied.statusCode).toBe(403);

    const idempotencyKey = `oa-task-${randomUUID()}`;
    const payload = {
      cityCode: "hangzhou",
      organizationId: "oa-org-hangzhou",
      title: "杭州分公司履约异常协同",
      description: "核对订单证据并回传总部",
      priority: "urgent",
      assigneeMembershipId: "oa-member-hangzhou",
      idempotencyKey,
      reason: "总部运营协同",
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/oa/tasks",
      headers: authorization(hqToken),
      payload,
    });
    expect(created.statusCode).toBe(200);
    createdTaskId = created.json().task.taskId;
    expect(created.json()).toMatchObject({ ok: true, idempotentReplay: false });

    const replayed = await app.inject({
      method: "POST",
      url: "/api/oa/tasks",
      headers: authorization(hqToken),
      payload,
    });
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toMatchObject({
      idempotentReplay: true,
      task: { taskId: created.json().task.taskId },
    });

    const branchTasks = await app.inject({
      method: "GET",
      url: "/api/oa/tasks?cityCode=hangzhou&assignee=me",
      headers: authorization(branchToken),
    });
    expect(branchTasks.statusCode).toBe(200);
    expect(branchTasks.json().tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: created.json().task.taskId, status: "claimed" }),
    ]));

    const notifications = await app.inject({
      method: "GET",
      url: "/api/oa/notifications?status=unread",
      headers: authorization(branchToken),
    });
    expect(notifications.statusCode).toBe(200);
    expect(notifications.json()).toMatchObject({
      unreadCount: expect.any(Number),
      notifications: expect.arrayContaining([
        expect.objectContaining({ sourceId: created.json().task.taskId, notificationType: "task.assigned" }),
      ]),
    });
    const notification = notifications.json().notifications.find(
      (notification: { sourceId: string }) => notification.sourceId === createdTaskId,
    );
    const notificationId = notification.notificationId;
    let markedVersion: number | undefined;
    for (const attempt of [1, 2]) {
      const marked = await app.inject({
        method: "POST",
        url: `/api/oa/notifications/${notificationId}/read`,
        headers: authorization(branchToken),
      });
      expect(marked.statusCode, `notification read attempt ${attempt}`).toBe(200);
      expect(marked.json().notification.version).toBe(notification.version + 1);
      markedVersion = marked.json().notification.version;
    }
    expect(markedVersion).toBe(notification.version + 1);
  });

  it("denies same-city sibling organization resources", async () => {
    const direct = await app.inject({
      method: "GET",
      url: `/api/oa/tasks/${createdTaskId}`,
      headers: authorization(siblingToken),
    });
    expect(direct.statusCode).toBe(404);
    const listed = await app.inject({
      method: "GET",
      url: "/api/oa/tasks?cityCode=hangzhou&assignee=all",
      headers: authorization(siblingToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().tasks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: createdTaskId }),
    ]));
  });

  it("uses each delegated permission's city scope in the composite workbench", async () => {
    await getMysqlPool().query(
      `INSERT INTO oa_organization_city_assignments (organization_id, city_code)
       VALUES ('oa-org-hangzhou', 'shanghai')
       ON DUPLICATE KEY UPDATE status = 'active', valid_to = NULL`,
    );
    await getMysqlPool().query(
      `INSERT INTO admin_city_scopes (admin_user_id, city_code)
       VALUES ('admin-hangzhou', 'shanghai')
       ON DUPLICATE KEY UPDATE city_code = VALUES(city_code)`,
    );
    await getMysqlPool().query(
      `INSERT INTO oa_delegation_grants (
         grant_id, grantor_organization_id, grantee_organization_id, city_code,
         permission_key, status, granted_by_membership_id, approved_by_membership_id,
         reason, idempotency_key_hash, request_fingerprint
       ) VALUES (
         ?, 'oa-org-hq', 'oa-org-hangzhou', 'shanghai', 'oa.workbench.read', 'active',
         'oa-member-hq-global', 'oa-member-hq-global', 'workbench-only city',
         SHA2(?, 256), SHA2(?, 256)
       )`,
      [`oa-grant-${randomUUID()}`, `workbench-${randomUUID()}`, `request-${randomUUID()}`],
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/oa/tasks",
      headers: authorization(hqToken),
      payload: {
        cityCode: "shanghai",
        organizationId: "oa-org-hangzhou",
        title: "不应出现在杭州分公司工作台的上海任务",
        assigneeMembershipId: "oa-member-hangzhou",
        idempotencyKey: `oa-scope-${randomUUID()}`,
        reason: "多权限城市范围验证",
      },
    });
    expect(created.statusCode).toBe(200);
    const workbench = await app.inject({
      method: "GET",
      url: "/api/oa/workbench",
      headers: authorization(branchToken),
    });
    expect(workbench.statusCode).toBe(200);
    expect(workbench.json().principal.cityCodes).toEqual(expect.arrayContaining(["hangzhou", "shanghai"]));
    expect(workbench.json().tasks).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: created.json().task.taskId }),
    ]));
  });

  it("enforces maker-checker approval and notifies the requester", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/oa/approvals",
      headers: authorization(branchToken),
      payload: {
        cityCode: "hangzhou",
        organizationId: "oa-org-hangzhou",
        requestType: "operations.exception",
        title: "杭州异常调度动作审批",
        description: "请求总部复核后再执行",
        requiredPermission: "operations.dispatch.manage",
        idempotencyKey: `oa-approval-${randomUUID()}`,
        reason: "分公司提交总部复核",
      },
    });
    expect(created.statusCode).toBe(200);
    const approval = created.json().approval;

    const selfDecision = await app.inject({
      method: "POST",
      url: `/api/oa/approvals/${approval.approvalRequestId}/decision`,
      headers: authorization(branchToken),
      payload: {
        expectedVersion: approval.version,
        decision: "approved",
        reason: "自己批准",
        idempotencyKey: `oa-self-decision-${randomUUID()}`,
      },
    });
    expect(selfDecision.statusCode).toBe(403);

    const decided = await app.inject({
      method: "POST",
      url: `/api/oa/approvals/${approval.approvalRequestId}/decision`,
      headers: authorization(hqToken),
      payload: {
        expectedVersion: approval.version,
        decision: "approved",
        reason: "总部复核通过",
        idempotencyKey: `oa-hq-decision-${randomUUID()}`,
      },
    });
    expect(decided.statusCode).toBe(200);
    expect(decided.json().approval.status).toBe("approved");

    const notifications = await app.inject({
      method: "GET",
      url: "/api/oa/notifications?status=unread",
      headers: authorization(branchToken),
    });
    expect(notifications.json().notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceId: approval.approvalRequestId,
        notificationType: "approval.approved",
      }),
    ]));
  });

  it("lets a requester resubmit a returned approval with a new decision step", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/oa/approvals",
      headers: authorization(branchToken),
      payload: {
        cityCode: "hangzhou",
        organizationId: "oa-org-hangzhou",
        requestType: "operations.exception",
        title: "需要补充材料的协同审批",
        requiredPermission: "operations.dispatch.manage",
        idempotencyKey: `oa-return-${randomUUID()}`,
        reason: "验证退回后重提",
      },
    });
    expect(created.statusCode).toBe(200);
    const returned = await app.inject({
      method: "POST",
      url: `/api/oa/approvals/${created.json().approval.approvalRequestId}/decision`,
      headers: authorization(hqToken),
      payload: {
        expectedVersion: created.json().approval.version,
        decision: "returned",
        reason: "请补充现场证据",
        idempotencyKey: `oa-return-decision-${randomUUID()}`,
      },
    });
    expect(returned.statusCode).toBe(200);
    expect(returned.json().approval.status).toBe("draft");
    const resubmitted = await app.inject({
      method: "POST",
      url: `/api/oa/approvals/${created.json().approval.approvalRequestId}/resubmit`,
      headers: authorization(branchToken),
      payload: {
        expectedVersion: returned.json().approval.version,
        reason: "现场证据已补充",
        idempotencyKey: `oa-resubmit-${randomUUID()}`,
      },
    });
    expect(resubmitted.statusCode).toBe(200);
    expect(resubmitted.json().approval).toMatchObject({
      status: "pending",
      currentStepOrder: 2,
    });
    const approved = await app.inject({
      method: "POST",
      url: `/api/oa/approvals/${created.json().approval.approvalRequestId}/decision`,
      headers: authorization(hqToken),
      payload: {
        expectedVersion: resubmitted.json().approval.version,
        decision: "approved",
        reason: "补充材料后通过",
        idempotencyKey: `oa-reapprove-${randomUUID()}`,
      },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().approval.status).toBe("approved");
  });

  it("projects outbox summaries without copying raw payloads and exposes audit evidence", async () => {
    const eventId = `oa-e2e-${randomUUID()}`;
    await getMysqlPool().query(
      `INSERT INTO event_outbox (
         event_id, event_type, event_major_version, aggregate_type, aggregate_id,
         city_code, payload_json, status
       ) VALUES (?, 'order.created', 1, 'order', ?, 'hangzhou', ?, 'pending')`,
      [eventId, `order-${randomUUID()}`, JSON.stringify({ customerPhone: "13800138000", secret: "must-not-project" })],
    );
    expect((await oaActivityProjectionService.runOnce("hangzhou", 500)).processed).toBeGreaterThan(0);

    const activity = await app.inject({
      method: "GET",
      url: "/api/oa/activity?cityCode=hangzhou&limit=200",
      headers: authorization(hqToken),
    });
    expect(activity.statusCode).toBe(200);
    const projected = activity.json().activities.find((item: { sourceEventId: string }) => item.sourceEventId === eventId);
    expect(projected).toMatchObject({ eventType: "order.created", sourceDomain: "order" });
    expect(JSON.stringify(projected)).not.toContain("13800138000");
    expect(JSON.stringify(projected)).not.toContain("must-not-project");

    const audit = await app.inject({
      method: "GET",
      url: "/api/oa/audit-records?cityCode=hangzhou&limit=200",
      headers: authorization(hqToken),
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().records.length).toBeGreaterThan(0);
    expect(audit.json().records).toEqual(expect.arrayContaining([
      expect.objectContaining({ decision: "allowed", traceId: expect.any(String) }),
    ]));
  });

  it("rejects an OA token whose jti no longer matches the server session", async () => {
    const token = await oaLogin(app, "admin_hz");
    const verified = verifyToken(token);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    await getMysqlPool().query(
      "UPDATE oa_sessions SET token_jti = ? WHERE session_id = ?",
      [randomUUID(), verified.payload.sid],
    );
    const response = await app.inject({
      method: "GET",
      url: "/api/oa/me",
      headers: authorization(token),
    });
    expect(response.statusCode).toBe(401);
  });
});
