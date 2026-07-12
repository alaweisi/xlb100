import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
const ids = {
  admin: `p24c-admin-${nonce}`, hzMember: `p24c-member-${nonce}`,
  hzOther: `p24c-other-${nonce}`, hzFree: `p24c-free-${nonce}`,
  shAdmin: `p24c-shadmin-${nonce}`, auditor: `p24c-auditor-${nonce}`,
};
const headers = {
  admin: bearerHeaders({ appType: "admin", role: "admin", userId: ids.admin, cityCode: "hangzhou" }),
  operator: bearerHeaders({ appType: "admin", role: "operator", userId: ids.hzMember, cityCode: "hangzhou" }),
  auditor: bearerHeaders({ appType: "admin", role: "auditor", userId: ids.auditor, cityCode: "hangzhou" }),
  shAdmin: bearerHeaders({ appType: "admin", role: "admin", userId: ids.shAdmin, cityCode: "shanghai" }),
  globalAdmin: bearerHeaders({ appType: "admin", role: "admin", userId: ids.admin, cityCode: "__global__" }),
  customer: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" }),
};

describe("Phase 24C Phase 1 agent profiles and skill groups", { timeout: 60_000 }, () => {
  let app: FastifyInstance;
  let memberAgentId = "";
  let otherAgentId = "";
  let hangzhouGroupId = "";

  beforeAll(async () => {
    const pool = getMysqlPool();
    for (const [id, role] of [[ids.admin, "admin"], [ids.hzMember, "operator"], [ids.hzOther, "operator"],
      [ids.hzFree, "operator"], [ids.shAdmin, "admin"], [ids.auditor, "auditor"]] as const) {
      await pool.query(`INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES (?,?,?,JSON_ARRAY(?))
        ON DUPLICATE KEY UPDATE role=VALUES(role),city_scopes_json=VALUES(city_scopes_json)`,
      [id, id, role, id === ids.shAdmin ? "shanghai" : "hangzhou"]);
    }
    for (const id of [ids.admin, ids.hzMember, ids.hzOther, ids.hzFree, ids.auditor]) {
      await pool.query("INSERT IGNORE INTO admin_city_scopes(admin_user_id,city_code) VALUES (?,'hangzhou')", [id]);
    }
    await pool.query("INSERT IGNORE INTO admin_city_scopes(admin_user_id,city_code) VALUES (?,'shanghai')", [ids.shAdmin]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  async function createAgent(adminUserId: string, suffix: string) {
    return app.inject({ method: "POST", url: "/api/internal/support/agents", headers: headers.admin, payload: {
      adminUserId, displayName: `Agent ${suffix}`, lifecycleStatus: "active", workStatus: "online",
      idempotencyKey: `p24c-agent-${nonce}-${suffix}`,
    } });
  }

  it("binds CRUD to current identities and permits only a real-city Admin to manage profiles", async () => {
    const created = await createAgent(ids.hzMember, "member");
    expect(created.statusCode, created.body).toBe(200);
    memberAgentId = created.json().agent.agentId;
    expect(created.json().agent).toMatchObject({ cityCode: "hangzhou", adminUserId: ids.hzMember,
      lifecycleStatus: "active", workStatus: "online", version: 1 });

    const other = await createAgent(ids.hzOther, "other");
    expect(other.statusCode, other.body).toBe(200);
    otherAgentId = other.json().agent.agentId;
    const list = await app.inject({ method: "GET", url: "/api/internal/support/agents", headers: headers.admin });
    expect(list.statusCode, list.body).toBe(200);
    expect(list.json().agents.map((agent: { adminUserId: string }) => agent.adminUserId)).toEqual(expect.arrayContaining([ids.hzMember, ids.hzOther]));

    const updated = await app.inject({ method: "PATCH", url: `/api/internal/support/agents/${memberAgentId}`, headers: headers.admin,
      payload: { displayName: "Updated support member", workStatus: "busy", expectedVersion: 1,
        idempotencyKey: `p24c-update-${nonce}` } });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().agent).toMatchObject({ displayName: "Updated support member", workStatus: "busy", version: 2 });
    const stale = await app.inject({ method: "PATCH", url: `/api/internal/support/agents/${memberAgentId}`, headers: headers.admin,
      payload: { displayName: "Must not persist", expectedVersion: 1, idempotencyKey: `p24c-stale-${nonce}` } });
    expect(stale.statusCode, stale.body).toBe(409);
    const [afterStale] = await getMysqlPool().query<(RowDataPacket & { display_name: string; version: number })[]>(
      "SELECT display_name,version FROM support_agents WHERE city_code='hangzhou' AND agent_id=?", [memberAgentId]);
    expect(afterStale[0]).toMatchObject({ display_name: "Updated support member", version: 2 });

    for (const denied of [headers.operator, headers.auditor]) {
      const response = await app.inject({ method: "POST", url: "/api/internal/support/agents", headers: denied, payload: {
        adminUserId: ids.hzFree, displayName: "Denied", idempotencyKey: `p24c-denied-${nonce}`,
      } });
      expect(response.statusCode, response.body).toBe(403);
    }
    expect((await app.inject({ method: "GET", url: "/api/internal/support/agents", headers: headers.auditor })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/internal/support/agents", headers: headers.customer,
      payload: { adminUserId: ids.hzFree, displayName: "Denied", idempotencyKey: `p24c-customer-${nonce}` } })).statusCode).toBe(403);
    expect((await createAgent(ids.auditor, "auditor-target")).statusCode).toBe(403);
    expect((await createAgent(ids.shAdmin, "cross-city-target")).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: "/api/internal/support/agents", headers: headers.globalAdmin })).statusCode).toBe(400);
  });

  it("manages groups and memberships with same-city FK and agent-version CAS", async () => {
    for (const denied of [headers.operator, headers.auditor]) {
      const response = await app.inject({ method: "POST", url: "/api/internal/support/skill-groups", headers: denied, payload: {
        name: `Denied group ${nonce}`, matchedTypes: ["other"], matchedLanguages: [],
        idempotencyKey: `p24c-denied-group-${nonce}`,
      } });
      expect(response.statusCode, response.body).toBe(403);
    }
    const group = await app.inject({ method: "POST", url: "/api/internal/support/skill-groups", headers: headers.admin, payload: {
      name: `Order support ${nonce}`, matchedTypes: ["order_question", "order_dispute"], matchedLanguages: ["zh-CN"],
      priorityWeight: 80, isDefault: false, isActive: true, idempotencyKey: `p24c-group-${nonce}`,
    } });
    expect(group.statusCode, group.body).toBe(200);
    hangzhouGroupId = group.json().skillGroup.skillGroupId;

    const staleMembership = await app.inject({ method: "POST", url: `/api/internal/support/agents/${memberAgentId}/skill-groups`,
      headers: headers.admin, payload: { skillGroupId: hangzhouGroupId, proficiency: 90, isPrimary: true,
        expectedAgentVersion: 1, idempotencyKey: `p24c-member-stale-${nonce}` } });
    expect(staleMembership.statusCode, staleMembership.body).toBe(409);
    const [staleRows] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT agent_id FROM support_agent_skill_groups WHERE city_code='hangzhou' AND agent_id=? AND skill_group_id=?",
      [memberAgentId, hangzhouGroupId]);
    expect(staleRows).toHaveLength(0);

    const membership = await app.inject({ method: "POST", url: `/api/internal/support/agents/${memberAgentId}/skill-groups`,
      headers: headers.admin, payload: { skillGroupId: hangzhouGroupId, proficiency: 90, isPrimary: true,
        expectedAgentVersion: 2, idempotencyKey: `p24c-member-${nonce}` } });
    expect(membership.statusCode, membership.body).toBe(200);
    expect(membership.json().membership).toMatchObject({ cityCode: "hangzhou", agentId: memberAgentId,
      skillGroupId: hangzhouGroupId, proficiency: 90, isPrimary: true, isActive: true });

    const shGroup = await app.inject({ method: "POST", url: "/api/internal/support/skill-groups", headers: headers.shAdmin, payload: {
      name: `Shanghai group ${nonce}`, matchedTypes: ["other"], matchedLanguages: [], isDefault: false,
      idempotencyKey: `p24c-shgroup-${nonce}`,
    } });
    expect(shGroup.statusCode, shGroup.body).toBe(200);
    await expect(getMysqlPool().query(`INSERT INTO support_agent_skill_groups
      (city_code,agent_id,skill_group_id,proficiency,is_primary,is_active,last_idempotency_key,last_mutation_fingerprint)
      VALUES ('hangzhou',?,?,50,0,1,?,?)`, [memberAgentId, shGroup.json().skillGroup.skillGroupId,
        `cross-${nonce}`, "0".repeat(64)]))
      .rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
  });

  it("rejects cross-group and stale assignment without side effects while preserving ungrouped Phase 24B assignment", async () => {
    const createTicket = async (suffix: string) => {
      const response = await app.inject({ method: "POST", url: "/api/support/tickets", headers: headers.customer, payload: {
        type: "order_question", priority: "normal", subject: `Phase24C ${suffix}`,
        description: "Phase 1 assignment compatibility integration", idempotencyKey: `p24c-ticket-${nonce}-${suffix}`,
      } });
      expect(response.statusCode, response.body).toBe(200);
      return response.json().ticket;
    };
    const grouped = await createTicket("grouped");
    await getMysqlPool().query("UPDATE support_tickets SET assigned_skill_group_id=? WHERE city_code='hangzhou' AND ticket_id=?",
      [hangzhouGroupId, grouped.ticketId]);
    const detail = await app.inject({ method: "GET", url: `/api/internal/support/tickets/${grouped.ticketId}`, headers: headers.admin });
    const version = detail.json().detail.ticket.version as number;
    const counts = async () => {
      const [events] = await getMysqlPool().query<RowDataPacket[]>("SELECT ticket_event_id FROM support_ticket_events WHERE city_code='hangzhou' AND ticket_id=?", [grouped.ticketId]);
      const [outbox] = await getMysqlPool().query<RowDataPacket[]>("SELECT event_id FROM event_outbox WHERE city_code='hangzhou' AND aggregate_id=?", [grouped.ticketId]);
      return [events.length, outbox.length];
    };
    const before = await counts();
    const stale = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${grouped.ticketId}/assign`, headers: headers.admin,
      payload: { assignedAgentId: ids.hzMember, expectedVersion: version - 1, idempotencyKey: `p24c-assign-stale-${nonce}` } });
    expect(stale.statusCode, stale.body).toBe(409);
    expect(await counts()).toEqual(before);
    const nonMember = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${grouped.ticketId}/assign`, headers: headers.admin,
      payload: { assignedAgentId: ids.hzOther, expectedVersion: version, idempotencyKey: `p24c-assign-wrong-group-${nonce}` } });
    expect(nonMember.statusCode, nonMember.body).toBe(403);
    expect(await counts()).toEqual(before);
    const assigned = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${grouped.ticketId}/assign`, headers: headers.admin,
      payload: { assignedAgentId: ids.hzMember, expectedVersion: version, idempotencyKey: `p24c-assign-member-${nonce}` } });
    expect(assigned.statusCode, assigned.body).toBe(200);
    expect(assigned.json().ticket.assignedAgentId).toBe(ids.hzMember);

    const ungrouped = await createTicket("ungrouped");
    const free = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ungrouped.ticketId}/assign`, headers: headers.admin,
      payload: { assignedAgentId: ids.hzFree, expectedVersion: ungrouped.version, idempotencyKey: `p24c-assign-free-${nonce}` } });
    expect(free.statusCode, free.body).toBe(200);
    expect(free.json().ticket).toMatchObject({ assignedAgentId: ids.hzFree, assignedSkillGroupId: null });

    const deleted = await app.inject({ method: "DELETE", url: `/api/internal/support/agents/${otherAgentId}`, headers: headers.admin,
      payload: { expectedVersion: 1, idempotencyKey: `p24c-delete-agent-${nonce}` } });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json().agent).toMatchObject({ agentId: otherAgentId, lifecycleStatus: "suspended", workStatus: "offline", version: 2 });
  });
});
