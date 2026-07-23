import type {
  CustomerSduiApi,
  CustomerSduiManifestReadResult,
} from "@xlb/api-client";
import type {
  CustomerSduiManifestEnvelope,
  CustomerSduiPageManifest,
} from "@xlb/types";
import { customerSduiManifestEnvelopeSchema } from "@xlb/validators";
import { describe, expect, it, vi } from "vitest";
import {
  CustomerSduiHomeManifestTransport,
  getBuiltinHomeManifest,
  HomeManifestDelivery,
  MemoryHomeManifestCacheStorage,
  type HomeManifestRequestContext,
} from "../../apps/customer/src/platform/sdui/index.js";

const CONTEXT: HomeManifestRequestContext = {
  pageId: "customer.home",
  cityCode: "hangzhou",
  locale: "zh-CN",
  appVersion: "2.0.0",
};

function manifest(revision = "a".repeat(64)): CustomerSduiPageManifest {
  return {
    ...getBuiltinHomeManifest(),
    manifestId: "customer.home.production",
    revision,
    contentHashSha256: revision,
    scope: {
      cityCodes: ["hangzhou"],
      locales: ["zh-CN"],
      minimumAppVersion: "1.0.0",
      maximumAppVersion: null,
      audienceTags: [],
    },
    effectiveAt: "2026-07-22T00:00:00.000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
  };
}

function envelope(
  pageManifest: CustomerSduiPageManifest | null,
  overrides: Partial<CustomerSduiManifestEnvelope> = {},
): CustomerSduiManifestEnvelope {
  return customerSduiManifestEnvelopeSchema.parse({
    schemaVersion: "1.0",
    requestId: "00000000-0000-4000-8000-000000000001",
    pageId: "customer.home",
    resolvedAt: "2026-07-23T00:00:00.000Z",
    scopeProof: "scope-proof",
    resolutionReason: pageManifest === null ? "kill_switch" : "published",
    killSwitchActive: pageManifest === null,
    cacheTtlSeconds: pageManifest === null ? 0 : 10,
    manifest: pageManifest,
    fallbackPolicy: pageManifest?.fallbackPolicy ?? getBuiltinHomeManifest().fallbackPolicy,
    ...overrides,
  });
}

function apiWith(
  implementation: CustomerSduiApi["getPublishedManifestConditional"],
): Pick<CustomerSduiApi, "getPublishedManifestConditional"> {
  return { getPublishedManifestConditional: implementation };
}

describe("Customer SDUI home manifest production transport", () => {
  it("persists a validated ETag/envelope pair and reuses it for a 304", async () => {
    const published = envelope(manifest());
    const etag = `"${"e".repeat(64)}"`;
    const storage = new MemoryHomeManifestCacheStorage();
    const read = vi.fn()
      .mockResolvedValueOnce({
        etag,
        envelope: published,
        notModified: false,
      } satisfies CustomerSduiManifestReadResult)
      .mockImplementationOnce(async (
        _pageId,
        _input,
        cached,
      ): Promise<CustomerSduiManifestReadResult> => ({
        etag: cached?.etag ?? null,
        envelope: cached?.envelope ?? published,
        notModified: true,
      }));
    const transport = new CustomerSduiHomeManifestTransport({
      api: apiWith(read),
      storage,
      cacheKeyPrefix: "test-http",
    });

    await transport.load(CONTEXT, new AbortController().signal);
    const second = await transport.load(CONTEXT, new AbortController().signal);

    expect(second).toEqual(published);
    expect(read).toHaveBeenNthCalledWith(
      2,
      "customer.home",
      { appVersion: "2.0.0", locale: "zh-CN" },
      { etag, envelope: published },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("drops a corrupted conditional cache before making the request", async () => {
    const published = envelope(manifest("b".repeat(64)));
    const storage = new MemoryHomeManifestCacheStorage();
    storage.setItem(
      "test-corrupt:customer.home:hangzhou:zh-CN:2.0.0",
      JSON.stringify({
        formatVersion: 1,
        etag: "\"poisoned\"",
        envelope: { schemaVersion: "invalid" },
      }),
    );
    const read = vi.fn().mockResolvedValue({
      etag: `"${"f".repeat(64)}"`,
      envelope: published,
      notModified: false,
    } satisfies CustomerSduiManifestReadResult);
    const transport = new CustomerSduiHomeManifestTransport({
      api: apiWith(read),
      storage,
      cacheKeyPrefix: "test-corrupt",
    });

    await transport.load(CONTEXT, new AbortController().signal);

    expect(read.mock.calls[0]?.[2]).toBeUndefined();
  });

  it("rejects a published response without the mandatory ETag", async () => {
    const published = envelope(manifest("9".repeat(64)));
    const transport = new CustomerSduiHomeManifestTransport({
      api: apiWith(vi.fn().mockResolvedValue({
        etag: null,
        envelope: published,
        notModified: false,
      } satisfies CustomerSduiManifestReadResult)),
      storage: new MemoryHomeManifestCacheStorage(),
    });

    await expect(
      transport.load(CONTEXT, new AbortController().signal),
    ).rejects.toThrow("no valid ETag");
  });

  it("lets P4 process Kill Switch and clears both HTTP and LKG caches", async () => {
    const published = envelope(manifest("c".repeat(64)));
    const killed = envelope(null, {
      requestId: "00000000-0000-4000-8000-000000000002",
    });
    const etag = `"${"d".repeat(64)}"`;
    const conditionalStorage = new MemoryHomeManifestCacheStorage();
    const read = vi.fn()
      .mockResolvedValueOnce({
        etag,
        envelope: published,
        notModified: false,
      } satisfies CustomerSduiManifestReadResult)
      .mockResolvedValueOnce({
        etag: null,
        envelope: killed,
        notModified: false,
      } satisfies CustomerSduiManifestReadResult);
    const transport = new CustomerSduiHomeManifestTransport({
      api: apiWith(read),
      storage: conditionalStorage,
      cacheKeyPrefix: "test-kill",
    });
    let online = true;
    const delivery = new HomeManifestDelivery({
      transport,
      storage: new MemoryHomeManifestCacheStorage(),
      now: () => new Date("2026-07-23T00:00:00.000Z"),
      isOnline: () => online,
    });

    await delivery.load({ ...CONTEXT, forceRefresh: true });
    const result = await delivery.load({ ...CONTEXT, forceRefresh: true });
    online = false;
    const offline = await delivery.load(CONTEXT);

    expect(result).toMatchObject({
      status: "ready",
      source: "builtin",
      reason: "kill-switch",
      previousRevision: "c".repeat(64),
    });
    expect(
      conditionalStorage.getItem("test-kill:customer.home:hangzhou:zh-CN:2.0.0"),
    ).toBeNull();
    expect(offline).toMatchObject({
      status: "ready",
      source: "builtin",
      reason: "offline-builtin",
    });
  });
});
