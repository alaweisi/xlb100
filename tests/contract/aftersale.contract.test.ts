import { describe, expect, it } from "vitest";
import {
  createAftersaleComplaintRequestSchema,
  createOrderReverseRequestSchema,
  decideAftersaleLiabilityRequestSchema,
  outboxEventTypeSchema,
  reviewAftersaleCompensationRequestSchema,
} from "@xlb/validators";

describe("Phase 17 aftersale contracts", () => {
  it("requires complete schedule fields only for reschedule", () => {
    expect(createOrderReverseRequestSchema.safeParse({
      reverseType: "reschedule",
      reason: "customer schedule changed",
      requestedScheduledAt: "2026-07-20T02:00:00.000Z",
      requestedTimeSlot: "morning",
      idempotencyKey: "reverse-contract-001",
    }).success).toBe(true);
    expect(createOrderReverseRequestSchema.safeParse({
      reverseType: "reschedule",
      reason: "missing slot",
      idempotencyKey: "reverse-contract-002",
    }).success).toBe(false);
  });

  it("validates complaint and liability snapshots", () => {
    expect(createAftersaleComplaintRequestSchema.safeParse({
      orderId: "ord_001",
      category: "service_quality",
      priority: "urgent",
      description: "installation result requires follow-up",
      idempotencyKey: "complaint-contract-001",
    }).success).toBe(true);
    expect(decideAftersaleLiabilityRequestSchema.safeParse({
      liableParty: "shared",
      workerLiabilityPercent: 70,
      platformLiabilityPercent: 30,
      customerLiabilityPercent: 0,
      reason: "shared operational responsibility",
    }).success).toBe(true);
    expect(decideAftersaleLiabilityRequestSchema.safeParse({
      liableParty: "shared",
      workerLiabilityPercent: 70,
      platformLiabilityPercent: 20,
      customerLiabilityPercent: 0,
      reason: "invalid total",
    }).success).toBe(false);
  });

  it("requires approved amount but never provider execution", () => {
    expect(reviewAftersaleCompensationRequestSchema.safeParse({
      decision: "approved",
      approvedAmount: 20,
      decisionNote: "service credit approved",
    }).success).toBe(true);
    expect(reviewAftersaleCompensationRequestSchema.safeParse({ decision: "approved" }).success).toBe(false);
  });

  it("registers Phase 17 outbox event names", () => {
    for (const eventType of [
      "order.reverse.requested",
      "order.reverse.applied",
      "aftersale.complaint.submitted",
      "aftersale.repair.completed",
      "aftersale.compensation.approved",
    ]) {
      expect(outboxEventTypeSchema.safeParse(eventType).success).toBe(true);
    }
  });
});
