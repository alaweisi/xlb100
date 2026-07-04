import { describe, expect, it } from "vitest";
import { reconciliationGapScanQuerySchema, reconciliationGapScanResponseSchema } from "@xlb/validators";

describe("reconciliation gap scan contract", () => {
  it("accepts empty query", () => { expect(reconciliationGapScanQuerySchema.safeParse({}).success).toBe(true); });
  it("accepts valid gapType", () => {
    expect(reconciliationGapScanQuerySchema.safeParse({ gapType: "batch-payable" }).success).toBe(true);
    expect(reconciliationGapScanQuerySchema.safeParse({ gapType: "all" }).success).toBe(true);
  });
  it("rejects invalid gapType", () => { expect(reconciliationGapScanQuerySchema.safeParse({ gapType: "invalid" }).success).toBe(false); });
  it("validates response", () => {
    expect(reconciliationGapScanResponseSchema.safeParse({ ok: true, summary: { totalGaps: 0, gapsByType: {} }, gaps: [] }).success).toBe(true);
  });
});
