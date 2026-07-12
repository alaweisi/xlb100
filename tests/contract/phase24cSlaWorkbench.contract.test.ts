import { describe, expect, it } from "vitest";
import {
  claimSupportTicketRequestSchema,
  outboxEventTypeSchema,
  supportSlaBreachedOutboxEventPayloadSchema,
  supportTicketEventTypeSchema,
  supportTicketListFiltersSchema,
  supportTicketSchema,
} from "@xlb/validators";

const at = "2026-07-12T08:00:00.000Z";

describe("Phase 24C Phase 3 SLA and workbench contracts", () => {
  it("keeps claim identity server-derived and requires CAS plus idempotency", () => {
    expect(claimSupportTicketRequestSchema.safeParse({
      expectedVersion: 2,
      idempotencyKey: "phase24c3-claim-001",
    }).success).toBe(true);
    expect(claimSupportTicketRequestSchema.safeParse({
      expectedVersion: 2,
      idempotencyKey: "phase24c3-claim-002",
      assignedAgentId: "cannot-claim-for-another-agent",
    }).success).toBe(false);
    expect(claimSupportTicketRequestSchema.safeParse({
      idempotencyKey: "phase24c3-claim-003",
    }).success).toBe(false);
  });

  it("accepts only the approved workbench views and SLA sort mode", () => {
    for (const view of ["mine", "skill_group", "all"]) {
      expect(supportTicketListFiltersSchema.safeParse({ view, sort: "sla_due", limit: 25 }).success).toBe(true);
    }
    expect(supportTicketListFiltersSchema.safeParse({ view: "public_pool" }).success).toBe(false);
    expect(supportTicketListFiltersSchema.safeParse({ sort: "priority_desc" }).success).toBe(false);
  });

  it("exposes nullable independent breach markers on strict ticket responses", () => {
    const ticket = {
      ticketId: "spt-phase24c3-contract", cityCode: "hangzhou", source: "customer",
      requesterId: "customer-phase24c3", businessClientId: null, type: "order_question",
      priority: "high", status: "open", subject: "SLA contract", description: "SLA contract detail",
      relatedOrderId: null, relatedWorkerId: null, linkedAftersaleComplaintId: null,
      assignedAgentId: null, assignedSkillGroupId: "sg-phase24c3", routingLanguage: null,
      slaFirstResponseDueAt: at, slaResolutionDueAt: at, firstRespondedAt: null,
      slaFirstResponseBreachedAt: at, slaResolutionBreachedAt: null,
      resolvedAt: null, closedAt: null, resolutionCode: null, version: 2,
      createdAt: at, updatedAt: at,
    };
    expect(supportTicketSchema.safeParse(ticket).success).toBe(true);
    expect(supportTicketSchema.safeParse({ ...ticket, slaFirstResponseBreachedAt: 123 }).success).toBe(false);
  });

  it("registers additive ticket and Outbox event names with a minimal SLA payload", () => {
    expect(supportTicketEventTypeSchema.safeParse("claimed").success).toBe(true);
    expect(supportTicketEventTypeSchema.safeParse("sla_breached").success).toBe(true);
    expect(outboxEventTypeSchema.safeParse("support.sla.breached").success).toBe(true);

    const payload = {
      ticketId: "spt-phase24c3-contract", cityCode: "hangzhou",
      breachKind: "resolution", dueAt: at,
      oldPriority: "normal", newPriority: "high", version: 2,
    };
    expect(supportSlaBreachedOutboxEventPayloadSchema.safeParse(payload).success).toBe(true);
    expect(supportSlaBreachedOutboxEventPayloadSchema.safeParse({ ...payload, requesterText: "must-not-leak" }).success).toBe(false);
    expect(supportSlaBreachedOutboxEventPayloadSchema.safeParse({ ...payload, breachKind: "both" }).success).toBe(false);
  });
});
