import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { supportSlaBreachService } from "../../backend/src/support/ticket/supportSlaBreachService.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

vi.mock("@xlb/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xlb/config")>();
  return { ...actual, isKnownCityCode: (code: string) => code.startsWith("p24c3_") || actual.isKnownCityCode(code) };
});

const nonce = `${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
const cityCode = `p24c3_${nonce}`;
const adminUserId = `p24c3-op-${nonce}`;
const agentId = `p24c3-agent-${nonce}`;
const groupId = `p24c3-group-${nonce}`;
const breachTicketId = `p24c3-breach-${nonce}`;
const claimTicketId = `p24c3-claim-${nonce}`;
const fingerprint = "a".repeat(64);
const headers = bearerHeaders({ appType: "admin", role: "operator", userId: adminUserId, cityCode });

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("Phase 24C Phase 3 SLA breach and workbench claim", { timeout: 60_000 }, () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const pool = getMysqlPool();
    await pool.query("INSERT INTO cities(city_code,city_name,is_open) VALUES (?,?,1)", [cityCode, `Phase 24C3 ${nonce}`]);
    await pool.query(`INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES (?,?,'operator',JSON_ARRAY(?))`,
      [adminUserId, adminUserId, cityCode]);
    await pool.query("INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES (?,?)", [adminUserId, cityCode]);
    await pool.query(`INSERT INTO support_agents
      (agent_id,city_code,admin_user_id,display_name,lifecycle_status,work_status,create_idempotency_key,create_fingerprint)
      VALUES (?,?,?,'Phase 24C3 Operator','active','online',?,?)`,
      [agentId, cityCode, adminUserId, `p24c3-agent-${nonce}`, fingerprint]);
    await pool.query(`INSERT INTO support_skill_groups
      (skill_group_id,city_code,name,matched_types_json,matched_languages_json,priority_weight,is_default,is_active,create_idempotency_key,create_fingerprint)
      VALUES (?,?,?,JSON_ARRAY('other'),JSON_ARRAY(),0,0,1,?,?)`,
      [groupId, cityCode, `Phase24C3 ${nonce}`, `p24c3-group-${nonce}`, fingerprint]);
    await pool.query(`INSERT INTO support_agent_skill_groups
      (city_code,agent_id,skill_group_id,proficiency,is_primary,is_active,last_idempotency_key,last_mutation_fingerprint)
      VALUES (?,?,?,100,1,1,?,?)`, [cityCode, agentId, groupId, `p24c3-member-${nonce}`, fingerprint]);
    for (const [ticketId, due] of [[breachTicketId, "-13600000 MINUTE"], [claimTicketId, "+10 MINUTE"]] as const) {
      await pool.query(`INSERT INTO support_tickets
        (ticket_id,city_code,source,requester_id,type,priority,status,subject,description,
         assigned_skill_group_id,sla_first_response_due_at,sla_resolution_due_at,idempotency_key)
        VALUES (?,?,'customer',?,'other','normal','open','Phase 24C3','SLA workbench test',?,
          DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ${due}),DATE_ADD(CURRENT_TIMESTAMP(3),INTERVAL ${due}),?)`,
      [ticketId, cityCode, `p24c3-requester-${nonce}`, groupId, `p24c3-ticket-${ticketId}`]);
    }
    app = await buildApp();
  });

  afterAll(async () => {
    const pool = getMysqlPool();
    await pool.query("DELETE FROM support_ticket_events WHERE city_code=? AND ticket_id IN (?,?)", [cityCode, breachTicketId, claimTicketId]);
    await pool.query("DELETE FROM event_outbox WHERE city_code=? AND aggregate_id IN (?,?)", [cityCode, breachTicketId, claimTicketId]);
    await pool.query("DELETE FROM support_tickets WHERE city_code=? AND ticket_id IN (?,?)", [cityCode, breachTicketId, claimTicketId]);
    await pool.query("DELETE FROM support_agent_skill_groups WHERE city_code=? AND agent_id=?", [cityCode, agentId]);
    await pool.query("DELETE FROM support_skill_groups WHERE city_code=? AND skill_group_id=?", [cityCode, groupId]);
    await pool.query("DELETE FROM support_agents WHERE city_code=? AND agent_id=?", [cityCode, agentId]);
    await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id=? AND city_code=?", [adminUserId, cityCode]);
    await pool.query("DELETE FROM admin_users WHERE id=?", [adminUserId]);
    await pool.query("DELETE FROM cities WHERE city_code=?", [cityCode]);
    await app.close();
  });

  it("marks each SLA breach once, raises priority, and emits observable facts", async () => {
    const context = { traceId: `p24c3-${nonce}`, appType: "admin" as const, role: "operator" as const,
      cityCode, userId: adminUserId, requestStartedAt: new Date().toISOString() };
    expect((await supportSlaBreachService.runOnce(context, cityCode, 1)).processed).toBe(2);
    await supportSlaBreachService.runOnce(context, cityCode, 1);
    const pool = getMysqlPool();
    const [rows] = await pool.query<(RowDataPacket & { priority: string; first_marker: Date; resolution_marker: Date })[]>(
      `SELECT priority,sla_first_response_breached_at AS first_marker,
        sla_resolution_breached_at AS resolution_marker FROM support_tickets WHERE ticket_id=?`, [breachTicketId]);
    expect(rows[0]).toMatchObject({ priority: "urgent" });
    expect(rows[0]!.first_marker).toBeInstanceOf(Date);
    expect(rows[0]!.resolution_marker).toBeInstanceOf(Date);
    const [events] = await pool.query<RowDataPacket[]>(
      "SELECT ticket_event_id FROM support_ticket_events WHERE ticket_id=? AND event_type='sla_breached'", [breachTicketId]);
    const [outbox] = await pool.query<RowDataPacket[]>(
      "SELECT event_id FROM event_outbox WHERE aggregate_id=? AND event_type='support.sla.breached'", [breachTicketId]);
    expect(events).toHaveLength(2);
    expect(outbox).toHaveLength(2);
  });

  it("allows exactly one concurrent public-pool claimant and exposes bound SLA queues", async () => {
    const requests = ["a", "b"].map((suffix) => app.inject({ method: "POST",
      url: `/api/internal/support/tickets/${claimTicketId}/claim`, headers,
      payload: { expectedVersion: 1, idempotencyKey: `p24c3-claim-${suffix}-${nonce}` } }));
    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const mine = await app.inject({ method: "GET",
      url: "/api/internal/support/tickets?view=mine&sort=sla_due", headers });
    expect(mine.statusCode, mine.body).toBe(200);
    expect(mine.json().tickets.some((ticket: { ticketId: string }) => ticket.ticketId === claimTicketId)).toBe(true);
    const pool = await app.inject({ method: "GET",
      url: "/api/internal/support/tickets?view=skill_group&sort=sla_due", headers });
    expect(pool.statusCode, pool.body).toBe(200);
    expect(pool.json().tickets.some((ticket: { ticketId: string }) => ticket.ticketId === claimTicketId)).toBe(false);
  });
});
