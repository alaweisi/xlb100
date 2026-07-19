import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";

const backend = "http://localhost:3100";
const runKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const adminId = `p24b-admin-${runKey}`;
const adminUsername = `p24b_admin_${runKey}`;
let createdSkillGroupId: string | null = null;
let createdAgentId: string | null = null;
let createdTicketId: string | null = null;

function adminHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "x-xlb-city-code": "hangzhou" };
}

async function ensureSupportSkillGroup(page: Page, session: { token: string }) {
  const created = await page.request.post(`${backend}/api/internal/support/skill-groups`, {
    headers: adminHeaders(session.token),
    data: {
      name: `Phase24B E2E safety ${runKey}`,
      matchedTypes: ["safety"],
      matchedLanguages: [],
      priorityWeight: 1000,
      isDefault: false,
      isActive: true,
      idempotencyKey: `phase24b-safety-group-${runKey}`,
    },
  });
  expect(created.ok()).toBeTruthy();
  createdSkillGroupId = (await created.json()).skillGroup.skillGroupId as string;
  return createdSkillGroupId;
}

async function ensureAssignableAgent(page: Page, session: { token: string; userId: string }, skillGroupId: string) {
  const headers = adminHeaders(session.token);
  const listed = await page.request.get(
    `${backend}/api/internal/support/agents?adminUserId=${encodeURIComponent(session.userId)}&limit=10`,
    { headers },
  );
  expect(listed.ok()).toBeTruthy();
  let agent = (await listed.json()).agents[0] as
    | { agentId: string; adminUserId: string; lifecycleStatus: string; version: number }
    | undefined;

  if (!agent) {
    const created = await page.request.post(`${backend}/api/internal/support/agents`, {
      headers,
      data: {
        adminUserId: session.userId,
        displayName: "Phase24B E2E agent",
        lifecycleStatus: "active",
        workStatus: "online",
        idempotencyKey: `phase24b-agent-${Date.now()}`,
      },
    });
    expect(created.ok()).toBeTruthy();
    agent = (await created.json()).agent;
    createdAgentId = agent!.agentId;
  } else if (agent.lifecycleStatus !== "active") {
    const updated = await page.request.patch(`${backend}/api/internal/support/agents/${agent.agentId}`, {
      headers,
      data: {
        lifecycleStatus: "active",
        workStatus: "online",
        expectedVersion: agent.version,
        idempotencyKey: `phase24b-agent-reactivate-${Date.now()}`,
      },
    });
    expect(updated.ok()).toBeTruthy();
    agent = (await updated.json()).agent;
  }

  const membership = await page.request.post(
    `${backend}/api/internal/support/agents/${agent!.agentId}/skill-groups`,
    {
      headers,
      data: {
        skillGroupId,
        proficiency: 100,
        isPrimary: true,
        expectedAgentVersion: agent!.version,
        idempotencyKey: `phase24b-membership-${Date.now()}`,
      },
    },
  );
  expect(membership.ok()).toBeTruthy();
  return agent!.adminUserId;
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  return () => expect(errors, "browser console/page errors").toEqual([]);
}

async function customerLogin(page: Page) {
  const phone = "13800000001";
  expect((await page.request.post(`${backend}/api/auth/customer/code`, { data: { phone } })).ok()).toBeTruthy();
  const debug = await page.request.get(`${backend}/api/auth/customer/debug-code?phone=${phone}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await page.request.post(`${backend}/api/auth/customer/login`, { data: { phone, code } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  await page.addInitScript(value => {
    localStorage.setItem("xlb.customer.token", value.token);
    localStorage.setItem("xlb.customer.userId", value.userId);
    localStorage.setItem("xlb.customer.cityCode", "hangzhou");
  }, session);
  return session;
}

async function adminLogin(page: Page) {
  const username = adminUsername;
  expect((await page.request.post(`${backend}/api/auth/admin/code`, { data: { username } })).ok()).toBeTruthy();
  const debug = await page.request.get(`${backend}/api/auth/admin/debug-code?username=${username}`);
  expect(debug.ok()).toBeTruthy();
  const { code } = await debug.json();
  const login = await page.request.post(`${backend}/api/auth/admin/login`, { data: { username, code } });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  await page.addInitScript(value => {
    localStorage.setItem("xlb.admin.token", value.token);
    localStorage.setItem("xlb.admin.userId", value.userId);
    localStorage.setItem("xlb.admin.role", value.role);
    localStorage.setItem("xlb.admin.username", value.username);
  }, { ...session, username });
  return session;
}

test.beforeAll(async () => {
  const pool = getMysqlPool();
  await pool.query(
    "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,'admin',JSON_ARRAY('hangzhou'))",
    [adminId, adminUsername],
  );
  await pool.query(
    "INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,'hangzhou')",
    [adminId],
  );
});

test.afterAll(async () => {
  const pool = getMysqlPool();
  if (createdTicketId) {
    await pool.query(
      "DELETE FROM support_ticket_events WHERE city_code='hangzhou' AND ticket_id=?",
      [createdTicketId],
    );
    await pool.query(
      "DELETE FROM support_tickets WHERE city_code='hangzhou' AND ticket_id=?",
      [createdTicketId],
    );
    await pool.query(
      "DELETE FROM event_outbox WHERE city_code='hangzhou' AND aggregate_type='support_ticket' AND aggregate_id=?",
      [createdTicketId],
    );
  }
  if (createdAgentId) {
    await pool.query(
      "DELETE FROM support_agent_skill_groups WHERE city_code='hangzhou' AND agent_id=?",
      [createdAgentId],
    );
    await pool.query(
      "DELETE FROM support_agents WHERE city_code='hangzhou' AND agent_id=?",
      [createdAgentId],
    );
  }
  if (createdSkillGroupId) {
    await pool.query(
      "DELETE FROM support_agent_skill_groups WHERE city_code='hangzhou' AND skill_group_id=?",
      [createdSkillGroupId],
    );
    await pool.query(
      "DELETE FROM support_skill_groups WHERE city_code='hangzhou' AND skill_group_id=?",
      [createdSkillGroupId],
    );
  }
  await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id=?", [adminId]);
  await pool.query("DELETE FROM admin_users WHERE id=?", [adminId]);
});

test("Customer creates, Admin resolves, and Customer reads the same persisted support ticket", async ({ page }) => {
  const assertClean = collectBrowserErrors(page);
  const subject = `Phase24B browser ${Date.now()}`;
  await customerLogin(page);
  const adminSession = await adminLogin(page);
  await ensureSupportSkillGroup(page, adminSession);

  await page.goto("http://localhost:5273/customer/support?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "Customer Support" })).toBeVisible();
  await page.getByLabel("Issue type").selectOption("safety");
  await page.getByLabel("Priority").selectOption("critical");
  await page.getByLabel("Subject").fill(subject);
  await page.getByLabel("Description").fill("Created from the real Customer UI for cross-app support verification");
  await page.getByRole("button", { name: "Submit issue" }).click();
  await expect(page.getByText("Support ticket created")).toBeVisible();
  await expect(page.getByRole("heading", { name: new RegExp(subject) })).toBeVisible();

  await page.goto("http://localhost:5275/#/support?cityCode=hangzhou");
  await expect(page.getByRole("heading", { name: "Agent Workbench" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "City support tickets" })).toBeVisible();
  await page.getByLabel("Priority").selectOption("critical");
  await page.getByLabel("Type").selectOption("safety");
  const row = page.getByRole("row").filter({ hasText: subject });
  await row.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(subject) })).toBeVisible();
  const ticketList = await page.request.get(
    `${backend}/api/internal/support/tickets?view=all&sort=sla_due&priority=critical&type=safety&limit=100`,
    { headers: adminHeaders(adminSession.token) },
  );
  expect(ticketList.ok()).toBeTruthy();
  const ticket = (await ticketList.json()).tickets.find((candidate: { subject: string }) => candidate.subject === subject);
  createdTicketId = ticket?.ticketId ?? null;
  expect(ticket?.assignedSkillGroupId).toBeTruthy();
  const assignedAgentId = await ensureAssignableAgent(page, adminSession, ticket.assignedSkillGroupId);
  await page.getByLabel("Assigned agent ID").fill(assignedAgentId);
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("assign completed")).toBeVisible();
  await page.getByLabel("Resolution note").fill("Verified and answered by the support operator");
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("resolve completed")).toBeVisible();

  await page.goto("http://localhost:5273/customer/support?cityCode=hangzhou");
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  const customerRow = page.getByRole("row").filter({ hasText: subject });
  await expect(customerRow.getByText("resolved", { exact: true })).toBeVisible();
  await customerRow.getByRole("button", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(subject) })).toBeVisible();
  await expect(page.getByText("resolved", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Verified and answered by the support operator", { exact: true })).toBeVisible();
  assertClean();
});
