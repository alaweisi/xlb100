import { describe, expect, it, vi } from "vitest";
import { CustomerSduiService } from "../../backend/src/customerSdui/customerSduiService.js";
import { context, MemoryCustomerSduiRepository, validCustomerSduiDefinition } from "../helpers/customerSduiTestKit.js";

describe("Customer SDUI authorization boundaries", () => {
  it("never trusts customer or worker actors for control-plane mutations", async () => {
    const service = new CustomerSduiService(
      new MemoryCustomerSduiRepository(),
      () => new Date("2026-07-23T01:00:00.000Z"),
      async () => {},
    );
    const body = { definition: validCustomerSduiDefinition(), idempotencyKey: "unauthorized-create-1" };
    await expect(service.createDraft(
      context({ appType: "customer", role: "customer", userId: "customer-attacker" }), "customer.home", body,
    )).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.createDraft(
      context({ appType: "worker", role: "worker", userId: "worker-attacker" }), "customer.home", body,
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it("enforces author-reviewer-publisher separation and blocks cross-city publication", async () => {
    const repository = new MemoryCustomerSduiRepository();
    const service = new CustomerSduiService(
      repository,
      () => new Date("2026-07-23T01:00:00.000Z"),
      async () => {},
    );
    const author = context({ appType: "admin", role: "operator", userId: "operator-author" });
    const created = await service.createDraft(author, "customer.home", {
      definition: validCustomerSduiDefinition(), idempotencyKey: "separation-create-1",
    });
    await expect(service.review(author, "customer.home", created.revision.revisionId, {
      expectedVersion: 1, reviewNote: "self approval", idempotencyKey: "separation-review-self",
    })).rejects.toMatchObject({ statusCode: 403 });

    const reviewer = context({ appType: "admin", role: "auditor", userId: "auditor-reviewer" });
    const reviewed = await service.review(reviewer, "customer.home", created.revision.revisionId, {
      expectedVersion: 1, reviewNote: "independent approval", idempotencyKey: "separation-review-1",
    });
    await expect(service.publish(reviewer, "customer.home", reviewed.revision.revisionId, {
      expectedVersion: 2,
      scope: { cityCodes: ["hangzhou"], locales: ["zh-CN"], minimumAppVersion: "1.0.0", maximumAppVersion: null, audienceTags: [] },
      rollout: { percentageBasisPoints: 10_000, bucketSeed: "scope-test" },
      effectiveAt: "2026-07-23T02:00:00.000Z", expiresAt: null,
      idempotencyKey: "auditor-publish-denied",
    })).rejects.toMatchObject({ statusCode: 403 });

    const publisher = context({ appType: "admin", role: "admin", userId: "admin-publisher" });
    await expect(service.publish(publisher, "customer.home", reviewed.revision.revisionId, {
      expectedVersion: 2,
      scope: { cityCodes: ["hangzhou"], locales: ["zh-CN"], minimumAppVersion: "1.0.0", maximumAppVersion: null, audienceTags: ["vip"] },
      rollout: { percentageBasisPoints: 10_000, bucketSeed: "audience-test" },
      effectiveAt: "2026-07-23T02:00:00.000Z", expiresAt: null,
      idempotencyKey: "audience-publish-denied",
    })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.publish(publisher, "customer.home", reviewed.revision.revisionId, {
      expectedVersion: 2,
      scope: { cityCodes: ["shanghai"], locales: ["zh-CN"], minimumAppVersion: "1.0.0", maximumAppVersion: null, audienceTags: [] },
      rollout: { percentageBasisPoints: 10_000, bucketSeed: "scope-test" },
      effectiveAt: "2026-07-23T02:00:00.000Z", expiresAt: null,
      idempotencyKey: "cross-city-publish-denied",
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("prevents an admin author from publishing their own revision", async () => {
    const repository = new MemoryCustomerSduiRepository();
    const service = new CustomerSduiService(
      repository,
      () => new Date("2026-07-23T01:00:00.000Z"),
      async () => {},
    );
    const adminAuthor = context({ appType: "admin", role: "admin", userId: "admin-author" });
    const reviewer = context({ appType: "admin", role: "auditor", userId: "auditor-reviewer" });
    const created = await service.createDraft(adminAuthor, "customer.home", {
      definition: validCustomerSduiDefinition("customer.home.admin-authored"),
      idempotencyKey: "admin-author-create-1",
    });
    const reviewed = await service.review(reviewer, "customer.home", created.revision.revisionId, {
      expectedVersion: created.revision.version,
      reviewNote: "independently reviewed",
      idempotencyKey: "admin-author-review-1",
    });
    await expect(service.publish(adminAuthor, "customer.home", reviewed.revision.revisionId, {
      expectedVersion: reviewed.revision.version,
      scope: { cityCodes: ["hangzhou"], locales: ["zh-CN"], minimumAppVersion: "1.0.0", maximumAppVersion: null, audienceTags: [] },
      rollout: { percentageBasisPoints: 10_000, bucketSeed: "self-publish-test" },
      effectiveAt: "2026-07-23T02:00:00.000Z",
      expiresAt: null,
      idempotencyKey: "admin-author-publish-denied",
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("uses token context identity and city for customer resolution", async () => {
    const service = new CustomerSduiService(
      new MemoryCustomerSduiRepository(),
      () => new Date("2026-07-23T01:00:00.000Z"),
      async () => {},
    );
    await expect(service.resolveManifest(
      context({ appType: "admin", role: "admin", userId: "admin-publisher" }),
      "customer.home", { appVersion: "1.0.0", locale: "zh-CN" },
    )).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.resolveManifest(
      context({ appType: "customer", role: "customer", userId: undefined }),
      "customer.home", { appVersion: "1.0.0", locale: "zh-CN" },
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it("fails closed when the authenticated admin is outside the persisted city scope", async () => {
    const service = new CustomerSduiService(
      new MemoryCustomerSduiRepository(),
      () => new Date("2026-07-23T01:00:00.000Z"),
      async () => { throw new Error("admin city scope denied"); },
    );
    await expect(service.createDraft(
      context({ appType: "admin", role: "operator", userId: "out-of-scope-operator" }),
      "customer.home",
      { definition: validCustomerSduiDefinition(), idempotencyKey: "denied-city-create-1" },
    )).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listRevisions(
      context({ appType: "admin", role: "auditor", userId: "out-of-scope-auditor" }),
      "customer.home",
      { limit: 10 },
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it("applies the persisted admin city guard to read-side queries", async () => {
    const cityGuard = vi.fn(async () => {});
    const service = new CustomerSduiService(
      new MemoryCustomerSduiRepository(),
      () => new Date("2026-07-23T01:00:00.000Z"),
      cityGuard,
    );
    const auditor = context({ appType: "admin", role: "auditor", userId: "scoped-auditor" });

    await expect(service.listRevisions(auditor, "customer.home", { limit: 10 })).resolves.toMatchObject({
      pageId: "customer.home",
      revisions: [],
    });
    expect(cityGuard).toHaveBeenCalledWith(auditor, "hangzhou");
  });
});
