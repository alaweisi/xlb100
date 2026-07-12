import { describe, expect, it } from "vitest";
import {
  adminAddSupportTicketCommentRequestSchema,
  assignSupportTicketRequestSchema,
  createSupportTicketRequestSchema,
  outboxEventTypeSchema,
  supportTicketSchema,
} from "@xlb/validators";

describe("Phase 24B support ticket contracts", () => {
  it("derives source from authentication instead of accepting a spoofable source", () => {
    const valid = {
      type: "order_question",
      priority: "normal",
      subject: "Appointment question",
      description: "Please confirm the expected arrival window.",
      relatedOrderId: "ord_support_contract",
      idempotencyKey: "support-contract-create-001",
    };
    expect(createSupportTicketRequestSchema.safeParse(valid).success).toBe(true);
    expect(createSupportTicketRequestSchema.safeParse({ ...valid, source: "enterprise" }).success).toBe(false);
    expect(createSupportTicketRequestSchema.safeParse({ ...valid, requesterId: "another-user" }).success).toBe(false);
  });

  it("requires complaint links to carry an order and lets verified Worker context bind withdrawals", () => {
    expect(createSupportTicketRequestSchema.safeParse({
      type: "service_complaint", priority: "high", subject: "Complaint follow-up",
      description: "Track an existing aftersale complaint.",
      linkedAftersaleComplaintId: "cmp_support_contract", idempotencyKey: "support-contract-link-001",
    }).success).toBe(false);
    expect(createSupportTicketRequestSchema.safeParse({
      type: "withdrawal_issue", priority: "urgent", subject: "Withdrawal pending",
      description: "The request is visible but has not progressed.",
      idempotencyKey: "support-contract-worker-001",
    }).success).toBe(true);
  });

  it("separates requester comments from admin visibility controls", () => {
    expect(adminAddSupportTicketCommentRequestSchema.safeParse({
      content: "Internal investigation note", visibility: "internal",
      idempotencyKey: "support-contract-comment-001",
    }).success).toBe(true);
    expect(adminAddSupportTicketCommentRequestSchema.safeParse({
      content: "Invalid visibility", visibility: "private",
      idempotencyKey: "support-contract-comment-002",
    }).success).toBe(false);
  });

  it("requires optimistic concurrency on assignment", () => {
    expect(assignSupportTicketRequestSchema.safeParse({
      assignedAgentId: "operator-hangzhou", expectedVersion: 0,
      idempotencyKey: "support-contract-assign-001",
    }).success).toBe(true);
    expect(assignSupportTicketRequestSchema.safeParse({
      assignedAgentId: "operator-hangzhou", idempotencyKey: "support-contract-assign-002",
    }).success).toBe(false);
  });

  it("enforces terminal resolution metadata in responses", () => {
    const base = {
      ticketId: "spt_contract", cityCode: "hangzhou", source: "customer",
      requesterId: "customer-contract", businessClientId: null, type: "order_question",
      priority: "normal", subject: "Question", description: "Question detail",
      relatedOrderId: null, relatedWorkerId: null, linkedAftersaleComplaintId: null,
      assignedAgentId: null, assignedSkillGroupId: null,
      slaFirstResponseDueAt: null, slaResolutionDueAt: null, firstRespondedAt: null,
      closedAt: null, version: 0, createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    };
    expect(supportTicketSchema.safeParse({ ...base, status: "resolved", resolvedAt: null, resolutionCode: null }).success).toBe(false);
    expect(supportTicketSchema.safeParse({
      ...base, status: "resolved", resolvedAt: "2026-07-12T00:01:00.000Z", resolutionCode: "answered",
    }).success).toBe(true);
  });

  it("registers the Phase 24B internal Outbox event names", () => {
    for (const eventType of [
      "support.ticket.created", "support.ticket.assigned", "support.ticket.escalated",
      "support.ticket.resolved", "support.ticket.reopened", "support.ticket.closed",
    ]) {
      expect(outboxEventTypeSchema.safeParse(eventType).success, eventType).toBe(true);
    }
  });
});
