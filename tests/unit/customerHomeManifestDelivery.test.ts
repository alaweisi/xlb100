import type {
  CustomerSduiManifestEnvelope,
  CustomerSduiPageManifest,
} from "@xlb/types";
import { customerSduiManifestEnvelopeSchema } from "@xlb/validators";
import { describe, expect, it, vi } from "vitest";
import {
  getBuiltinHomeManifest,
  HomeManifestDelivery,
  MemoryHomeManifestCacheStorage,
  type HomeManifestRequestContext,
} from "../../apps/customer/src/platform/sdui/index.js";

const FALLBACK_POLICY = {
  strategy: "last_known_good_then_builtin",
  builtinManifestId: "customer.home.builtin",
  maximumStaleSeconds: 60,
} as const;

const CONTEXT: HomeManifestRequestContext = {
  pageId: "customer.home",
  cityCode: "hangzhou",
  locale: "zh-CN",
  appVersion: "2.0.0",
};

function makeManifest(
  revision: string,
  overrides: Partial<CustomerSduiPageManifest> = {},
): CustomerSduiPageManifest {
  return {
    ...getBuiltinHomeManifest(),
    manifestId: "customer.home.release",
    revision,
    contentHashSha256: revision.padEnd(64, "0").slice(0, 64),
    scope: {
      cityCodes: ["hangzhou"],
      locales: ["zh-CN"],
      minimumAppVersion: "1.0.0",
      maximumAppVersion: null,
      audienceTags: [],
    },
    fallbackPolicy: FALLBACK_POLICY,
    effectiveAt: "2026-07-01T00:00:00.000Z",
    publishedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEnvelope(
  manifest: CustomerSduiPageManifest | null,
  overrides: Partial<CustomerSduiManifestEnvelope> = {},
): CustomerSduiManifestEnvelope {
  const envelope: CustomerSduiManifestEnvelope = {
    schemaVersion: "1.0",
    requestId: "00000000-0000-4000-8000-000000000001",
    pageId: "customer.home",
    resolvedAt: "2026-07-23T00:00:00.000Z",
    scopeProof: "scope-proof",
    resolutionReason: manifest === null ? "upstream_unavailable" : "published",
    killSwitchActive: false,
    cacheTtlSeconds: manifest === null ? 0 : 10,
    manifest,
    fallbackPolicy: manifest?.fallbackPolicy ?? FALLBACK_POLICY,
    ...overrides,
  };
  const parsed = customerSduiManifestEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    throw new Error(JSON.stringify(parsed.error.issues));
  }
  return envelope;
}

function createClock(initial = "2026-07-23T00:00:00.000Z") {
  let nowMs = Date.parse(initial);
  return {
    now: () => new Date(nowMs),
    advance: (milliseconds: number) => {
      nowMs += milliseconds;
    },
  };
}

describe("Customer home manifest delivery", () => {
  it("loads, validates and caches a published manifest", async () => {
    const clock = createClock();
    const transport = { load: vi.fn().mockResolvedValue(makeEnvelope(makeManifest("a".repeat(64)))) };
    const delivery = new HomeManifestDelivery({
      transport,
      storage: new MemoryHomeManifestCacheStorage(),
      now: clock.now,
      isOnline: () => true,
    });

    const remote = await delivery.load(CONTEXT);
    const cached = await delivery.load(CONTEXT);

    expect(remote).toMatchObject({
      status: "ready",
      source: "remote",
      reason: "remote-published",
      previousRevision: null,
    });
    expect(cached).toMatchObject({
      status: "ready",
      source: "fresh-cache",
      reason: "fresh-cache",
    });
    expect(transport.load).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid envelope through the shared schema and uses the builtin", async () => {
    const delivery = new HomeManifestDelivery({
      transport: { load: vi.fn().mockResolvedValue({ schemaVersion: "99.0" }) },
      now: createClock().now,
      isOnline: () => true,
    });

    const result = await delivery.load(CONTEXT);

    expect(result).toMatchObject({
      status: "ready",
      source: "builtin",
      reason: "invalid-envelope-builtin",
      manifest: { manifestId: "customer.home.builtin" },
    });
  });

  it("uses a compatible LKG during upstream failure and expires it after the stale window", async () => {
    const clock = createClock();
    const transport = {
      load: vi.fn()
        .mockResolvedValueOnce(makeEnvelope(makeManifest("b".repeat(64))))
        .mockRejectedValue(new Error("network unavailable")),
    };
    const delivery = new HomeManifestDelivery({
      transport,
      storage: new MemoryHomeManifestCacheStorage(),
      now: clock.now,
      isOnline: () => true,
    });

    await delivery.load(CONTEXT);
    clock.advance(11_000);
    const lkg = await delivery.load(CONTEXT);
    clock.advance(60_001);
    const builtin = await delivery.load(CONTEXT);

    expect(lkg).toMatchObject({
      status: "ready",
      source: "last-known-good",
      reason: "upstream-lkg",
    });
    expect(builtin).toMatchObject({
      status: "ready",
      source: "builtin",
      reason: "upstream-builtin",
    });
  });

  it("never calls the transport offline and chooses LKG then builtin safely", async () => {
    const clock = createClock();
    let online = true;
    const transport = { load: vi.fn().mockResolvedValue(makeEnvelope(makeManifest("c".repeat(64)))) };
    const delivery = new HomeManifestDelivery({
      transport,
      storage: new MemoryHomeManifestCacheStorage(),
      now: clock.now,
      isOnline: () => online,
    });

    await delivery.load(CONTEXT);
    clock.advance(11_000);
    online = false;
    const lkg = await delivery.load(CONTEXT);
    clock.advance(60_001);
    const builtin = await delivery.load(CONTEXT);

    expect(lkg).toMatchObject({ source: "last-known-good", reason: "offline-lkg" });
    expect(builtin).toMatchObject({ source: "builtin", reason: "offline-builtin" });
    expect(transport.load).toHaveBeenCalledTimes(1);
  });

  it("applies latest-wins and does not cache a superseded response", async () => {
    const clock = createClock();
    let markFirstStarted!: () => void;
    const first = new Promise<unknown>(() => undefined);
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const newest = makeManifest("d".repeat(64));
    const transport = {
      load: vi.fn()
        .mockImplementationOnce(() => {
          markFirstStarted();
          return first;
        })
        .mockResolvedValueOnce(makeEnvelope(newest)),
    };
    const delivery = new HomeManifestDelivery({
      transport,
      storage: new MemoryHomeManifestCacheStorage(),
      now: clock.now,
      isOnline: () => true,
    });

    const staleRequest = delivery.load({ ...CONTEXT, forceRefresh: true });
    await firstStarted;
    const newestRequest = delivery.load({ ...CONTEXT, forceRefresh: true });
    await newestRequest;

    expect(await staleRequest).toEqual({ status: "superseded" });
    expect(await delivery.load(CONTEXT)).toMatchObject({
      status: "ready",
      source: "fresh-cache",
      manifest: { revision: newest.revision },
    });
  });

  it("rejects a schema-valid manifest outside the client version range", async () => {
    const incompatible = makeManifest("f".repeat(64), {
      scope: {
        cityCodes: ["hangzhou"],
        locales: ["zh-CN"],
        minimumAppVersion: "3.0.0",
        maximumAppVersion: null,
        audienceTags: [],
      },
    });
    const delivery = new HomeManifestDelivery({
      transport: { load: vi.fn().mockResolvedValue(makeEnvelope(incompatible)) },
      now: createClock().now,
      isOnline: () => true,
    });

    expect(await delivery.load(CONTEXT)).toMatchObject({
      source: "builtin",
      reason: "incompatible-manifest-builtin",
    });
  });

  it("accepts an authoritative rollback and replaces the cached revision", async () => {
    const clock = createClock();
    let online = true;
    const revisionTwo = makeManifest("2".repeat(64), {
      publishedAt: "2026-07-22T00:00:00.000Z",
      effectiveAt: "2026-07-22T00:00:00.000Z",
    });
    const revisionOne = makeManifest("1".repeat(64), {
      publishedAt: "2026-07-20T00:00:00.000Z",
      effectiveAt: "2026-07-20T00:00:00.000Z",
    });
    const transport = {
      load: vi.fn()
        .mockResolvedValueOnce(makeEnvelope(revisionTwo))
        .mockResolvedValueOnce(makeEnvelope(revisionOne, {
          requestId: "00000000-0000-4000-8000-000000000002",
        })),
    };
    const delivery = new HomeManifestDelivery({
      transport,
      storage: new MemoryHomeManifestCacheStorage(),
      now: clock.now,
      isOnline: () => online,
    });

    await delivery.load(CONTEXT);
    clock.advance(11_000);
    const rollback = await delivery.load({ ...CONTEXT, forceRefresh: true });
    clock.advance(11_000);
    online = false;
    const cachedRollback = await delivery.load(CONTEXT);

    expect(rollback).toMatchObject({
      source: "remote",
      previousRevision: revisionTwo.revision,
      manifest: { revision: revisionOne.revision },
    });
    expect(cachedRollback).toMatchObject({
      source: "last-known-good",
      manifest: { revision: revisionOne.revision },
    });
  });

  it("honors Kill Switch immediately, clears LKG and falls back to builtin offline", async () => {
    const clock = createClock();
    let online = true;
    const remoteManifest = makeManifest("7".repeat(64));
    const transport = {
      load: vi.fn()
        .mockResolvedValueOnce(makeEnvelope(remoteManifest))
        .mockResolvedValueOnce(makeEnvelope(null, {
          requestId: "00000000-0000-4000-8000-000000000003",
          resolutionReason: "kill_switch",
          killSwitchActive: true,
          cacheTtlSeconds: 0,
        })),
    };
    const delivery = new HomeManifestDelivery({
      transport,
      storage: new MemoryHomeManifestCacheStorage(),
      now: clock.now,
      isOnline: () => online,
    });

    await delivery.load(CONTEXT);
    const killed = await delivery.load({ ...CONTEXT, forceRefresh: true });
    online = false;
    const offline = await delivery.load(CONTEXT);

    expect(killed).toMatchObject({
      source: "builtin",
      reason: "kill-switch",
      previousRevision: remoteManifest.revision,
    });
    expect(offline).toMatchObject({
      source: "builtin",
      reason: "offline-builtin",
    });
  });

  it("opens the circuit, short-circuits requests, then probes after cooldown", async () => {
    const clock = createClock();
    const transport = {
      load: vi.fn()
        .mockRejectedValueOnce(new Error("failure-1"))
        .mockRejectedValueOnce(new Error("failure-2"))
        .mockResolvedValueOnce(makeEnvelope(makeManifest("8".repeat(64)))),
    };
    const delivery = new HomeManifestDelivery({
      transport,
      now: clock.now,
      isOnline: () => true,
      circuitBreaker: { failureThreshold: 2, cooldownMs: 5_000 },
    });

    await delivery.load({ ...CONTEXT, forceRefresh: true });
    const opened = await delivery.load({ ...CONTEXT, forceRefresh: true });
    const shortCircuited = await delivery.load({ ...CONTEXT, forceRefresh: true });
    clock.advance(5_001);
    const recovered = await delivery.load({ ...CONTEXT, forceRefresh: true });

    expect(opened).toMatchObject({ circuitState: "open" });
    expect(shortCircuited).toMatchObject({
      reason: "circuit-open-builtin",
      circuitState: "open",
    });
    expect(transport.load).toHaveBeenCalledTimes(3);
    expect(recovered).toMatchObject({
      source: "remote",
      circuitState: "closed",
    });
  });

  it("drops corrupted cache records instead of rendering them", async () => {
    const storage = new MemoryHomeManifestCacheStorage();
    const delivery = new HomeManifestDelivery({
      transport: { load: vi.fn().mockRejectedValue(new Error("offline")) },
      storage,
      now: createClock().now,
      isOnline: () => true,
      cacheKeyPrefix: "test-corrupt",
    });
    storage.setItem(
      "test-corrupt:customer.home:hangzhou:zh-CN:2.0.0",
      JSON.stringify({ formatVersion: 1, manifest: { schemaVersion: "1.0" } }),
    );

    expect(await delivery.load(CONTEXT)).toMatchObject({
      source: "builtin",
      reason: "upstream-builtin",
    });
    expect(storage.getItem("test-corrupt:customer.home:hangzhou:zh-CN:2.0.0")).toBeNull();
  });

  it("bounds a hanging transport, aborts it and counts timeout toward the circuit", async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | null = null;
      const transport = {
        load: vi.fn((_context: HomeManifestRequestContext, signal: AbortSignal) => {
          capturedSignal = signal;
          return new Promise<unknown>(() => undefined);
        }),
      };
      const delivery = new HomeManifestDelivery({
        transport,
        now: createClock().now,
        isOnline: () => true,
        requestTimeoutMs: 2_000,
        circuitBreaker: { failureThreshold: 1, cooldownMs: 5_000 },
      });

      const pending = delivery.load({ ...CONTEXT, forceRefresh: true });
      await vi.advanceTimersByTimeAsync(2_001);
      const result = await pending;

      expect(capturedSignal?.aborted).toBe(true);
      expect(result).toMatchObject({
        status: "ready",
        source: "builtin",
        reason: "upstream-builtin",
        circuitState: "open",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not count a latest-wins abort as a circuit failure", async () => {
    let rejectFirst!: (error: unknown) => void;
    let markFirstStarted!: () => void;
    const first = new Promise<unknown>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const transport = {
      load: vi.fn((_context: HomeManifestRequestContext, signal: AbortSignal) => {
        if (transport.load.mock.calls.length === 1) {
          markFirstStarted();
          signal.addEventListener("abort", () => {
            const error = new Error("superseded");
            error.name = "AbortError";
            rejectFirst(error);
          });
          return first;
        }
        return Promise.resolve(makeEnvelope(makeManifest("9".repeat(64))));
      }),
    };
    const delivery = new HomeManifestDelivery({
      transport,
      now: createClock().now,
      isOnline: () => true,
      circuitBreaker: { failureThreshold: 1, cooldownMs: 5_000 },
    });

    const superseded = delivery.load({ ...CONTEXT, forceRefresh: true });
    await firstStarted;
    const newest = delivery.load({ ...CONTEXT, forceRefresh: true });

    expect(await superseded).toEqual({ status: "superseded" });
    expect(await newest).toMatchObject({ source: "remote", circuitState: "closed" });
    expect(delivery.circuitState).toBe("closed");
  });
});
