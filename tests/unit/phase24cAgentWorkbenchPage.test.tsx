// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportTicket } from "@xlb/types";

const adminApi = vi.hoisted(() => ({
  listSupportTickets: vi.fn(), getSupportTicket: vi.fn(), claimSupportTicket: vi.fn(),
  assignSupportTicket: vi.fn(), addSupportTicketComment: vi.fn(), escalateSupportTicket: vi.fn(),
  resolveSupportTicket: vi.fn(), closeSupportTicket: vi.fn(),
}));
vi.mock("../../apps/admin/src/adminAuth", () => ({
  adminOpsApi: adminApi,
  readStoredAdminSession: vi.fn(() => null),
}));
import { SupportTicketsPage } from "../../apps/admin/src/pages/SupportTicketsPage";

const at = "2026-07-12T08:00:00.000Z";
const makeTicket = (ticketId: string, overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  ticketId, cityCode: "hangzhou", source: "customer", requesterId: "customer-demo-hangzhou",
  businessClientId: null, type: "order_question", priority: "normal", status: "open",
  subject: `Ticket ${ticketId}`, description: "Please help", relatedOrderId: null,
  relatedWorkerId: null, linkedAftersaleComplaintId: null, assignedAgentId: null,
  assignedSkillGroupId: "skill-orders", routingLanguage: null,
  slaFirstResponseDueAt: null, slaResolutionDueAt: null, firstRespondedAt: null,
  slaFirstResponseBreachedAt: null, slaResolutionBreachedAt: null,
  resolvedAt: null, closedAt: null, resolutionCode: null, version: 2,
  createdAt: at, updatedAt: at, ...overrides,
});

afterEach(cleanup);

describe("Phase 24C Phase 3 agent workbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    adminApi.listSupportTickets.mockResolvedValue({ ok: true, tickets: [], nextCursor: null });
    adminApi.claimSupportTicket.mockResolvedValue({ ok: true, ticket: makeTicket("pool", { assignedAgentId: "admin-agent" }), event: {}, idempotent: false });
  });

  it("loads my queue with SLA ordering and switches to the skill-group pool", async () => {
    render(<SupportTicketsPage initialCityCode="hangzhou" />);
    await waitFor(() => expect(adminApi.listSupportTickets).toHaveBeenCalledWith(expect.objectContaining({ view: "mine", sort: "sla_due" })));

    fireEvent.change(screen.getByLabelText("队列"), { target: { value: "skill_group" } });
    await waitFor(() => expect(adminApi.listSupportTickets).toHaveBeenLastCalledWith(expect.objectContaining({ view: "skill_group", sort: "sla_due" })));
    expect(screen.getByRole("heading", { name: "技能组待领取" })).toBeTruthy();
  });

  it("renders normal, near-due and overdue SLA states", async () => {
    const now = Date.now();
    adminApi.listSupportTickets.mockResolvedValue({ ok: true, tickets: [
      makeTicket("normal", { slaFirstResponseDueAt: new Date(now + 90 * 60_000).toISOString() }),
      makeTicket("near", { slaFirstResponseDueAt: new Date(now + 10 * 60_000).toISOString() }),
      makeTicket("late", { slaFirstResponseDueAt: new Date(now - 5 * 60_000).toISOString() }),
    ], nextCursor: null });
    render(<SupportTicketsPage initialCityCode="hangzhou" />);

    expect(await screen.findByText(/剩余 90 分钟|剩余 89 分钟/)).toBeTruthy();
    expect(screen.getByText(/剩余 10 分钟|剩余 9 分钟/)).toBeTruthy();
    expect(screen.getByText(/已超时 5 分钟|已超时 6 分钟/)).toBeTruthy();
  });

  it("claims a public-pool ticket with the displayed CAS version", async () => {
    const poolTicket = makeTicket("pool");
    adminApi.listSupportTickets
      .mockResolvedValueOnce({ ok: true, tickets: [], nextCursor: null })
      .mockResolvedValue({ ok: true, tickets: [poolTicket], nextCursor: null });
    render(<SupportTicketsPage initialCityCode="hangzhou" />);
    await waitFor(() => expect(adminApi.listSupportTickets).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("队列"), { target: { value: "skill_group" } });
    fireEvent.click(await screen.findByRole("button", { name: "领取" }));

    await waitFor(() => expect(adminApi.claimSupportTicket).toHaveBeenCalledWith("pool", {
      expectedVersion: 2,
      idempotencyKey: expect.stringMatching(/^claim-/),
    }));
    expect(await screen.findByText("工单领取已完成")).toBeTruthy();
  });
});
