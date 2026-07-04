import { describe, expect, it, vi } from "vitest";
const mockRepo = { scanGaps: vi.fn() };
vi.mock("../../backend/src/settlement/reconciliationGapScanRepository.js", () => ({ reconciliationGapScanRepository: mockRepo }));
const { reconciliationGapScanService } = await import("../../backend/src/settlement/reconciliationGapScanService.js");

describe("reconciliationGapScanService", () => {
  it("throws when cityCode missing", async () => {
    await expect(reconciliationGapScanService.scanGaps({} as any, {})).rejects.toThrow("cityCode is required");
  });
  it("delegates to repository", async () => {
    const ctx = { cityCode: "hangzhou" } as any;
    mockRepo.scanGaps.mockResolvedValue({ summary: { totalGaps: 0, gapsByType: {} }, gaps: [] });
    await reconciliationGapScanService.scanGaps(ctx, { gapType: "all" });
    expect(mockRepo.scanGaps).toHaveBeenCalledWith(ctx, { gapType: "all" });
  });
});
