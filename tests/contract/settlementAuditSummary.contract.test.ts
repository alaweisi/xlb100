import { describe, expect, it } from "vitest";
import {
  settlementAuditSummaryQuerySchema,
  settlementAuditSummaryResponseSchema,
} from "@xlb/validators";

describe("settlement audit summary contract", () => {
  describe("settlementAuditSummaryQuerySchema", () => {
    it("accepts an empty query", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts all optional fields", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        cityCode: "hangzhou",
        dateFrom: "2026-01-01",
        dateTo: "2026-06-30",
        status: "prepared",
        groupBy: "batch",
      });
      expect(result.success).toBe(true);
    });

    it("accepts groupBy=none", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        groupBy: "none",
      });
      expect(result.success).toBe(true);
    });

    it("accepts groupBy=status", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        groupBy: "status",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unknown groupBy value", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        groupBy: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("rejects unknown status value", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        status: "invalid_status",
      });
      expect(result.success).toBe(false);
    });

    it("rejects extra fields via .strict()", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        extraField: "should not be here",
      });
      expect(result.success).toBe(false);
    });

    it("accepts dateFrom without dateTo", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        dateFrom: "2026-01-01",
      });
      expect(result.success).toBe(true);
    });

    it("accepts dateTo without dateFrom", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        dateTo: "2026-06-30",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty dateFrom string", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        dateFrom: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty dateTo string", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        dateTo: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects valid groupBy with cityCode", () => {
      const result = settlementAuditSummaryQuerySchema.safeParse({
        cityCode: "hangzhou",
        groupBy: "batch",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-object input", () => {
      expect(settlementAuditSummaryQuerySchema.safeParse("string").success).toBe(
        false,
      );
      expect(settlementAuditSummaryQuerySchema.safeParse(null).success).toBe(
        false,
      );
      expect(settlementAuditSummaryQuerySchema.safeParse(undefined).success).toBe(
        false,
      );
    });
  });

  describe("settlementAuditSummaryResponseSchema", () => {
    const validCounts = {
      totalBatches: 3,
      totalItems: 25,
      totalPayables: 18,
      totalQueueItems: 10,
    };

    const validStatusBreakdown = [
      { status: "prepared", count: 1 },
      { status: "confirmed", count: 1 },
    ];

    const validAmounts = {
      itemsGrossAmount: 89000,
      itemsPlatformFee: 8900,
      itemsWorkerReceivable: 80100,
      payableGrossAmount: 89000,
      payablePlatformFee: 8900,
      payableWorkerReceivable: 80100,
      queueGrossAmount: 45000,
      queuePlatformFee: 4500,
      queueWorkerReceivable: 40500,
    };

    it("accepts a full response with groups", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
        groups: [
          {
            settlementBatchId: "stb-1",
            status: "prepared",
            itemCount: 10,
            payableCount: 8,
            queueCount: 5,
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts a response with null groups", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
        groups: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty status breakdown", () => {
      const emptyCounts = {
        totalBatches: 0,
        totalItems: 0,
        totalPayables: 0,
        totalQueueItems: 0,
      };
      const emptyAmounts = {
        itemsGrossAmount: 0,
        itemsPlatformFee: 0,
        itemsWorkerReceivable: 0,
        payableGrossAmount: 0,
        payablePlatformFee: 0,
        payableWorkerReceivable: 0,
        queueGrossAmount: 0,
        queuePlatformFee: 0,
        queueWorkerReceivable: 0,
      };
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: emptyCounts,
        statusBreakdown: [],
        amounts: emptyAmounts,
        groups: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects response with non-true ok", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: false,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
        groups: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects response with negative counts", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: {
          totalBatches: -1,
          totalItems: 0,
          totalPayables: 0,
          totalQueueItems: 0,
        },
        statusBreakdown: [],
        amounts: validAmounts,
        groups: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects response with negative amounts", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: {
          ...validAmounts,
          itemsGrossAmount: -100,
        },
        groups: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects response with non-integer counts", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: {
          ...validCounts,
          totalBatches: 1.5,
        },
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
        groups: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects response with extra fields via .strict()", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
        groups: null,
        extraField: "unexpected",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing amounts field", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        groups: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing statusBreakdown field", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        amounts: validAmounts,
        groups: null,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing groups field", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
      });
      expect(result.success).toBe(false);
    });

    it("rejects batch group with missing settlementBatchId", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
        groups: [
          {
            status: "prepared",
            itemCount: 10,
            payableCount: 8,
            queueCount: 5,
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects batch group with non-integer itemCount", () => {
      const result = settlementAuditSummaryResponseSchema.safeParse({
        ok: true,
        counts: validCounts,
        statusBreakdown: validStatusBreakdown,
        amounts: validAmounts,
        groups: [
          {
            settlementBatchId: "stb-1",
            status: "prepared",
            itemCount: 10.5,
            payableCount: 8,
            queueCount: 5,
          },
        ],
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-object input", () => {
      expect(settlementAuditSummaryResponseSchema.safeParse("string").success).toBe(
        false,
      );
      expect(settlementAuditSummaryResponseSchema.safeParse(null).success).toBe(
        false,
      );
      expect(settlementAuditSummaryResponseSchema.safeParse(undefined).success).toBe(
        false,
      );
    });
  });
});
