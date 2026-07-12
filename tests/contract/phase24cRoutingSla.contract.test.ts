import { describe, expect, it } from "vitest";
import {
  createSupportSlaPolicyRequestSchema, createSupportTicketRequestSchema,
  reviseSupportSlaPolicyRequestSchema, supportSlaPolicySchema,
} from "@xlb/validators";

const at = "2026-07-12T08:00:00.000Z";

describe("Phase 24C Phase 2 routing and SLA contracts", () => {
  it("accepts an optional canonical preferred language without weakening the locked ticket request", () => {
    const request = {
      type: "order_question", priority: "normal", subject: "Need order help",
      description: "Please answer in my preferred language", preferredLanguage: "zh-CN",
      idempotencyKey: "phase24c2-ticket-language-001",
    };
    expect(createSupportTicketRequestSchema.safeParse(request).success).toBe(true);
    const normalized = createSupportTicketRequestSchema.safeParse({ ...request, preferredLanguage: " zh-CN " });
    expect(normalized.success && normalized.data.preferredLanguage).toBe("zh-cn");
    expect(createSupportTicketRequestSchema.safeParse({ ...request, preferredLanguage: "zh_CN" }).success).toBe(false);
    expect(createSupportTicketRequestSchema.safeParse({ ...request, routingLanguage: "zh-CN" }).success).toBe(false);
  });

  it("enforces positive SLA durations, ordered windows, and resolution not shorter than first response", () => {
    const valid = {
      type: "order_question", priority: "normal", firstResponseMinutes: 240, resolutionMinutes: 2880,
      effectiveFrom: at, effectiveTo: "2026-08-12T08:00:00.000Z", isActive: true,
      idempotencyKey: "phase24c2-sla-create-001",
    };
    expect(createSupportSlaPolicyRequestSchema.safeParse(valid).success).toBe(true);
    expect(createSupportSlaPolicyRequestSchema.safeParse({ ...valid, firstResponseMinutes: 0 }).success).toBe(false);
    expect(createSupportSlaPolicyRequestSchema.safeParse({ ...valid, resolutionMinutes: 120 }).success).toBe(false);
    expect(createSupportSlaPolicyRequestSchema.safeParse({ ...valid, effectiveTo: at }).success).toBe(false);
    expect(createSupportSlaPolicyRequestSchema.safeParse({ ...valid, cityCode: "shanghai" }).success).toBe(false);
    expect(createSupportSlaPolicyRequestSchema.safeParse({ ...valid, type: "other", priority: "normal" }).success).toBe(false);
  });

  it("models updates as append-only revisions with CAS and at least one changed field", () => {
    expect(reviseSupportSlaPolicyRequestSchema.safeParse({
      firstResponseMinutes: 60, resolutionMinutes: 480, expectedVersion: 1,
      idempotencyKey: "phase24c2-sla-revise-001",
    }).success).toBe(true);
    expect(reviseSupportSlaPolicyRequestSchema.safeParse({ expectedVersion: 1, idempotencyKey: "phase24c2-sla-revise-002" }).success).toBe(false);
    expect(reviseSupportSlaPolicyRequestSchema.safeParse({ isActive: false, expectedVersion: 0, idempotencyKey: "phase24c2-sla-revise-003" }).success).toBe(false);
  });

  it("keeps revision links and response fields strict", () => {
    const policy = {
      policyId: "slp-contract-r1", policySeriesId: "sls-contract", revision: 1,
      supersedesPolicyId: null, cityCode: "hangzhou", type: "order_question", priority: "normal",
      firstResponseMinutes: 30, resolutionMinutes: 240, effectiveFrom: at, effectiveTo: null,
      isActive: true, version: 1, createdAt: at, updatedAt: at,
    };
    expect(supportSlaPolicySchema.safeParse(policy).success).toBe(true);
    expect(supportSlaPolicySchema.safeParse({ ...policy, revision: 2 }).success).toBe(false);
    expect(supportSlaPolicySchema.safeParse({ ...policy, secret: "must-not-leak" }).success).toBe(false);
  });
});
