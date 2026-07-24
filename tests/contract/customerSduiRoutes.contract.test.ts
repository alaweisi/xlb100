import {
  customerSduiAuditListEnvelopeSchema,
  customerSduiKillSwitchReadEnvelopeSchema,
  customerSduiRevisionListEnvelopeSchema,
  customerSduiRevisionReadEnvelopeSchema,
} from "@xlb/validators";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createToken } from "../../backend/src/auth/tokenAuth.js";
import { CustomerSduiService } from "../../backend/src/customerSdui/customerSduiService.js";
import {
  context,
  MemoryCustomerSduiRepository,
  validCustomerSduiDefinition,
} from "../helpers/customerSduiTestKit.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("Customer SDUI manifest HTTP caching contract", () => {
  it("returns a stable private ETag and honors If-None-Match without leaking fallback responses", async () => {
    const repository = new MemoryCustomerSduiRepository();
    let clock = new Date("2026-07-23T01:00:00.000Z");
    const service = new CustomerSduiService(repository, () => clock, async () => {});
    const author = context({ appType: "admin", role: "operator", userId: "etag-author" });
    const reviewer = context({ appType: "admin", role: "auditor", userId: "etag-reviewer" });
    const publisher = context({ appType: "admin", role: "admin", userId: "etag-publisher" });

    const created = await service.createDraft(author, "customer.home", {
      definition: validCustomerSduiDefinition("customer.home.etag"),
      idempotencyKey: "etag-create-0001",
    });
    const reviewed = await service.review(reviewer, "customer.home", created.revision.revisionId, {
      expectedVersion: created.revision.version,
      reviewNote: "approved for HTTP cache contract",
      idempotencyKey: "etag-review-0001",
    });
    const published = await service.publish(publisher, "customer.home", reviewed.revision.revisionId, {
      expectedVersion: reviewed.revision.version,
      scope: {
        cityCodes: ["hangzhou"],
        locales: ["zh-CN"],
        minimumAppVersion: "1.0.0",
        maximumAppVersion: null,
        audienceTags: [],
      },
      rollout: { percentageBasisPoints: 10_000, bucketSeed: "etag-cache-contract" },
      effectiveAt: "2026-07-23T02:00:00.000Z",
      expiresAt: null,
      idempotencyKey: "etag-publish-0001",
    });
    clock = new Date("2026-07-23T03:00:00.000Z");

    const app = await buildApp({ customerSduiService: service });
    apps.push(app);
    const headers = {
      authorization: `Bearer ${createToken("etag-customer", "customer", "customer")}`,
      "x-xlb-city-code": "hangzhou",
    };
    const url = "/api/customer/sdui/pages/customer.home/manifest?appVersion=1.0.0&locale=zh-CN";

    const initial = await app.inject({ method: "GET", url, headers });
    expect(initial.statusCode).toBe(200);
    expect(initial.headers["cache-control"]).toBe("private, max-age=0, must-revalidate");
    expect(initial.headers.vary).toContain("Authorization");
    expect(initial.headers.vary).toContain("X-XLB-City-Code");
    expect(initial.headers.etag).toMatch(/^"sdui_rev_[a-f0-9]+-[a-f0-9]{64}"$/u);

    const conditional = await app.inject({
      method: "GET",
      url,
      headers: { ...headers, "if-none-match": initial.headers.etag! },
    });
    expect(conditional.statusCode).toBe(304);
    expect(conditional.body).toBe("");
    expect(conditional.headers.etag).toBe(initial.headers.etag);

    const adminHeaders = {
      authorization: `Bearer ${createToken("etag-publisher", "admin", "admin")}`,
      "x-xlb-city-code": "hangzhou",
    };
    const revisionList = await app.inject({
      method: "GET",
      url: "/api/internal/customer-sdui/pages/customer.home/revisions?status=published&limit=1",
      headers: adminHeaders,
    });
    expect(revisionList.statusCode).toBe(200);
    expect(revisionList.headers["cache-control"]).toBe("no-store");
    const revisionListBody = customerSduiRevisionListEnvelopeSchema.parse(revisionList.json());
    expect(revisionListBody.revisions).toHaveLength(1);

    const revisionDetail = await app.inject({
      method: "GET",
      url: `/api/internal/customer-sdui/pages/customer.home/revisions/${reviewed.revision.revisionId}`,
      headers: adminHeaders,
    });
    expect(revisionDetail.statusCode).toBe(200);
    expect(customerSduiRevisionReadEnvelopeSchema.parse(revisionDetail.json()).revision.status).toBe("published");

    const killStateBefore = await app.inject({
      method: "GET",
      url: "/api/internal/customer-sdui/pages/customer.home/kill-switch",
      headers: adminHeaders,
    });
    expect(killStateBefore.statusCode).toBe(200);
    expect(customerSduiKillSwitchReadEnvelopeSchema.parse(killStateBefore.json()).killSwitch).toBeNull();

    const publishAudits = await app.inject({
      method: "GET",
      url: "/api/internal/customer-sdui/pages/customer.home/audits?action=publish&limit=2",
      headers: adminHeaders,
    });
    expect(publishAudits.statusCode).toBe(200);
    expect(customerSduiAuditListEnvelopeSchema.parse(publishAudits.json()).audits)
      .toMatchObject([{ action: "publish", revisionId: reviewed.revision.revisionId }]);

    const invalidPageSize = await app.inject({
      method: "GET",
      url: "/api/internal/customer-sdui/pages/customer.home/audits?limit=101",
      headers: adminHeaders,
    });
    expect(invalidPageSize.statusCode).toBe(400);

    const customerDenied = await app.inject({
      method: "GET",
      url: "/api/internal/customer-sdui/pages/customer.home/revisions",
      headers,
    });
    expect(customerDenied.statusCode).toBe(403);

    const retiredOriginal = await service.unpublish(publisher, "customer.home", published.revision.revisionId, {
      expectedVersion: published.revision.version,
      reason: "prepare original revision as rollback target",
      idempotencyKey: "etag-retire-original-0001",
    });
    const sourceCreated = await service.createDraft(author, "customer.home", {
      definition: validCustomerSduiDefinition("customer.home.replacement"),
      idempotencyKey: "etag-create-source-0001",
    });
    const sourceReviewed = await service.review(reviewer, "customer.home", sourceCreated.revision.revisionId, {
      expectedVersion: sourceCreated.revision.version,
      reviewNote: "approve replacement before rollback test",
      idempotencyKey: "etag-review-source-0001",
    });
    const sourcePublished = await service.publish(publisher, "customer.home", sourceReviewed.revision.revisionId, {
      expectedVersion: sourceReviewed.revision.version,
      scope: {
        cityCodes: ["hangzhou"],
        locales: ["zh-CN"],
        minimumAppVersion: "1.0.0",
        maximumAppVersion: null,
        audienceTags: [],
      },
      rollout: { percentageBasisPoints: 10_000, bucketSeed: "etag-replacement-contract" },
      effectiveAt: "2026-07-23T04:00:00.000Z",
      expiresAt: null,
      idempotencyKey: "etag-publish-source-0001",
    });
    clock = new Date("2026-07-23T05:00:00.000Z");
    const restored = await service.rollback(publisher, "customer.home", sourcePublished.revision.revisionId, {
      expectedVersion: sourcePublished.revision.version,
      targetRevisionId: retiredOriginal.revision.revisionId,
      reason: "verify publication metadata invalidates the old ETag",
      idempotencyKey: "etag-rollback-original-0001",
    });
    expect(restored.revision.revisionId).toBe(reviewed.revision.revisionId);

    const staleConditional = await app.inject({
      method: "GET",
      url,
      headers: { ...headers, "if-none-match": initial.headers.etag! },
    });
    expect(staleConditional.statusCode).toBe(200);
    expect(staleConditional.headers.etag).not.toBe(initial.headers.etag);
    expect(staleConditional.json()).toMatchObject({
      resolutionReason: "published",
      manifest: {
        revision: reviewed.revision.revisionId,
        effectiveAt: "2026-07-23T05:00:00.000Z",
      },
    });

    await service.setKillSwitch(publisher, "customer.home", {
      expectedVersion: 1,
      enabled: true,
      reason: "exercise no-store fallback",
      idempotencyKey: "etag-kill-0001",
    });
    const killed = await app.inject({ method: "GET", url, headers });
    expect(killed.statusCode).toBe(200);
    expect(killed.headers["cache-control"]).toBe("no-store");
    expect(killed.headers.etag).toBeUndefined();
    expect(killed.json()).toMatchObject({
      resolutionReason: "kill_switch",
      killSwitchActive: true,
      manifest: null,
    });

    const killStateAfter = await app.inject({
      method: "GET",
      url: "/api/internal/customer-sdui/pages/customer.home/kill-switch",
      headers: adminHeaders,
    });
    expect(customerSduiKillSwitchReadEnvelopeSchema.parse(killStateAfter.json()).killSwitch)
      .toMatchObject({ enabled: true, reason: "exercise no-store fallback" });
  });
});
