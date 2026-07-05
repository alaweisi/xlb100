import { describe, expect, it } from "vitest";
import {
  evidenceBundleStatusSchema,
  createEvidenceBundleRequestSchema,
  attachEvidenceRefRequestSchema,
  auditTrailEntrySchema,
} from "@xlb/validators";

describe("Phase 10E — Governance Evidence Schema", () => {
  describe("unit — valid bundles", () => {
    it("accepts all allowed bundle_status values", () => {
      const allowed = ["draft", "attached_to_review", "approved_for_governance_reference", "archived"];
      for (const s of allowed) expect(evidenceBundleStatusSchema.safeParse(s).success).toBe(true);
    });
    it("accepts valid create bundle request", () => {
      expect(createEvidenceBundleRequestSchema.safeParse({ cityCode: "hz", intentId: "gi_1", createdByAdminId: "a" }).success).toBe(true);
    });
    it("accepts valid evidence ref", () => {
      expect(attachEvidenceRefRequestSchema.safeParse({ refType: "statement", refId: "s1", sourcePhase: "9B", sourceRoute: "/detail", cityCode: "hz", label: "test", createdAt: "2025-01-01T00:00:00Z" }).success).toBe(true);
    });
    it("accepts audit trail entry", () => {
      expect(auditTrailEntrySchema.safeParse({ eventType: "governance_intent_created", eventTimestamp: "2025-01-01T00:00:00Z", actorAdminId: "a1", targetType: "intent", targetId: "gi_1", cityCode: "hz", summary: "created" }).success).toBe(true);
    });
  });

  describe("unit — forbidden statuses", () => {
    ["generated", "downloaded", "exported", "executed", "paid", "refunded", "reversed", "settled"].forEach(s => {
      it(`rejects ${s} as bundle_status`, () => { expect(evidenceBundleStatusSchema.safeParse(s).success).toBe(false); });
    });
  });

  describe("unit — forbidden evidence ref fields", () => {
    const forbidden = ["file_path", "download_url", "signed_url", "export_file_id", "payout_batch_id", "payment_execution_id", "ledger_mutation_id", "refund_execution_id", "reversal_execution_id"];
    forbidden.forEach(f => {
      it(`rejects evidence ref with ${f}`, () => {
        const r = attachEvidenceRefRequestSchema.safeParse({ refType: "s", refId: "1", sourcePhase: "9", sourceRoute: "/", cityCode: "hz", label: "t", createdAt: "2025-01-01T00:00:00Z", [f]: "bad" });
        expect(r.success).toBe(false);
      });
    });
  });

  describe("unit — required fields", () => {
    it("rejects create without intentId", () => expect(createEvidenceBundleRequestSchema.safeParse({ cityCode: "hz", createdByAdminId: "a" }).success).toBe(false));
  });
});
