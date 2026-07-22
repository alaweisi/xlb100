import { describe, expect, it } from "vitest";
import { CustomerSduiService } from "../../backend/src/customerSdui/customerSduiService.js";
import { context, MemoryCustomerSduiRepository, validCustomerSduiDefinition } from "../helpers/customerSduiTestKit.js";

describe("Customer SDUI authorization boundaries", () => {
  it("never trusts customer or worker actors for control-plane mutations", async () => {
    const service = new CustomerSduiService(new MemoryCustomerSduiRepository(), () => new Date("2026-07-23T01:00:00.000Z"));
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
    const service = new CustomerSduiService(repository, () => new Date("2026-07-23T01:00:00.000Z"));
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
      scope: { cityCodes: ["shanghai"], locales: ["zh-CN"], minimumAppVersion: "1.0.0", maximumAppVersion: null, audienceTags: [] },
      rollout: { percentageBasisPoints: 10_000, bucketSeed: "scope-test" },
      effectiveAt: "2026-07-23T02:00:00.000Z", expiresAt: null,
      idempotencyKey: "cross-city-publish-denied",
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("uses token context identity and city for customer resolution", async () => {
    const service = new CustomerSduiService(new MemoryCustomerSduiRepository(), () => new Date("2026-07-23T01:00:00.000Z"));
    await expect(service.resolveManifest(
      context({ appType: "admin", role: "admin", userId: "admin-publisher" }),
      "customer.home", { appVersion: "1.0.0", locale: "zh-CN" },
    )).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.resolveManifest(
      context({ appType: "customer", role: "customer", userId: undefined }),
      "customer.home", { appVersion: "1.0.0", locale: "zh-CN" },
    )).rejects.toMatchObject({ statusCode: 403 });
  });
});
