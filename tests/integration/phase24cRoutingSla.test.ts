import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

vi.mock("@xlb/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xlb/config")>();
  return { ...actual, isKnownCityCode: (code: string) => code.startsWith("p24c2_") || actual.isKnownCityCode(code) };
});

const nonce = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const cityCode = `p24c2_${nonce.replaceAll("-", "_")}`;
const emergencyCityCode = `${cityCode}_e`;
const adminId = `p24c2-admin-${nonce}`;
const operatorId = `p24c2-operator-${nonce}`;
const shAdminId = `p24c2-sh-admin-${nonce}`;
const headers = {
  admin: bearerHeaders({ appType: "admin", role: "admin", userId: adminId, cityCode }),
  operator: bearerHeaders({ appType: "admin", role: "operator", userId: operatorId, cityCode }),
  shAdmin: bearerHeaders({ appType: "admin", role: "admin", userId: shAdminId, cityCode: emergencyCityCode }),
  customer: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode }),
  shCustomer: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: emergencyCityCode }),
};

type Ticket = {
  ticketId: string; assignedSkillGroupId: string | null; routingLanguage: string | null;
  slaFirstResponseDueAt: string | null; slaResolutionDueAt: string | null; createdAt: string;
};

describe("Phase 24C Phase 2 automatic routing and SLA snapshots", { timeout: 90_000 }, () => {
  let app: FastifyInstance;
  let exactGroupId = "";
  let neutralGroupId = "";
  let defaultGroupId = "";
  let exactPolicyId = "";
  let exactPolicyVersion = 0;
  let fallbackPolicyId = "";
  let fallbackPolicyVersion = 0;
  let firstExactTicket: Ticket;

  beforeAll(async () => {
    const pool = getMysqlPool();
    for (const city of [cityCode, emergencyCityCode]) {
      await pool.query("INSERT INTO cities(city_code,city_name,is_open) VALUES (?,?,1)", [city, `Phase 24C2 ${city}`]);
    }
    for (const [id, role, city] of [[adminId, "admin", cityCode], [operatorId, "operator", cityCode], [shAdminId, "admin", emergencyCityCode]] as const) {
      await pool.query(`INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES (?,?,?,JSON_ARRAY(?))
        ON DUPLICATE KEY UPDATE role=VALUES(role),city_scopes_json=VALUES(city_scopes_json)`, [id, id, role, city]);
      await pool.query("INSERT IGNORE INTO admin_city_scopes(admin_user_id,city_code) VALUES (?,?)", [id, city]);
    }
    app = await buildApp();
  });
  afterAll(async () => {
    const pool = getMysqlPool();
    for (const city of [cityCode, emergencyCityCode]) {
      await pool.query("DELETE FROM support_ticket_events WHERE city_code=?", [city]);
      await pool.query("DELETE FROM event_outbox WHERE city_code=? AND aggregate_type='support_ticket'", [city]);
      await pool.query("DELETE FROM support_tickets WHERE city_code=?", [city]);
      const [policies] = await pool.query<(RowDataPacket & { policy_id: string })[]>(
        "SELECT policy_id FROM support_sla_policies WHERE city_code=? ORDER BY revision DESC", [city],
      );
      for (const policy of policies) await pool.query("DELETE FROM support_sla_policies WHERE city_code=? AND policy_id=?", [city, policy.policy_id]);
      await pool.query("DELETE FROM support_skill_groups WHERE city_code=?", [city]);
    }
    await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id IN (?,?,?)", [adminId, operatorId, shAdminId]);
    await pool.query("DELETE FROM admin_users WHERE id IN (?,?,?)", [adminId, operatorId, shAdminId]);
    await pool.query("DELETE FROM cities WHERE city_code IN (?,?)", [cityCode, emergencyCityCode]);
    await app.close();
  });

  async function createGroup(name: string, matchedTypes: string[], matchedLanguages: string[], priorityWeight: number, isDefault = false) {
    const response = await app.inject({ method: "POST", url: "/api/internal/support/skill-groups", headers: headers.admin, payload: {
      name: `${name} ${nonce}`, matchedTypes, matchedLanguages, priorityWeight, isDefault, isActive: true,
      idempotencyKey: `p24c2-it-group-${name}-${nonce}`,
    } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().skillGroup.skillGroupId as string;
  }

  async function createPolicy(type: string, priority: string, first: number, resolution: number) {
    return app.inject({ method: "POST", url: "/api/internal/support/sla-policies", headers: headers.admin, payload: {
      type, priority, firstResponseMinutes: first, resolutionMinutes: resolution, isActive: true,
      idempotencyKey: `p24c2-it-policy-${type}-${priority}-${nonce}`,
    } });
  }

  async function createTicket(suffix: string, extra: Record<string, unknown> = {}, requestHeaders = headers.customer): Promise<Ticket> {
    const response = await app.inject({ method: "POST", url: "/api/support/tickets", headers: requestHeaders, payload: {
      type: "order_question", priority: "normal", subject: `Phase24C2 ${suffix}`,
      description: "Automatic routing and immutable SLA snapshot integration coverage",
      idempotencyKey: `p24c2-it-ticket-${suffix}-${nonce}`, ...extra,
    } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().ticket as Ticket;
  }

  it("restricts configuration to same-city Admin and creates deterministic groups and city policies", async () => {
    const denied = await app.inject({ method: "POST", url: "/api/internal/support/sla-policies", headers: headers.operator, payload: {
      type: "safety", priority: "critical", firstResponseMinutes: 5, resolutionMinutes: 30,
      idempotencyKey: `p24c2-it-denied-${nonce}`,
    } });
    expect(denied.statusCode, denied.body).toBe(403);

    const finiteFallback = await app.inject({ method: "POST", url: "/api/internal/support/sla-policies", headers: headers.admin, payload: {
      type: "other", priority: "normal", firstResponseMinutes: 240, resolutionMinutes: 2880,
      effectiveTo: new Date(Date.now() + 86_400_000).toISOString(), isActive: true,
      idempotencyKey: `p24c2-it-finite-fallback-${nonce}`,
    } });
    expect(finiteFallback.statusCode, finiteFallback.body).toBe(400);

    exactGroupId = await createGroup("exact-high", ["order_question"], ["zh-CN"], 999);
    await createGroup("exact-low", ["order_question"], ["zh-CN"], 998);
    neutralGroupId = await createGroup("neutral", ["order_question"], [], 997);
    defaultGroupId = await createGroup("default", ["other"], [], 1, true);

    const fallback = await createPolicy("other", "normal", 240, 2880);
    expect(fallback.statusCode, fallback.body).toBe(200);
    fallbackPolicyId = fallback.json().policy.policyId;
    fallbackPolicyVersion = fallback.json().policy.version;
    const exact = await createPolicy("order_question", "normal", 30, 240);
    expect(exact.statusCode, exact.body).toBe(200);
    exactPolicyId = exact.json().policy.policyId;
    exactPolicyVersion = exact.json().policy.version;

    const exactReplay = await createPolicy("order_question", "normal", 30, 240);
    expect(exactReplay.statusCode, exactReplay.body).toBe(200);
    expect(exactReplay.json().policy.policyId).toBe(exactPolicyId);
    const createKeyConflict = await app.inject({ method: "POST", url: "/api/internal/support/sla-policies", headers: headers.admin, payload: {
      type: "order_question", priority: "normal", firstResponseMinutes: 31, resolutionMinutes: 240,
      idempotencyKey: `p24c2-it-policy-order_question-normal-${nonce}`,
    } });
    expect(createKeyConflict.statusCode, createKeyConflict.body).toBe(409);
    const overlap = await app.inject({ method: "POST", url: "/api/internal/support/sla-policies", headers: headers.admin, payload: {
      type: "order_question", priority: "normal", firstResponseMinutes: 45, resolutionMinutes: 300,
      idempotencyKey: `p24c2-it-overlap-${nonce}`,
    } });
    expect(overlap.statusCode, overlap.body).toBe(409);
    const shList = await app.inject({ method: "GET", url: "/api/internal/support/sla-policies", headers: headers.shAdmin });
    expect(shList.statusCode, shList.body).toBe(200);
    expect(shList.json().policies).toHaveLength(0);
  });

  it("routes exact language before neutral/default, handles NULL, and snapshots exact/fallback/emergency SLA due times", async () => {
    const exact = await createTicket("exact", { preferredLanguage: "zh-CN" });
    firstExactTicket = exact;
    expect(exact).toMatchObject({ assignedSkillGroupId: exactGroupId, routingLanguage: "zh-cn" });
    const neutral = await createTicket("neutral", { preferredLanguage: "fr-FR" });
    expect(neutral).toMatchObject({ assignedSkillGroupId: neutralGroupId, routingLanguage: "fr-fr" });
    const defaulted = await createTicket("default", { type: "account_issue", preferredLanguage: "fr-FR" });
    expect(defaulted.assignedSkillGroupId).toBe(defaultGroupId);
    const absentLanguage = await createTicket("no-language");
    expect(absentLanguage).toMatchObject({ assignedSkillGroupId: neutralGroupId, routingLanguage: null });

    const emergency = await createTicket("emergency", { type: "safety", priority: "urgent" }, headers.shCustomer);
    expect(emergency.assignedSkillGroupId).toBeNull();

    const minutes = (ticket: Ticket, field: "slaFirstResponseDueAt" | "slaResolutionDueAt") =>
      (Date.parse(ticket[field]!) - Date.parse(ticket.createdAt)) / 60_000;
    expect(minutes(exact, "slaFirstResponseDueAt")).toBeCloseTo(30, 2);
    expect(minutes(exact, "slaResolutionDueAt")).toBeCloseTo(240, 2);
    expect(minutes(defaulted, "slaFirstResponseDueAt")).toBeCloseTo(240, 2);
    expect(minutes(defaulted, "slaResolutionDueAt")).toBeCloseTo(2880, 2);
    expect(minutes(emergency, "slaFirstResponseDueAt")).toBeCloseTo(240, 2);
    expect(minutes(emergency, "slaResolutionDueAt")).toBeCloseTo(2880, 2);
  });

  it("creates append-only policy revisions without changing existing tickets and preserves historical NULL display data", async () => {
    const revised = await app.inject({ method: "PATCH", url: `/api/internal/support/sla-policies/${exactPolicyId}`,
      headers: headers.admin, payload: {
        firstResponseMinutes: 15, resolutionMinutes: 120, expectedVersion: exactPolicyVersion,
        idempotencyKey: `p24c2-it-revise-${nonce}`,
      } });
    expect(revised.statusCode, revised.body).toBe(200);
    expect(revised.json().policy).toMatchObject({ revision: 2, supersedesPolicyId: exactPolicyId,
      firstResponseMinutes: 15, resolutionMinutes: 120 });
    const revisionBody = {
      firstResponseMinutes: 15, resolutionMinutes: 120, expectedVersion: exactPolicyVersion,
      idempotencyKey: `p24c2-it-revise-${nonce}`,
    };
    const revisionReplay = await app.inject({ method: "PATCH", url: `/api/internal/support/sla-policies/${exactPolicyId}`,
      headers: headers.admin, payload: revisionBody });
    expect(revisionReplay.statusCode, revisionReplay.body).toBe(200);
    expect(revisionReplay.json().policy.policyId).toBe(revised.json().policy.policyId);
    const revisionKeyConflict = await app.inject({ method: "PATCH", url: `/api/internal/support/sla-policies/${exactPolicyId}`,
      headers: headers.admin, payload: { ...revisionBody, resolutionMinutes: 121 } });
    expect(revisionKeyConflict.statusCode, revisionKeyConflict.body).toBe(409);
    const staleRevision = await app.inject({ method: "PATCH", url: `/api/internal/support/sla-policies/${exactPolicyId}`,
      headers: headers.admin, payload: {
        resolutionMinutes: 180, expectedVersion: exactPolicyVersion,
        idempotencyKey: `p24c2-it-stale-revision-${nonce}`,
      } });
    expect(staleRevision.statusCode, staleRevision.body).toBe(409);
    const disableFallback = await app.inject({ method: "PATCH", url: `/api/internal/support/sla-policies/${fallbackPolicyId}`,
      headers: headers.admin, payload: {
        isActive: false, expectedVersion: fallbackPolicyVersion,
        idempotencyKey: `p24c2-it-disable-fallback-${nonce}`,
      } });
    expect(disableFallback.statusCode, disableFallback.body).toBe(409);

    const afterRevision = await createTicket("after-revision", { preferredLanguage: "zh-CN" });
    expect((Date.parse(afterRevision.slaFirstResponseDueAt!) - Date.parse(afterRevision.createdAt)) / 60_000).toBeCloseTo(15, 2);
    const oldDetail = await app.inject({ method: "GET", url: `/api/internal/support/tickets/${firstExactTicket.ticketId}`, headers: headers.admin });
    expect(oldDetail.statusCode, oldDetail.body).toBe(200);
    expect(oldDetail.json().detail.ticket).toMatchObject({
      slaFirstResponseDueAt: firstExactTicket.slaFirstResponseDueAt,
      slaResolutionDueAt: firstExactTicket.slaResolutionDueAt,
    });

    await getMysqlPool().query(`UPDATE support_tickets SET assigned_skill_group_id=NULL,
      routing_language=NULL,sla_first_response_due_at=NULL,sla_resolution_due_at=NULL
      WHERE city_code=? AND ticket_id=?`, [cityCode, firstExactTicket.ticketId]);
    const historical = await app.inject({ method: "GET", url: `/api/internal/support/tickets/${firstExactTicket.ticketId}`, headers: headers.admin });
    expect(historical.statusCode, historical.body).toBe(200);
    expect(historical.json().detail.ticket).toMatchObject({
      assignedSkillGroupId: null, routingLanguage: null,
      slaFirstResponseDueAt: null, slaResolutionDueAt: null,
    });

    const [revisions] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT policy_id,revision FROM support_sla_policies WHERE city_code=? AND policy_series_id=? ORDER BY revision",
      [cityCode, revised.json().policy.policySeriesId],
    );
    expect(revisions).toHaveLength(2);
  });
});
