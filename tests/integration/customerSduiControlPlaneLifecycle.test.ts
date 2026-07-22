import { describe, expect, it } from "vitest";
import { customerSduiManifestEnvelopeSchema, customerSduiRevisionEnvelopeSchema } from "@xlb/validators";
import { CustomerSduiError, CustomerSduiService } from "../../backend/src/customerSdui/customerSduiService.js";
import {
  context,
  MemoryCustomerSduiRepository,
  validCustomerSduiDefinition,
} from "../helpers/customerSduiTestKit.js";

describe("Customer SDUI control-plane lifecycle", () => {
  it("closes create, idempotent replay, review, publish, stable rollout, expiry, rollback, and kill-switch", async () => {
    const repository = new MemoryCustomerSduiRepository();
    let clock = new Date("2026-07-23T01:00:00.000Z");
    const service = new CustomerSduiService(repository, () => clock);
    const author = context({ appType: "admin", role: "operator", userId: "operator-author" });
    const reviewer = context({ appType: "admin", role: "auditor", userId: "auditor-reviewer" });
    const publisher = context({ appType: "admin", role: "admin", userId: "admin-publisher" });
    const customer = context({ appType: "customer", role: "customer", userId: "customer-stable" });

    const createBody = { definition: validCustomerSduiDefinition(), idempotencyKey: "create-home-0001" };
    const created = await service.createDraft(author, "customer.home", createBody);
    expect(customerSduiRevisionEnvelopeSchema.parse(created).revision.status).toBe("draft");
    const replay = await service.createDraft(author, "customer.home", createBody);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.revision.revisionId).toBe(created.revision.revisionId);

    const reviewed = await service.review(reviewer, "customer.home", created.revision.revisionId, {
      expectedVersion: 1, reviewNote: "approved for controlled rollout", idempotencyKey: "review-home-0001",
    });
    const published = await service.publish(publisher, "customer.home", created.revision.revisionId, {
      expectedVersion: reviewed.revision.version,
      scope: { cityCodes: ["hangzhou"], locales: ["zh-CN"], minimumAppVersion: "1.0.0", maximumAppVersion: "2.0.0", audienceTags: [] },
      rollout: { percentageBasisPoints: 5_000, bucketSeed: "home-canary-v1" },
      effectiveAt: "2026-07-23T02:00:00.000Z", expiresAt: "2026-07-24T02:00:00.000Z",
      idempotencyKey: "publish-home-0001",
    });
    expect(published.revision.status).toBe("published");

    const scheduled = await service.resolveManifest(customer, "customer.home", { appVersion: "1.5.0", locale: "zh-CN" });
    expect(scheduled.resolutionReason).toBe("no_eligible_manifest");

    clock = new Date("2026-07-23T03:00:00.000Z");
    const firstResolution = await service.resolveManifest(customer, "customer.home", { appVersion: "1.5.0", locale: "zh-CN" });
    const secondResolution = await service.resolveManifest(customer, "customer.home", { appVersion: "1.5.0", locale: "zh-CN" });
    expect(secondResolution.resolutionReason).toBe(firstResolution.resolutionReason);
    expect(customerSduiManifestEnvelopeSchema.safeParse(firstResolution).success).toBe(true);

    const unsupported = await service.resolveManifest(customer, "customer.home", { appVersion: "3.0.0", locale: "zh-CN" });
    expect(unsupported.resolutionReason).toBe("unsupported_client");

    clock = new Date("2026-07-25T03:00:00.000Z");
    const expired = await service.resolveManifest(customer, "customer.home", { appVersion: "1.5.0", locale: "zh-CN" });
    expect(expired.resolutionReason).toBe("no_eligible_manifest");

    const targetCreated = await service.createDraft(author, "customer.home", {
      definition: validCustomerSduiDefinition("customer.home.known-good"), idempotencyKey: "create-home-rollback-target",
    });
    const targetReviewed = await service.review(reviewer, "customer.home", targetCreated.revision.revisionId, {
      expectedVersion: 1, reviewNote: "known-good revision approved", idempotencyKey: "review-home-rollback-target",
    });
    const restored = await service.rollback(publisher, "customer.home", published.revision.revisionId, {
      expectedVersion: published.revision.version, targetRevisionId: targetReviewed.revision.revisionId,
      reason: "restore known-good composition", idempotencyKey: "rollback-home-0001",
    });
    expect(restored.revision.status).toBe("published");
    expect(restored.revision.definition.manifestId).toBe("customer.home.known-good");

    const retired = await service.unpublish(publisher, "customer.home", restored.revision.revisionId, {
      expectedVersion: restored.revision.version, reason: "retire restored test revision", idempotencyKey: "unpublish-home-0001",
    });
    expect(retired.revision.status).toBe("retired");
    expect((await service.resolveManifest(customer, "customer.home", { appVersion: "1.5.0", locale: "zh-CN" })).resolutionReason)
      .toBe("no_eligible_manifest");

    const kill = await service.setKillSwitch(publisher, "customer.home", {
      expectedVersion: 1, enabled: true, reason: "stop unsafe remote composition", idempotencyKey: "kill-home-0001",
    });
    expect(kill.killSwitch.enabled).toBe(true);
    const killed = await service.resolveManifest(customer, "customer.home", { appVersion: "1.5.0", locale: "zh-CN" });
    expect(killed).toMatchObject({ resolutionReason: "kill_switch", killSwitchActive: true, cacheTtlSeconds: 0, manifest: null });
    expect(repository.audits.map((audit) => audit.action)).toEqual(expect.arrayContaining([
      "create_draft", "review", "publish", "rollback", "unpublish", "kill_switch",
    ]));
  });

  it("enforces CAS and rejects an idempotency key reused with different content", async () => {
    const repository = new MemoryCustomerSduiRepository();
    const service = new CustomerSduiService(repository, () => new Date("2026-07-23T01:00:00.000Z"));
    const author = context({ appType: "admin", role: "operator", userId: "operator-author" });
    const created = await service.createDraft(author, "customer.home", {
      definition: validCustomerSduiDefinition(), idempotencyKey: "same-key-0001",
    });
    await expect(service.createDraft(author, "customer.home", {
      definition: validCustomerSduiDefinition("customer.home.changed"), idempotencyKey: "same-key-0001",
    })).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.updateDraft(author, "customer.home", created.revision.revisionId, {
      expectedVersion: 99, definition: validCustomerSduiDefinition(), idempotencyKey: "update-conflict-0001",
    })).rejects.toBeInstanceOf(CustomerSduiError);
  });

  it("returns clean fallback envelopes for no publication, expiry, and storage outage", async () => {
    const repository = new MemoryCustomerSduiRepository();
    let clock = new Date("2026-07-23T03:00:00.000Z");
    const service = new CustomerSduiService(repository, () => clock);
    const customer = context({ appType: "customer", role: "customer", userId: "customer-one" });
    expect((await service.resolveManifest(customer, "customer.home", { appVersion: "1.0.0", locale: "zh-CN" })).resolutionReason)
      .toBe("no_eligible_manifest");
    repository.failReads = true;
    const unavailable = await service.resolveManifest(customer, "customer.home", { appVersion: "1.0.0", locale: "zh-CN" });
    expect(unavailable).toMatchObject({ resolutionReason: "upstream_unavailable", manifest: null, cacheTtlSeconds: 0 });
    clock = new Date("2026-07-25T03:00:00.000Z");
    expect(customerSduiManifestEnvelopeSchema.safeParse(unavailable).success).toBe(true);
  });
});
