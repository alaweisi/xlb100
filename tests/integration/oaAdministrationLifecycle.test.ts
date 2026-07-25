import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../backend/src/app.js";
import { closeMysqlPool, getMysqlPool } from "../../backend/src/dal/mysqlPool.js";

async function login(app: FastifyInstance, username: string): Promise<string> {
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
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/oa/login",
    payload: { username, code: debug.json().code },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().token as string;
}

function headers(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("OA administration lifecycle", { timeout: 60_000 }, () => {
  let app: FastifyInstance;
  let makerToken: string;
  let checkerToken: string;
  let limitedToken: string;
  let checkerMembershipId: string;

  beforeAll(async () => {
    app = await buildApp();
    const suffix = randomUUID().slice(0, 8);
    const checkerUserId = `admin-hq-checker-${suffix}`;
    const limitedUserId = `admin-hq-limited-${suffix}`;
    checkerMembershipId = `oa-member-hq-checker-${suffix}`;
    const limitedMembershipId = `oa-member-hq-limited-${suffix}`;
    const checkerUsername = `oa_hq_checker_${suffix}`;
    const limitedUsername = `oa_hq_limited_${suffix}`;
    await getMysqlPool().query(
      `INSERT INTO admin_users (id, username, role)
       VALUES (?, ?, 'admin'), (?, ?, 'operator')`,
      [checkerUserId, checkerUsername, limitedUserId, limitedUsername],
    );
    await getMysqlPool().query(
      `INSERT INTO admin_city_scopes (admin_user_id, city_code)
       VALUES (?, '__global__'), (?, 'beijing')`,
      [checkerUserId, limitedUserId],
    );
    await getMysqlPool().query(
      `INSERT INTO oa_memberships (
         membership_id, admin_user_id, organization_id, status, authz_version
       ) VALUES (?, ?, 'oa-org-hq', 'active', 1), (?, ?, 'oa-org-hq', 'active', 1)`,
      [checkerMembershipId, checkerUserId, limitedMembershipId, limitedUserId],
    );
    await getMysqlPool().query(
      `INSERT INTO oa_membership_roles (membership_id, role_id, granted_by_membership_id)
       VALUES (?, 'oa-role-hq-super', 'oa-member-hq-global'),
              (?, 'oa-role-hq-super', 'oa-member-hq-global')`,
      [checkerMembershipId, limitedMembershipId],
    );
    makerToken = await login(app, "admin_global");
    checkerToken = await login(app, checkerUsername);
    limitedToken = await login(app, limitedUsername);
  });

  afterAll(async () => {
    await app.close();
    await closeMysqlPool();
  });

  it("filters organization administration by the acting permission city scope", async () => {
    const allowed = await app.inject({
      method: "GET",
      url: "/api/oa/roles?organizationId=oa-org-beijing",
      headers: headers(limitedToken),
    });
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(Array.isArray(allowed.json().roles)).toBe(true);

    const denied = await app.inject({
      method: "GET",
      url: "/api/oa/roles?organizationId=oa-org-shanghai",
      headers: headers(limitedToken),
    });
    expect(denied.statusCode).toBe(403);

    const hiddenDelegations = await app.inject({
      method: "GET",
      url: "/api/oa/delegations",
      headers: headers(limitedToken),
    });
    expect(hiddenDelegations.statusCode, hiddenDelegations.body).toBe(200);
    expect(hiddenDelegations.json().delegations.every(
      (grant: { cityCode: string }) => grant.cityCode === "beijing",
    )).toBe(true);
  });

  it("creates roles and memberships with idempotency and permission-subset enforcement", async () => {
    const roleKey = `dispatch_viewer_${randomUUID().slice(0, 8)}`;
    const idempotencyKey = `oa-role-${randomUUID()}`;
    const payload = {
      organizationId: "oa-org-hangzhou",
      roleKey,
      name: "杭州调度观察员",
      permissions: ["operations.dispatch.read"],
      reason: "建立最小权限岗位",
      idempotencyKey,
    };
    const created = await app.inject({
      method: "POST",
      url: "/api/oa/roles",
      headers: headers(makerToken),
      payload,
    });
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json()).toMatchObject({
      idempotentReplay: false,
      role: { roleKey, permissions: ["operations.dispatch.read"] },
    });
    const replay = await app.inject({
      method: "POST",
      url: "/api/oa/roles",
      headers: headers(makerToken),
      payload,
    });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toMatchObject({
      idempotentReplay: true,
      role: { roleId: created.json().role.roleId },
    });

    const adminUserId = `admin-oa-member-${randomUUID().slice(0, 8)}`;
    await getMysqlPool().query(
      "INSERT INTO admin_users (id, username, role) VALUES (?, ?, 'operator')",
      [adminUserId, `oa_member_${randomUUID().slice(0, 8)}`],
    );
    await getMysqlPool().query(
      "INSERT INTO admin_city_scopes (admin_user_id, city_code) VALUES (?, 'hangzhou')",
      [adminUserId],
    );
    const membership = await app.inject({
      method: "POST",
      url: "/api/oa/memberships",
      headers: headers(makerToken),
      payload: {
        organizationId: "oa-org-hangzhou",
        adminUserId,
        roleIds: [created.json().role.roleId],
        reason: "纳入杭州分公司观察岗位",
        idempotencyKey: `oa-membership-${randomUUID()}`,
      },
    });
    expect(membership.statusCode, membership.body).toBe(200);
    expect(membership.json().membership).toMatchObject({
      userId: adminUserId,
      organizationId: "oa-org-hangzhou",
      roles: [expect.objectContaining({ roleKey })],
    });

    const escalation = await app.inject({
      method: "POST",
      url: `/api/oa/memberships/${membership.json().membership.membershipId}`,
      headers: headers(limitedToken),
      payload: {
        expectedAuthzVersion: membership.json().membership.authzVersion,
        roleIds: ["oa-role-branch-admin-hz"],
        reason: "尝试授予超出当前身份范围的角色",
        idempotencyKey: `oa-membership-escalation-${randomUUID()}`,
      },
    });
    expect(escalation.statusCode).toBe(403);
  });

  it("enforces unique branch city ownership", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/oa/organizations",
      headers: headers(makerToken),
      payload: {
        organizationCode: `hangzhou-duplicate-${randomUUID().slice(0, 6)}`,
        name: "杭州重复归属分公司",
        parentOrganizationId: "oa-org-hq",
        cityCodes: ["hangzhou"],
        reason: "验证城市唯一归属约束",
        idempotencyKey: `oa-org-duplicate-${randomUUID()}`,
      },
    });
    expect(response.statusCode).toBe(409);
  });

  it("requires a different headquarters membership to approve delegations", async () => {
    await getMysqlPool().query(
      `UPDATE oa_delegation_grants
       SET status = 'revoked', version = version + 1
       WHERE grantee_organization_id = 'oa-org-hangzhou'
         AND city_code = 'hangzhou'
         AND permission_key = 'marketing.read'
         AND status IN ('pending', 'active')`,
    );
    const created = await app.inject({
      method: "POST",
      url: "/api/oa/delegations",
      headers: headers(makerToken),
      payload: {
        granteeOrganizationId: "oa-org-hangzhou",
        cityCode: "hangzhou",
        permissionKey: "marketing.read",
        reason: "恢复杭州营销只读授权",
        idempotencyKey: `oa-delegation-${randomUUID()}`,
      },
    });
    expect(created.statusCode, created.body).toBe(200);
    expect(created.json().delegation).toMatchObject({
      status: "pending",
      approvedByMembershipId: null,
    });

    const selfApproval = await app.inject({
      method: "POST",
      url: `/api/oa/delegations/${created.json().delegation.grantId}/approve`,
      headers: headers(makerToken),
      payload: {
        expectedVersion: created.json().delegation.version,
        reason: "同人审批应被拒绝",
        idempotencyKey: `oa-delegation-self-${randomUUID()}`,
      },
    });
    expect(selfApproval.statusCode).toBe(403);

    const approved = await app.inject({
      method: "POST",
      url: `/api/oa/delegations/${created.json().delegation.grantId}/approve`,
      headers: headers(checkerToken),
      payload: {
        expectedVersion: created.json().delegation.version,
        reason: "总部第二管理员独立复核",
        idempotencyKey: `oa-delegation-approve-${randomUUID()}`,
      },
    });
    expect(approved.statusCode, approved.body).toBe(200);
    expect(approved.json().delegation).toMatchObject({
      status: "active",
      approvedByMembershipId: checkerMembershipId,
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/oa/delegations",
      headers: headers(makerToken),
      payload: {
        granteeOrganizationId: "oa-org-hangzhou",
        cityCode: "hangzhou",
        permissionKey: "marketing.read",
        reason: "重复授权应被拒绝",
        idempotencyKey: `oa-delegation-duplicate-${randomUUID()}`,
      },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it("does not let a city-limited headquarters member revoke another city's grant", async () => {
    const [rows] = await getMysqlPool().query<(import("mysql2/promise").RowDataPacket & {
      grant_id: string;
      version: number;
    })[]>(
      `SELECT grant_id, version FROM oa_delegation_grants
       WHERE grantee_organization_id = 'oa-org-shanghai'
         AND city_code = 'shanghai' AND status = 'active'
       LIMIT 1`,
    );
    expect(rows[0]).toBeTruthy();
    const response = await app.inject({
      method: "POST",
      url: `/api/oa/delegations/${rows[0].grant_id}/revoke`,
      headers: headers(limitedToken),
      payload: {
        expectedVersion: rows[0].version,
        reason: "跨城市撤销应被拒绝",
        idempotencyKey: `oa-delegation-cross-city-${randomUUID()}`,
      },
    });
    expect(response.statusCode).toBe(403);
  });
});
