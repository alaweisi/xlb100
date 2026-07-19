// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportTicket, SupportTicketDetailResponse, SupportTicketEvent } from "@xlb/types";
import { CustomerSupportPage } from "../../apps/customer/src/pages/CustomerSupportPage";
import { WorkerSupportPage } from "../../apps/worker/src/pages/WorkerSupportPage";

const adminApi = vi.hoisted(() => ({
  listSupportTickets: vi.fn(), getSupportTicket: vi.fn(), assignSupportTicket: vi.fn(),
  addSupportTicketComment: vi.fn(), escalateSupportTicket: vi.fn(),
  resolveSupportTicket: vi.fn(), closeSupportTicket: vi.fn(),
}));
vi.mock("../../apps/admin/src/adminAuth", () => ({
  adminOpsApi: adminApi,
  readStoredAdminSession: vi.fn(() => null),
}));
import { SupportTicketsPage } from "../../apps/admin/src/pages/SupportTicketsPage";

const at = "2026-07-12T08:00:00.000Z";
const ticket = (overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  ticketId: "ticket-phase24b", cityCode: "hangzhou", source: "customer",
  requesterId: "customer-demo-hangzhou", businessClientId: null,
  type: "order_question", priority: "normal", status: "open",
  subject: "Where is my order", description: "Please check my order status",
  relatedOrderId: null, relatedWorkerId: null, linkedAftersaleComplaintId: null,
  assignedAgentId: null, assignedSkillGroupId: null, routingLanguage: null,
  slaFirstResponseDueAt: null, slaResolutionDueAt: null, firstRespondedAt: null,
  slaFirstResponseBreachedAt: null, slaResolutionBreachedAt: null,
  resolvedAt: null, closedAt: null, resolutionCode: null, version: 0,
  createdAt: at, updatedAt: at, ...overrides,
});
const event = (overrides: Partial<SupportTicketEvent> = {}): SupportTicketEvent => ({
  ticketEventId: "event-phase24b", cityCode: "hangzhou", ticketId: "ticket-phase24b",
  eventType: "created", actorType: "customer", actorId: "customer-demo-hangzhou",
  visibility: "requester", content: "Please check my order status", payload: {},
  createdAt: at, ...overrides,
});
const detail = (value = ticket(), events = [event()]): SupportTicketDetailResponse =>
  ({ ok: true, detail: { ticket: value, events } });

afterEach(cleanup);

describe("Phase 24B support pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({
      matches: false, media: "", onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }) });
    adminApi.listSupportTickets.mockResolvedValue({ ok: true, tickets: [ticket()], nextCursor: null });
    adminApi.getSupportTicket.mockResolvedValue(detail());
  });

  it("Customer submits through the API and shows success only after backend confirmation", async () => {
    let confirmCreate!: (value: { ok: true; ticket: SupportTicket }) => void;
    const createTicket = vi.fn(() => new Promise<{ ok: true; ticket: SupportTicket }>(resolve => { confirmCreate = resolve; }));
    const api = {
      createTicket,
      listTickets: vi.fn().mockResolvedValue({ ok: true, tickets: [ticket()], nextCursor: null }),
      getTicket: vi.fn().mockResolvedValue(detail()),
      addComment: vi.fn(), reopenTicket: vi.fn(),
    };
    render(<CustomerSupportPage api={api} />);
    await waitFor(() => expect(api.listTickets).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("问题标题"), { target: { value: "Need order help" } });
    fireEvent.change(screen.getByLabelText("问题描述"), { target: { value: "The order timeline is unclear" } });
    fireEvent.click(screen.getByRole("button", { name: "提交问题" }));

    expect(createTicket).toHaveBeenCalledWith(expect.objectContaining({
      type: "order_question", priority: "normal", subject: "Need order help",
      description: "The order timeline is unclear", idempotencyKey: expect.stringMatching(/^customer-ticket-/),
    }));
    expect(screen.queryByText("客服工单已创建")).toBeNull();
    confirmCreate({ ok: true, ticket: ticket() });
    expect(await screen.findByText("客服工单已创建")).toBeTruthy();
    expect(api.getTicket).toHaveBeenCalledWith("ticket-phase24b");
  });

  it("Customer reports a rejected create and never renders a UI-only success", async () => {
    const api = {
      createTicket: vi.fn().mockRejectedValue(new Error("API POST failed: 409")),
      listTickets: vi.fn().mockResolvedValue({ ok: true, tickets: [], nextCursor: null }),
      getTicket: vi.fn(), addComment: vi.fn(), reopenTicket: vi.fn(),
    };
    render(<CustomerSupportPage api={api} />);
    await screen.findByText("暂无客服工单");
    fireEvent.change(screen.getByLabelText("问题标题"), { target: { value: "Duplicate issue" } });
    fireEvent.change(screen.getByLabelText("问题描述"), { target: { value: "This must be rejected by API" } });
    fireEvent.click(screen.getByRole("button", { name: "提交问题" }));
    expect(await screen.findByText("API POST failed: 409")).toBeTruthy();
    expect(screen.queryByText("客服工单已创建")).toBeNull();
  });

  it("Worker opens its ticket and sends a requester-visible message through the API", async () => {
    const workerTicket = ticket({ source: "worker", requesterId: "worker-demo-hangzhou", type: "withdrawal_issue", subject: "Withdrawal delayed" });
    const api = {
      createTicket: vi.fn(),
      listTickets: vi.fn().mockResolvedValue({ ok: true, tickets: [workerTicket], nextCursor: null }),
      getTicket: vi.fn()
        .mockResolvedValueOnce(detail(workerTicket))
        .mockResolvedValueOnce(detail(workerTicket, [event({ actorType: "worker" }), event({ ticketEventId: "comment-1", eventType: "commented", actorType: "worker", content: "Please investigate" })])),
      addComment: vi.fn().mockResolvedValue({ ok: true, ticket: workerTicket, event: event({ eventType: "commented" }), idempotent: false }),
      reopenTicket: vi.fn(),
    };
    render(<WorkerSupportPage api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "查看" }));
    fireEvent.change(await screen.findByLabelText("补充留言"), { target: { value: "Please investigate" } });
    fireEvent.click(screen.getByRole("button", { name: "发送留言" }));
    await waitFor(() => expect(api.addComment).toHaveBeenCalledWith("ticket-phase24b", {
      content: "Please investigate", idempotencyKey: expect.stringMatching(/^worker-comment-/),
    }));
    expect(await screen.findByText("留言已发送。")).toBeTruthy();
    expect(api.getTicket).toHaveBeenCalledTimes(2);
  });

  it("Admin opens a real queue item and assigns it using the displayed CAS version", async () => {
    const assigned = ticket({ status: "processing", assignedAgentId: "admin-agent-1", version: 1 });
    adminApi.assignSupportTicket.mockResolvedValue({ ok: true, ticket: assigned, event: event({ eventType: "assigned", actorType: "admin" }), idempotent: false });
    adminApi.listSupportTickets
      .mockResolvedValueOnce({ ok: true, tickets: [ticket()], nextCursor: null })
      .mockResolvedValueOnce({ ok: true, tickets: [assigned], nextCursor: null });
    adminApi.getSupportTicket
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail(assigned, [event(), event({ ticketEventId: "assigned-1", eventType: "assigned", actorType: "admin" })]));
    render(<SupportTicketsPage initialCityCode="hangzhou" />);
    fireEvent.click(await screen.findByRole("button", { name: "打开" }));
    fireEvent.change(await screen.findByLabelText("负责客服编号"), { target: { value: "admin-agent-1" } });
    fireEvent.click(screen.getByRole("button", { name: "分配" }));
    await waitFor(() => expect(adminApi.assignSupportTicket).toHaveBeenCalledWith("ticket-phase24b", {
      assignedAgentId: "admin-agent-1", expectedVersion: 0,
      idempotencyKey: expect.stringMatching(/^assign-/),
    }));
    expect(await screen.findByText("分配工单已完成")).toBeTruthy();
    expect(screen.getAllByText("处理中").length).toBeGreaterThan(0);
  });
});
