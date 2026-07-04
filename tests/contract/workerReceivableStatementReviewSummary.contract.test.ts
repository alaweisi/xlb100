import { describe, expect, it } from "vitest";
import {
  workerStatementReviewSummaryQuerySchema,
  workerStatementReviewSummaryResponseSchema,
} from "@xlb/validators";

describe("worker statement review summary contract", () => {
  it("accepts empty query", () => {
    expect(workerStatementReviewSummaryQuerySchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid groupBy values", () => {
    expect(workerStatementReviewSummaryQuerySchema.safeParse({ groupBy: "none" }).success).toBe(true);
    expect(workerStatementReviewSummaryQuerySchema.safeParse({ groupBy: "worker" }).success).toBe(true);
  });

  it("rejects invalid groupBy", () => {
    expect(workerStatementReviewSummaryQuerySchema.safeParse({ groupBy: "city" }).success).toBe(false);
    expect(workerStatementReviewSummaryQuerySchema.safeParse({ groupBy: "batch" }).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(workerStatementReviewSummaryQuerySchema.safeParse({ foo: "bar" }).success).toBe(false);
  });

  it("validates response schema", () => {
    const valid = {
      ok: true as const,
      cityCode: "hangzhou",
      dateFrom: null,
      dateTo: null,
      overall: {
        totalStatements: 10,
        reviewedStatements: 8,
        approvedStatements: 6,
        rejectedStatements: 2,
        pendingReviewStatements: 2,
        exportedStatements: 4,
        pendingExportStatements: 2,
        noExportStatements: 6,
      },
      groups: null,
    };
    expect(workerStatementReviewSummaryResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("validates response with groups", () => {
    const valid = {
      ok: true as const,
      cityCode: "hangzhou",
      dateFrom: null,
      dateTo: null,
      overall: {
        totalStatements: 5,
        reviewedStatements: 4,
        approvedStatements: 3,
        rejectedStatements: 1,
        pendingReviewStatements: 1,
        exportedStatements: 2,
        pendingExportStatements: 1,
        noExportStatements: 3,
      },
      groups: [
        {
          workerId: "worker-1",
          counts: {
            totalStatements: 5,
            reviewedStatements: 4,
            approvedStatements: 3,
            rejectedStatements: 1,
            pendingReviewStatements: 1,
            exportedStatements: 2,
            pendingExportStatements: 1,
            noExportStatements: 3,
          },
        },
      ],
    };
    expect(workerStatementReviewSummaryResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects response with negative counts", () => {
    const invalid = {
      ok: true as const,
      cityCode: "hangzhou",
      dateFrom: null,
      dateTo: null,
      overall: {
        totalStatements: -1,
        reviewedStatements: 8,
        approvedStatements: 6,
        rejectedStatements: 2,
        pendingReviewStatements: 2,
        exportedStatements: 4,
        pendingExportStatements: 2,
        noExportStatements: 6,
      },
      groups: null,
    };
    expect(workerStatementReviewSummaryResponseSchema.safeParse(invalid).success).toBe(false);
  });
});
