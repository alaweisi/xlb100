import { describe, expect, it, vi } from "vitest";
import type { MarketingRuleRevision, RequestContext } from "@xlb/types";
import {
  MarketingAuthorizationError,
  MarketingConflictError,
  MarketingService,
} from "../../backend/src/marketing/marketingService.js";
import { marketingHash } from "../../backend/src/marketing/marketingPolicy.js";

const baseContext: RequestContext = {
  traceId: "trace-phase29",
  requestStartedAt: "2026-07-14T02:00:00.000Z",
  appType: "admin",
  role: "admin",
  cityCode: "hangzhou",
  userId: "admin-creator",
};

const draftRule: MarketingRuleRevision = {
  ruleRevisionId: "rule-revision-1",
  marketingCampaignId: "marketing-campaign-1",
  cityCode: "hangzhou",
  revision: 1,
  status: "draft",
  allowedSkuIds: ["sku-1"],
  createdBy: "admin-creator",
  reviewedBy: null,
  reviewedAt: null,
  publishedBy: null,
  publishedAt: null,
  version: 1,
  createdAt: "2026-07-14T02:00:00.000Z",
};

const reviewedRule: MarketingRuleRevision = {
  ...draftRule,
  status: "reviewed",
  reviewedBy: "admin-reviewer",
  reviewedAt: "2026-07-14T02:01:00.000Z",
  version: 2,
};

const publishedRule: MarketingRuleRevision = {
  ...reviewedRule,
  status: "published",
  publishedBy: "admin-creator",
  publishedAt: "2026-07-14T02:02:00.000Z",
  version: 3,
};

function admin(userId: string, role: RequestContext["role"] = "admin"): RequestContext {
  return { ...baseContext, userId, role };
}

function serviceFor(repository: Record<string, unknown>) {
  const connection = { connectionId: "phase29-test" };
  const transaction = async <T>(callback: (value: typeof connection) => Promise<T>) => callback(connection);
  const outbox = { insertEvent: vi.fn() };
  return {
    service: new MarketingService(repository as never, transaction as never,
      () => new Date("2026-07-14T02:03:00.000Z"), outbox as never),
    repository,
    connection,
  };
}

describe("Phase29 rule-revision four-eyes governance", () => {
  it("rejects self-review before any CAS or audit write", async () => {
    const repository = {
      findRuleForUpdate: vi.fn().mockResolvedValue(draftRule),
      updateRuleState: vi.fn(),
      insertAudit: vi.fn(),
    };
    const { service } = serviceFor(repository);

    await expect(service.reviewRuleRevision(admin("admin-creator"), draftRule.ruleRevisionId, {
      expectedVersion: 1,
      reason: "self review is forbidden",
    })).rejects.toBeInstanceOf(MarketingConflictError);
    expect(repository.updateRuleState).not.toHaveBeenCalled();
    expect(repository.insertAudit).not.toHaveBeenCalled();
  });

  it("allows an independent Admin to review and records versioned audit evidence", async () => {
    const repository = {
      findRuleForUpdate: vi.fn()
        .mockResolvedValueOnce(draftRule)
        .mockResolvedValueOnce(reviewedRule),
      updateRuleState: vi.fn().mockResolvedValue(true),
      insertAudit: vi.fn(),
    };
    const { service, connection } = serviceFor(repository);

    await expect(service.reviewRuleRevision(admin("admin-reviewer"), draftRule.ruleRevisionId, {
      expectedVersion: 1,
      reason: "independent review",
    })).resolves.toEqual(reviewedRule);
    expect(repository.updateRuleState).toHaveBeenCalledWith(connection, {
      cityCode: "hangzhou",
      id: draftRule.ruleRevisionId,
      version: 1,
      status: "reviewed",
      actorId: "admin-reviewer",
    });
    expect(repository.insertAudit).toHaveBeenCalledWith(connection, expect.objectContaining({
      action: "rule_revision_reviewed",
      actorId: "admin-reviewer",
      expectedVersion: 1,
      actualVersion: 2,
      reason: "independent review",
    }));
  });

  it("rejects reviewer publication but permits the creator to publish after independent review", async () => {
    const reviewerRepo = {
      findRuleForUpdate: vi.fn().mockResolvedValue(reviewedRule),
      updateRuleState: vi.fn(),
      insertAudit: vi.fn(),
    };
    await expect(serviceFor(reviewerRepo).service.publishRuleRevision(
      admin("admin-reviewer"), reviewedRule.ruleRevisionId,
      { expectedVersion: 2, reason: "same actor must not publish" },
    )).rejects.toBeInstanceOf(MarketingConflictError);
    expect(reviewerRepo.updateRuleState).not.toHaveBeenCalled();

    const publisherRepo = {
      findRuleForUpdate: vi.fn()
        .mockResolvedValueOnce(reviewedRule)
        .mockResolvedValueOnce(publishedRule),
      updateRuleState: vi.fn().mockResolvedValue(true),
      insertAudit: vi.fn(),
    };
    await expect(serviceFor(publisherRepo).service.publishRuleRevision(
      admin("admin-creator"), reviewedRule.ruleRevisionId,
      { expectedVersion: 2, reason: "publish after independent review" },
    )).resolves.toEqual(publishedRule);
    expect(publisherRepo.updateRuleState).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: "published",
      actorId: "admin-creator",
    }));
  });

  it("keeps operator authority at draft creation and denies approval transitions", async () => {
    const repository = {
      findRuleForUpdate: vi.fn(),
      updateRuleState: vi.fn(),
      insertAudit: vi.fn(),
    };
    const { service } = serviceFor(repository);
    await expect(service.reviewRuleRevision(
      admin("operator-1", "operator"), draftRule.ruleRevisionId,
      { expectedVersion: 1, reason: "operator cannot approve" },
    )).rejects.toBeInstanceOf(MarketingAuthorizationError);
    expect(repository.findRuleForUpdate).not.toHaveBeenCalled();
  });
});

describe("Phase29 rule command idempotency", () => {
  const campaign = {
    marketingCampaignId: "marketing-campaign-1",
    cityCode: "hangzhou",
    name: "Campaign",
    status: "draft",
    activeRuleRevisionId: null,
    startAt: "2026-07-14T00:00:00.000Z",
    endAt: "2026-07-15T00:00:00.000Z",
    reviewedBy: null,
    reviewedAt: null,
    version: 1,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
  } as const;

  it("returns the canonical revision for the same key/request and conflicts on changed input", async () => {
    const requestFingerprint = marketingHash({
      cityCode: "hangzhou",
      campaignId: campaign.marketingCampaignId,
      allowedSkuIds: ["sku-1"],
    });
    const repository = {
      findCampaignForUpdate: vi.fn().mockResolvedValue(campaign),
      findRuleCreateReplay: vi.fn().mockResolvedValue({ rule: draftRule, requestFingerprint }),
      countEnabledSkus: vi.fn(),
      insertRuleRevision: vi.fn(),
      insertAudit: vi.fn(),
    };
    const { service } = serviceFor(repository);
    const command = { allowedSkuIds: ["sku-1"], idempotencyKey: "rule-command-0001" };

    await expect(service.createRuleRevision(
      admin("operator-1", "operator"), campaign.marketingCampaignId, command,
    )).resolves.toEqual(draftRule);
    expect(repository.countEnabledSkus).not.toHaveBeenCalled();
    expect(repository.insertRuleRevision).not.toHaveBeenCalled();

    await expect(service.createRuleRevision(
      admin("operator-1", "operator"), campaign.marketingCampaignId,
      { ...command, allowedSkuIds: ["sku-2"] },
    )).rejects.toBeInstanceOf(MarketingConflictError);
    expect(repository.insertRuleRevision).not.toHaveBeenCalled();
  });
});
