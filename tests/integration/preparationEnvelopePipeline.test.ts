import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  createPayableSettlement,
  settlementHeaders,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

const adminHeaders = settlementHeaders("hangzhou");
const adminId = "operator-hangzhou";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("preparation envelope real pipeline", { timeout: 90000 }, () => {
  it("creates, freezes, and approves a real envelope without double-counting batch/item/accrual paths", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const settlement = await createPayableSettlement(app);
      const batchId = settlement.batch.settlementBatchId;

      const intent = await app.inject({
        method: "POST",
        url: "/api/internal/settlement-action-governance/intents",
        headers: adminHeaders,
        payload: {
          actionKind: "prepare_payout_review",
          targetType: "settlement_batch",
          targetRef: batchId,
          requestedByAdminId: adminId,
          requestedReason: "Phase 12 real pipeline integration coverage",
          evidenceRefs: [batchId],
        },
      });
      expect(intent.statusCode, intent.body).toBe(200);
      const intentId = intent.json().intent.id as string;

      const review = await app.inject({
        method: "POST",
        url: `/api/internal/settlement-action-governance/intents/${intentId}/reviews`,
        headers: adminHeaders,
        payload: {
          submittedByAdminId: adminId,
          reviewNote: "ready for governance approval",
        },
      });
      expect(review.statusCode).toBe(200);
      const reviewId = review.json().review.id as string;

      const approveReview = await app.inject({
        method: "POST",
        url: `/api/internal/settlement-action-governance/reviews/${reviewId}/approve-governance`,
        headers: adminHeaders,
        payload: {
          reviewDecision: "approve_governance",
          reviewedByAdminId: adminId,
          reviewNote: "approved",
        },
      });
      expect(approveReview.statusCode).toBe(200);

      const readiness = await app.inject({
        method: "POST",
        url: "/api/internal/settlement-action-governance/readiness-packets",
        headers: adminHeaders,
        payload: {
          intentId,
          reviewId,
          createdByAdminId: adminId,
        },
      });
      expect(readiness.statusCode).toBe(200);
      const packetId = readiness.json().packet.id as string;

      const markReady = await app.inject({
        method: "POST",
        url: `/api/internal/settlement-action-governance/readiness-packets/${packetId}/mark-ready-for-review`,
        headers: adminHeaders,
        payload: {},
      });
      expect(markReady.statusCode).toBe(200);

      const plan = await app.inject({
        method: "POST",
        url: "/api/internal/settlement-action-governance/plans",
        headers: adminHeaders,
        payload: { readinessPacketId: packetId },
      });
      expect(plan.statusCode, plan.body).toBe(200);
      const plannedTypes = plan.json().items.map((item: { itemType: string }) => item.itemType);
      expect(plannedTypes).toContain("ledger_accrual");
      expect(plannedTypes).toContain("settlement_batch");
      expect(plannedTypes).toContain("settlement_item");
      expect(plannedTypes).toContain("settlement_payable");

      const createEnvelope = await app.inject({
        method: "POST",
        url: "/api/internal/settlement-action-governance/preparation-envelopes",
        headers: adminHeaders,
        payload: { sourcePacketId: packetId },
      });
      expect(createEnvelope.statusCode, createEnvelope.body).toBe(200);
      const envelopeId = createEnvelope.json().envelope.id as string;

      const freeze = await app.inject({
        method: "POST",
        url: `/api/internal/settlement-action-governance/preparation-envelopes/${envelopeId}/freeze`,
        headers: adminHeaders,
        payload: {},
      });
      expect(freeze.statusCode).toBe(200);
      const frozen = freeze.json().envelope;
      expect(frozen.envelopeStatus).toBe("frozen");
      expect(frozen.amountSnapshot.total_gross_amount).toBe(settlement.batch.totalGrossAmount);
      expect(frozen.amountSnapshot.total_platform_fee).toBe(settlement.batch.totalPlatformFee);
      expect(frozen.amountSnapshot.total_worker_receivable).toBe(settlement.batch.totalWorkerReceivable);
      expect(frozen.amountSnapshot.total_item_count).toBe(settlement.batch.itemCount);
      expect(frozen.amountSnapshot.accrual_amounts).not.toHaveLength(0);
      expect(
        frozen.amountSnapshot.accrual_amounts.every((row: { counted: boolean }) => row.counted === false),
      ).toBe(true);
      expect(frozen.conflictCheckSnapshotHash).toMatch(/^[a-f0-9]{64}$/);

      const approveEnvelope = await app.inject({
        method: "POST",
        url: `/api/internal/settlement-action-governance/preparation-envelopes/${envelopeId}/approve`,
        headers: adminHeaders,
        payload: {},
      });
      expect(approveEnvelope.statusCode).toBe(200);
      expect(approveEnvelope.json().envelope.envelopeStatus).toBe("approved_for_phase13_review");

      const regress = await app.inject({
        method: "POST",
        url: `/api/internal/settlement-action-governance/preparation-envelopes/${envelopeId}/freeze`,
        headers: adminHeaders,
        payload: {},
      });
      expect(regress.statusCode).toBe(422);
    } finally {
      await app.close();
    }
  }));
});
