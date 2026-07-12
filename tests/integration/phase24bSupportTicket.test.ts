import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload.js";

const customer = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" });
const otherCustomer = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-002", cityCode: "hangzhou" });
const customerShanghai = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "shanghai" });
const worker = bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou", cityCode: "hangzhou" });
const operator = bearerHeaders({ appType: "admin", role: "operator", userId: "admin-demo-001", cityCode: "hangzhou" });
const operatorShanghai = bearerHeaders({ appType: "admin", role: "operator", userId: "admin-demo-001", cityCode: "shanghai" });
const auditor = bearerHeaders({ appType: "admin", role: "auditor", userId: "admin-demo-001", cityCode: "hangzhou" });

type Ticket = { ticketId: string; status: string; version: number; relatedWorkerId: string | null; linkedAftersaleComplaintId: string | null };
type Mutation = { ok: true; ticket: Ticket; event: { ticketEventId: string; eventType: string }; idempotent: boolean };

describe("Phase 24B support ticket API", { timeout: 60_000 }, () => {
  let app: FastifyInstance;
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  async function create(headers: Record<string, string>, suffix: string, extra: Record<string, unknown> = {}) {
    return app.inject({ method: "POST", url: "/api/support/tickets", headers, payload: {
      type: "order_question", priority: "normal", subject: `Phase24B ${suffix}`,
      description: `Real support ticket integration coverage ${suffix}`,
      idempotencyKey: `p24b-${nonce}-${suffix}`, ...extra,
    } });
  }

  it("creates Customer and Worker tickets idempotently and enforces requester, role, and city isolation", async () => {
    const created = await create(customer, "customer");
    expect(created.statusCode, created.body).toBe(200);
    const customerTicket = created.json().ticket as Ticket;
    const replay = await create(customer, "customer");
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json().ticket.ticketId).toBe(customerTicket.ticketId);

    const workerCreated = await create(worker, "worker", { type: "withdrawal_issue" });
    expect(workerCreated.statusCode, workerCreated.body).toBe(200);
    expect(workerCreated.json().ticket).toMatchObject({ source: "worker", requesterId: "worker-demo-hangzhou", relatedWorkerId: "worker-demo-hangzhou" });
    const workerTicketId = workerCreated.json().ticket.ticketId as string;
    const workerList = await app.inject({ method: "GET", url: "/api/support/tickets", headers: worker });
    expect(workerList.statusCode, workerList.body).toBe(200);
    expect(workerList.json().tickets.some((item: Ticket) => item.ticketId === workerTicketId)).toBe(true);
    expect((await app.inject({ method: "GET", url: `/api/support/tickets/${workerTicketId}`, headers: worker })).statusCode).toBe(200);

    const ownList = await app.inject({ method: "GET", url: "/api/support/tickets", headers: customer });
    expect(ownList.statusCode, ownList.body).toBe(200);
    expect(ownList.json().tickets.some((item: Ticket) => item.ticketId === customerTicket.ticketId)).toBe(true);
    expect(ownList.json().tickets.some((item: Ticket) => item.ticketId === workerCreated.json().ticket.ticketId)).toBe(false);
    expect((await app.inject({ method: "GET", url: `/api/support/tickets/${customerTicket.ticketId}`, headers: customer })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/support/tickets/${customerTicket.ticketId}`, headers: otherCustomer })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/support/tickets/${customerTicket.ticketId}`, headers: customerShanghai })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/internal/support/tickets/${customerTicket.ticketId}`, headers: operatorShanghai })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/internal/support/tickets", headers: customer })).statusCode).toBe(403);
    expect((await create(operator, "wrong-role")).statusCode).toBe(403);
  });

  it("supports idempotent comments and the full Admin lifecycle with CAS conflict, reopen, and transactional Outbox facts", async () => {
    const created = await create(customer, "lifecycle");
    expect(created.statusCode, created.body).toBe(200);
    let current = created.json().ticket as Ticket;
    const ticketId = current.ticketId;

    const commentBody = { content: "Requester supplied more detail", idempotencyKey: `p24b-${nonce}-requester-comment` };
    const comment = await app.inject({ method: "POST", url: `/api/support/tickets/${ticketId}/events`, headers: customer, payload: commentBody });
    expect(comment.statusCode, comment.body).toBe(200);
    const replay = await app.inject({ method: "POST", url: `/api/support/tickets/${ticketId}/events`, headers: customer, payload: commentBody });
    expect(replay.statusCode, replay.body).toBe(200);
    expect(replay.json()).toMatchObject({ idempotent: true, event: { ticketEventId: comment.json().event.ticketEventId } });

    const assign = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/assign`, headers: operator, payload: {
      assignedAgentId: "admin-hangzhou", expectedVersion: current.version, idempotencyKey: `p24b-${nonce}-assign-1`,
    } });
    expect(assign.statusCode, assign.body).toBe(200);
    current = (assign.json() as Mutation).ticket;

    const stale = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/escalate`, headers: operator, payload: {
      reason: "stale version must fail", expectedVersion: current.version - 1, idempotencyKey: `p24b-${nonce}-stale`,
    } });
    expect(stale.statusCode, stale.body).toBe(409);

    const internalComment = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/events`, headers: operator, payload: {
      content: "Internal diagnostic note", visibility: "internal", idempotencyKey: `p24b-${nonce}-admin-comment`,
    } });
    expect(internalComment.statusCode, internalComment.body).toBe(200);
    current = internalComment.json().ticket;
    const requesterDetail = await app.inject({ method: "GET", url: `/api/support/tickets/${ticketId}`, headers: customer });
    expect(requesterDetail.json().detail.events.some((item: { content: string | null }) => item.content === "Internal diagnostic note")).toBe(false);

    const escalated = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/escalate`, headers: operator, payload: {
      reason: "specialist review", expectedVersion: current.version, idempotencyKey: `p24b-${nonce}-escalate`,
    } });
    expect(escalated.statusCode, escalated.body).toBe(200);
    current = escalated.json().ticket;
    const resolved = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/resolve`, headers: operator, payload: {
      resolutionCode: "answered", resolutionNote: "Specialist supplied the answer", expectedVersion: current.version,
      idempotencyKey: `p24b-${nonce}-resolve-1`,
    } });
    expect(resolved.statusCode, resolved.body).toBe(200);
    current = resolved.json().ticket;
    expect(current.status).toBe("resolved");

    const reopened = await app.inject({ method: "POST", url: `/api/support/tickets/${ticketId}/reopen`, headers: customer, payload: {
      reason: "Need one clarification", idempotencyKey: `p24b-${nonce}-reopen`,
    } });
    expect(reopened.statusCode, reopened.body).toBe(200);
    current = reopened.json().ticket;
    expect(current.status).toBe("processing");
    const resolvedAgain = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/resolve`, headers: operator, payload: {
      resolutionCode: "answered", resolutionNote: "Clarification supplied", expectedVersion: current.version,
      idempotencyKey: `p24b-${nonce}-resolve-2`,
    } });
    expect(resolvedAgain.statusCode, resolvedAgain.body).toBe(200);
    current = resolvedAgain.json().ticket;
    const closed = await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/close`, headers: operator, payload: {
      reason: "Requester confirmed", expectedVersion: current.version, idempotencyKey: `p24b-${nonce}-close`,
    } });
    expect(closed.statusCode, closed.body).toBe(200);
    expect(closed.json().ticket.status).toBe("closed");
    expect((await app.inject({ method: "POST", url: `/api/internal/support/tickets/${ticketId}/assign`, headers: auditor, payload: {
      assignedAgentId: "admin-hangzhou", expectedVersion: closed.json().ticket.version, idempotencyKey: `p24b-${nonce}-auditor`,
    } })).statusCode).toBe(403);

    const [outbox] = await getMysqlPool().query<(RowDataPacket & { event_type: string })[]>(
      "SELECT event_type FROM event_outbox WHERE city_code='hangzhou' AND aggregate_id=? ORDER BY created_at,event_id", [ticketId],
    );
    const outboxTypes = outbox.map(row => row.event_type);
    expect(outboxTypes).toHaveLength(7);
    expect(outboxTypes.filter(value => value === "support.ticket.resolved")).toHaveLength(2);
    for (const expected of ["support.ticket.created", "support.ticket.assigned", "support.ticket.escalated", "support.ticket.reopened", "support.ticket.closed"]) {
      expect(outboxTypes.filter(value => value === expected), expected).toHaveLength(1);
    }
    const [eventRows] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT ticket_event_id FROM support_ticket_events WHERE city_code='hangzhou' AND ticket_id=?", [ticketId],
    );
    expect(eventRows).toHaveLength(9); // create, 2 comments, assign, escalate, 2 resolve, reopen, close
  });

  it("links an existing Phase 17 complaint read-only and produces no refund, ledger, or dispatch side effects", async () => {
    const order = await app.inject({ method: "POST", url: "/api/orders", headers: customer, payload: {
      customerId: "customer-demo-001", skuId: "sku_home_daily_2h", quantity: 1, ...serviceAddressSchedulePayload,
    } });
    expect(order.statusCode, order.body).toBe(200);
    const orderId = order.json().order.orderId as string;
    const complaint = await app.inject({ method: "POST", url: "/api/aftersale/complaints", headers: customer, payload: {
      orderId, category: "service_quality", priority: "normal",
      description: "Phase 24B read-only linked complaint integration coverage",
      idempotencyKey: `p24b-${nonce}-complaint`,
    } });
    expect(complaint.statusCode, complaint.body).toBe(200);
    const complaintId = complaint.json().complaint.complaintId as string;
    const beforeStatus = complaint.json().complaint.status;

    const linked = await create(customer, "linked", {
      type: "service_complaint", relatedOrderId: orderId, linkedAftersaleComplaintId: complaintId,
    });
    expect(linked.statusCode, linked.body).toBe(200);
    expect(linked.json().ticket).toMatchObject({ relatedOrderId: orderId, linkedAftersaleComplaintId: complaintId });
    expect((await create(otherCustomer, "foreign-link", {
      type: "service_complaint", relatedOrderId: orderId, linkedAftersaleComplaintId: complaintId,
    })).statusCode).toBe(404);

    const complaintAfter = await app.inject({ method: "GET", url: `/api/aftersale/complaints/${complaintId}`, headers: customer });
    expect(complaintAfter.statusCode, complaintAfter.body).toBe(200);
    expect(complaintAfter.json().detail.complaint.status).toBe(beforeStatus);
    for (const [table, idColumn] of [["aftersale_refund_requests", "refund_id"], ["ledger_accruals", "accrual_id"], ["dispatch_tasks", "dispatch_task_id"]] as const) {
      const [rows] = await getMysqlPool().query<RowDataPacket[]>(`SELECT ${idColumn} FROM ${table} WHERE city_code=? AND order_id=?`, ["hangzhou", orderId]);
      expect(rows, `${table} must remain untouched`).toHaveLength(0);
    }
  });
});
