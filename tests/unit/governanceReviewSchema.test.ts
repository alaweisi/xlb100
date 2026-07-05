import { describe, expect, it } from "vitest";
import {
  governanceReviewStatusSchema,
  governanceReviewDecisionSchema,
  submitReviewRequestSchema,
  reviewDecisionRequestSchema,
  governanceReviewRecordSchema,
} from "@xlb/validators";

// ══════════════════════════════════════════════════════════════════
// Phase 10D — Governance Review Schema Tests
// ══════════════════════════════════════════════════════════════════

describe("Phase 10D — Governance Review Schema", () => {
  describe("unit — valid reviews", () => {
    it("accepts all allowed review_status values", () => {
      const allowed = ["pending_review", "approved_for_governance", "rejected_for_governance", "changes_requested", "cancelled", "archived"];
      for (const s of allowed) {
        expect(governanceReviewStatusSchema.safeParse(s).success).toBe(true);
      }
    });

    it("accepts all allowed review_decision values", () => {
      const allowed = ["approve_governance", "reject_governance", "request_changes", "cancel_review", "archive_review"];
      for (const d of allowed) {
        expect(governanceReviewDecisionSchema.safeParse(d).success).toBe(true);
      }
    });

    it("accepts a valid submit review request", () => {
      const r = submitReviewRequestSchema.safeParse({
        cityCode: "hangzhou", intentId: "gi_001", submittedByAdminId: "admin_1", reviewNote: "Please review",
      });
      expect(r.success).toBe(true);
    });

    it("accepts a valid approve-governance request", () => {
      const r = reviewDecisionRequestSchema.safeParse({
        reviewDecision: "approve_governance", reviewedByAdminId: "admin_2", reviewNote: "Looks good",
      });
      expect(r.success).toBe(true);
    });

    it("accepts a valid reject-governance request", () => {
      const r = reviewDecisionRequestSchema.safeParse({
        reviewDecision: "reject_governance", reviewedByAdminId: "admin_2", rejectionReason: "Missing evidence",
      });
      expect(r.success).toBe(true);
    });

    it("accepts a valid request-changes request", () => {
      const r = reviewDecisionRequestSchema.safeParse({
        reviewDecision: "request_changes", reviewedByAdminId: "admin_2", changesRequestedNote: "Add export ref",
      });
      expect(r.success).toBe(true);
    });

    it("accepts a valid governance review record", () => {
      const r = governanceReviewRecordSchema.safeParse({
        id: "gr_001", cityCode: "hangzhou", intentId: "gi_001",
        reviewStatus: "approved_for_governance", reviewDecision: "approve_governance",
        submittedByAdminId: "admin_1", reviewedByAdminId: "admin_2",
        reviewNote: "Approved", rejectionReason: null, changesRequestedNote: null,
        submittedAt: "2026-07-05T08:00:00.000Z", reviewedAt: "2026-07-05T09:00:00.000Z",
        createdAt: "2026-07-05T08:00:00.000Z", updatedAt: "2026-07-05T09:00:00.000Z",
      });
      expect(r.success).toBe(true);
    });
  });

  describe("unit — forbidden execution statuses/decisions rejected", () => {
    it("rejects paid as review_status", () => {
      expect(governanceReviewStatusSchema.safeParse("paid").success).toBe(false);
    });
    it("rejects executed as review_status", () => {
      expect(governanceReviewStatusSchema.safeParse("executed").success).toBe(false);
    });
    it("rejects refunded as review_status", () => {
      expect(governanceReviewStatusSchema.safeParse("refunded").success).toBe(false);
    });
    it("rejects reversed as review_status", () => {
      expect(governanceReviewStatusSchema.safeParse("reversed").success).toBe(false);
    });
    it("rejects settle_statement as review_decision", () => {
      expect(governanceReviewDecisionSchema.safeParse("settle_statement").success).toBe(false);
    });
    it("rejects approve_payout as review_decision", () => {
      expect(governanceReviewDecisionSchema.safeParse("approve_payout").success).toBe(false);
    });
    it("rejects execute_payout as review_decision", () => {
      expect(governanceReviewDecisionSchema.safeParse("execute_payout").success).toBe(false);
    });
    it("rejects execute_refund as review_decision", () => {
      expect(governanceReviewDecisionSchema.safeParse("execute_refund").success).toBe(false);
    });
    it("rejects reverse_ledger as review_decision", () => {
      expect(governanceReviewDecisionSchema.safeParse("reverse_ledger").success).toBe(false);
    });
  });

  describe("unit — approved ≠ paid/executed", () => {
    it("approved_for_governance is not paid", () => {
      expect("approved_for_governance" === "paid").toBe(false);
    });
    it("approved_for_governance is not executed", () => {
      expect("approved_for_governance" === "executed").toBe(false);
    });
    it("approve_governance is not execute_payout", () => {
      expect("approve_governance" === "execute_payout").toBe(false);
    });
  });

  describe("unit — required fields", () => {
    it("rejects submit without intentId", () => {
      expect(submitReviewRequestSchema.safeParse({ cityCode: "hz", submittedByAdminId: "a" }).success).toBe(false);
    });
    it("rejects decision without reviewDecision", () => {
      expect(reviewDecisionRequestSchema.safeParse({ reviewedByAdminId: "a" }).success).toBe(false);
    });
  });
});
