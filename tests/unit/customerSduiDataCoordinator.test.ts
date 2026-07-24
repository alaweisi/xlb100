import type { CatalogSnapshot, CustomerSduiDataSource } from "@xlb/types";
import { describe, expect, it, vi } from "vitest";

import {
  HomeDataAdapterRegistry,
  HomeDataCoordinator,
  registerCustomerHomeDataAdapters,
  resolveHomeDataSlots,
} from "../../apps/customer/src/platform/sdui/data/index.js";

const locationSource = (id = "location"): CustomerSduiDataSource => ({
  id,
  dataKey: "customer.current_location",
  parameters: {},
});

const categorySource = (id = "categories"): CustomerSduiDataSource => ({
  id,
  dataKey: "catalog.service_categories",
  parameters: { limit: 16 },
});

const recommendationSource = (id = "recommendations"): CustomerSduiDataSource => ({
  id,
  dataKey: "catalog.recommended_services",
  parameters: { limit: 3, strategy: "default" },
});

const request = (dataSources: readonly CustomerSduiDataSource[], cacheScopeKey = "city:hangzhou|actor:anonymous") => ({
  requestId: "request-1",
  cityCode: "hangzhou",
  locale: "zh-CN",
  cacheScopeKey,
  dataSources,
});

describe("Customer HomeDataCoordinator", () => {
  it("deduplicates equal sources and coalesces a shared upstream request across adapters", async () => {
    const upstream = vi.fn().mockResolvedValue({ marker: "catalog" });
    const categoriesLoad = vi.fn(async (_source, context) => {
      await context.request("customer.catalog", upstream);
      return [];
    });
    const recommendationsLoad = vi.fn(async (_source, context) => {
      await context.request("customer.catalog", upstream);
      return [];
    });
    const registry = new HomeDataAdapterRegistry()
      .register({ dataKey: "catalog.service_categories", load: categoriesLoad })
      .register({ dataKey: "catalog.recommended_services", load: recommendationsLoad });
    const coordinator = new HomeDataCoordinator(registry);

    const result = await coordinator.load(request([
      categorySource("categories-a"),
      categorySource("categories-b"),
      recommendationSource(),
    ]));

    expect(result.state).toBe("ready");
    expect(categoriesLoad).toHaveBeenCalledTimes(1);
    expect(recommendationsLoad).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(Object.keys(result.results)).toEqual([
      "categories-a",
      "categories-b",
      "recommendations",
    ]);
  });

  it("partitions cache by caller-provided scope and uses bounded stale data on failure", async () => {
    let now = 1_000;
    let shouldFail = false;
    const load = vi.fn(async () => {
      if (shouldFail) throw new Error("offline");
      return {
        cityCode: "hangzhou",
        cityLabel: "杭州",
        districtLabel: "西湖区",
        displayLabel: "杭州 · 西湖区",
      };
    });
    const coordinator = new HomeDataCoordinator(
      new HomeDataAdapterRegistry().register({
        dataKey: "customer.current_location",
        load,
      }),
      { now: () => now, freshTtlMs: 100, staleTtlMs: 1_000 },
    );

    const first = await coordinator.load(request([locationSource()]));
    now += 50;
    const cached = await coordinator.load(request([locationSource()]));
    shouldFail = true;
    now += 100;
    const stale = await coordinator.load(request([locationSource()]));
    const otherScope = await coordinator.load(request([locationSource()], "city:shanghai|actor:anonymous"));

    expect(first.results.location).toMatchObject({ state: "success", cache: "miss" });
    expect(cached.results.location).toMatchObject({ state: "success", cache: "fresh" });
    expect(stale.results.location).toMatchObject({ state: "stale", cache: "stale" });
    expect(otherScope.results.location).toMatchObject({ state: "error" });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("returns partial data when an optional manifest source has no installed adapter", async () => {
    const registry = new HomeDataAdapterRegistry().register({
      dataKey: "customer.current_location",
      async load() {
        return {
          cityCode: "hangzhou",
          cityLabel: "杭州",
          districtLabel: null,
          displayLabel: "杭州",
        };
      },
    });

    const result = await new HomeDataCoordinator(registry).load(request([
      locationSource(),
      recommendationSource(),
    ]));

    expect(result.state).toBe("partial");
    expect(result.results.location.state).toBe("success");
    expect(result.results.recommendations).toMatchObject({
      state: "unavailable",
      error: { code: "missing_adapter", retryable: false },
    });
  });

  it("classifies coordinator timeout and caller cancellation without exposing adapter errors", async () => {
    const registry = new HomeDataAdapterRegistry().register({
      dataKey: "customer.current_location",
      load(_source, context) {
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
        });
      },
    });
    const timeoutCoordinator = new HomeDataCoordinator(registry, { timeoutMs: 5 });
    const timedOut = await timeoutCoordinator.load(request([locationSource()]));
    expect(timedOut.results.location).toMatchObject({
      state: "error",
      error: { code: "timeout", retryable: true },
    });

    const external = new AbortController();
    const pending = new HomeDataCoordinator(registry, { timeoutMs: 1_000 }).load({
      ...request([locationSource()]),
      signal: external.signal,
    });
    external.abort(new Error("route changed"));
    const cancelled = await pending;
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.results.location).toMatchObject({
      state: "cancelled",
      error: { code: "cancelled" },
    });
  });

  it("enforces timeout even when an adapter fails to observe the abort signal", async () => {
    const registry = new HomeDataAdapterRegistry().register({
      dataKey: "customer.current_location",
      load() {
        return new Promise(() => undefined);
      },
    });
    const result = await new HomeDataCoordinator(registry, { timeoutMs: 5 }).load(
      request([locationSource()]),
    );
    expect(result.results.location).toMatchObject({
      state: "error",
      error: { code: "timeout" },
    });
  });

  it("adapts authoritative catalog and notification APIs and leaves unavailable domains unregistered", async () => {
    const catalog: CatalogSnapshot = {
      cityCode: "hangzhou",
      categories: [
        {
          categoryId: "category-2",
          cityCode: "hangzhou",
          name: "第二类",
          sortOrder: 2,
          isEnabled: true,
          items: [],
        },
        {
          categoryId: "category-1",
          cityCode: "hangzhou",
          name: "第一类",
          sortOrder: 1,
          isEnabled: true,
          items: [],
        },
      ],
    };
    const getCatalog = vi.fn().mockResolvedValue({ ok: true, catalog });
    const getNotificationUnreadCount = vi.fn().mockResolvedValue({ ok: true, unreadCount: 7 });
    const registry = registerCustomerHomeDataAdapters(new HomeDataAdapterRegistry(), {
      customerApi: { getCatalog, getNotificationUnreadCount },
      async getCurrentLocation() {
        return {
          cityCode: "hangzhou",
          cityLabel: "杭州",
          districtLabel: "西湖区",
          displayLabel: "杭州 · 西湖区",
        };
      },
    });
    const coordinator = new HomeDataCoordinator(registry);
    const notificationSource: CustomerSduiDataSource = {
      id: "notifications",
      dataKey: "customer.notification_summary",
      parameters: {},
    };

    const result = await coordinator.load(request([
      categorySource(),
      notificationSource,
      recommendationSource(),
    ]));

    expect(result.results.categories).toMatchObject({
      state: "success",
      value: [
        { categoryId: "category-1", name: "第一类" },
        { categoryId: "category-2", name: "第二类" },
      ],
    });
    expect(result.results.notifications).toMatchObject({ state: "success", value: { unreadCount: 7 } });
    expect(result.results.recommendations.state).toBe("unavailable");
    expect(getCatalog.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(getNotificationUnreadCount.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects duplicate adapter registrations and records duplicate manifest source ids", async () => {
    const adapter = {
      dataKey: "customer.current_location" as const,
      async load() {
        return {
          cityCode: "hangzhou",
          cityLabel: "杭州",
          districtLabel: null,
          displayLabel: "杭州",
        };
      },
    };
    const registry = new HomeDataAdapterRegistry().register(adapter);
    expect(() => registry.register(adapter)).toThrow("already registered");

    const result = await new HomeDataCoordinator(registry).load(request([
      locationSource("duplicate"),
      locationSource("duplicate"),
    ]));
    expect(result.issues).toEqual([{ sourceId: "duplicate", code: "duplicate_source_id" }]);
  });

  it("maps P3 resolved bindings to component slots and blocks only missing required slots", async () => {
    const registry = new HomeDataAdapterRegistry().register({
      dataKey: "customer.current_location",
      async load() {
        return {
          cityCode: "hangzhou",
          cityLabel: "杭州",
          districtLabel: null,
          displayLabel: "杭州",
        };
      },
    });
    const batch = await new HomeDataCoordinator(registry).load(request([
      locationSource(),
      recommendationSource(),
    ]));
    const resolved = resolveHomeDataSlots({
      dataBindings: [
        { slot: "location", source: locationSource(), required: true },
        { slot: "recommendations", source: recommendationSource(), required: false },
      ],
    }, batch);

    expect(resolved.renderable).toBe(true);
    expect(resolved.data.location).toMatchObject({ displayLabel: "杭州" });
    expect(resolved.data).not.toHaveProperty("recommendations");
    expect(resolved.slots).toEqual([
      expect.objectContaining({ slot: "location", state: "success", required: true }),
      expect.objectContaining({ slot: "recommendations", state: "unavailable", required: false }),
    ]);

    const required = resolveHomeDataSlots({
      dataBindings: [
        { slot: "recommendations", source: recommendationSource(), required: true },
      ],
    }, batch);
    expect(required.renderable).toBe(false);
    expect(required.requiredFailures).toHaveLength(1);
  });
});
