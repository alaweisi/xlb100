import { describe, expect, it } from "vitest";
import { DeterministicSupportNluProvider, normalizeSupportText } from "../../backend/src/providers/nlu/deterministicSupportNluProvider.js";
import { MemorySupportNluMock } from "../../backend/src/providers/nlu/memorySupportNluMock.js";
import { classifySensitiveSupport } from "../../backend/src/support/bot/sensitiveSupportGuard.js";

const candidate = (overrides: Record<string, unknown> = {}) => ({
  articleId: "kb-a", articleVersionId: "kbv-a-1", language: "zh-cn", title: "Order status",
  summary: "How to check an order", bodyMarkdown: "Open the order timeline.",
  keywords: ["订单进度", "order status"], intentTags: ["查询订单进度"],
  publishedAt: "2026-07-12T08:00:00.000Z", ...overrides,
});

describe("Phase 24E local NLU providers", () => {
  it("normalizes deterministically and returns a published version reference", async () => {
    expect(normalizeSupportText("  查询，订单进度！ ")).toBe("查询 订单进度");
    const result = await new DeterministicSupportNluProvider().classifyAndRetrieve({
      cityCode: "hangzhou", language: "zh-cn", normalizedText: "查询订单进度",
      publishedCandidates: [candidate()],
    });
    expect(result).toMatchObject({ provider: "deterministic", providerStatus: "matched_local",
      externalProviderExecuted: false, matchedArticleVersionIds: ["kbv-a-1"] });
  });

  it("fails closed on equal-score ambiguity, low confidence, and language mismatch", async () => {
    const provider = new DeterministicSupportNluProvider();
    const ambiguous = await provider.classifyAndRetrieve({ cityCode: "hangzhou", language: "zh-cn",
      normalizedText: "查询订单进度", publishedCandidates: [candidate(), candidate({ articleId: "kb-b", articleVersionId: "kbv-b-1" })] });
    expect(ambiguous).toMatchObject({ providerStatus: "no_match_local", reasonCodes: ["ambiguous_equal_score"] });
    const mismatch = await provider.classifyAndRetrieve({ cityCode: "hangzhou", language: "en",
      normalizedText: "查询订单进度", publishedCandidates: [candidate()] });
    expect(mismatch).toMatchObject({ providerStatus: "no_match_local", matchedArticleVersionIds: [] });
  });

  it("keeps explicit mock results truthful and local", async () => {
    const result = await new MemorySupportNluMock({ intent: "fixture", confidenceBasisPoints: 7777,
      matchedArticleVersionIds: ["kbv-fixture"], reasonCodes: ["test_fixture"] })
      .classifyAndRetrieve({ cityCode: "hangzhou", language: null, normalizedText: "fixture", publishedCandidates: [] });
    expect(result).toMatchObject({ provider: "mock", providerStatus: "forced_mock",
      externalProviderExecuted: false, matchedArticleVersionIds: ["kbv-fixture"] });
  });

  it("forces handoff before retrieval for financial, safety, account, and explicit-human inputs", () => {
    for (const text of ["我要退款", "有人威胁我", "验证码被盗", "转人工客服", "REFUND please"]) {
      expect(classifySensitiveSupport({ text }).mustHandOff).toBe(true);
    }
    expect(classifySensitiveSupport({ text: "怎么查看订单进度" })).toMatchObject({ mustHandOff: false });
    expect(classifySensitiveSupport({ text: "普通问题", ticketType: "withdrawal_issue" })).toMatchObject({
      mustHandOff: true, classification: "financial",
    });
  });
});
