// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import type {
  CustomerSduiComponentType,
  CustomerSduiPageManifest,
} from "@xlb/types";
import { customerSduiPageManifestSchema } from "@xlb/validators";
import { describe, expect, it, vi } from "vitest";
import {
  HomeActionRegistry,
  HomeComponentRegistry,
  HomeCompositionEngine,
  HomeRenderer,
  type HomeComponentDefinition,
  type HomeComponentRuntimeProps,
} from "../../apps/customer/src/platform/sdui/index.js";

const manifest: CustomerSduiPageManifest = {
  schemaVersion: "1.0",
  componentContractVersion: "1.0",
  manifestId: "customer.home.release",
  pageId: "customer.home",
  revision: "revision-7",
  contentHashSha256: "0".repeat(64),
  scope: {
    cityCodes: ["hangzhou"],
    locales: ["zh-CN"],
    minimumAppVersion: "1.0.0",
    maximumAppVersion: null,
    audienceTags: [],
  },
  rollout: {
    percentageBasisPoints: 10_000,
    bucketSeed: "customer-home-runtime-test",
  },
  components: [
    {
      id: "home.location",
      type: "location_header",
      contractVersion: "1.0",
      region: "header",
      order: 0,
      enabled: true,
      props: { subtitle: null, showNotifications: false },
      dataBindings: [{ slot: "location", dataRef: "source.location", required: true }],
      actionBindings: [{ slot: "location", actionRef: "action.location" }],
    },
    {
      id: "home.search",
      type: "search_bar",
      contractVersion: "1.0",
      region: "header",
      order: 1,
      enabled: true,
      props: { placeholder: "搜索服务", accessibleLabel: "搜索全部上门服务" },
      dataBindings: [],
      actionBindings: [{ slot: "submit", actionRef: "action.search" }],
    },
    {
      id: "home.services",
      type: "service_grid",
      contractVersion: "1.0",
      region: "content",
      order: 0,
      enabled: true,
      props: { title: "全部服务", columns: 4, maxItems: 16, showViewAll: true },
      dataBindings: [{ slot: "items", dataRef: "source.categories", required: true }],
      actionBindings: [
        { slot: "item", actionRef: "action.open-category" },
        { slot: "view-all", actionRef: "action.open-services" },
      ],
    },
    {
      id: "home.navigation",
      type: "bottom_navigation",
      contractVersion: "1.0",
      region: "footer",
      order: 0,
      enabled: true,
      props: { activeItem: "home", showDemandAction: true },
      dataBindings: [],
      actionBindings: [
        { slot: "home", actionRef: "action.home" },
        { slot: "support", actionRef: "action.support" },
        { slot: "orders", actionRef: "action.orders" },
        { slot: "profile", actionRef: "action.profile" },
        { slot: "demand", actionRef: "action.demand" },
      ],
    },
  ],
  dataSources: [
    { id: "source.location", dataKey: "customer.current_location", parameters: {} },
    {
      id: "source.categories",
      dataKey: "catalog.service_categories",
      parameters: { limit: 16 },
    },
  ],
  actions: [
    { id: "action.location", actionKey: "location.open_picker" },
    { id: "action.search", actionKey: "search.submit" },
    { id: "action.open-category", actionKey: "service.open_category" },
    { id: "action.open-services", actionKey: "service.open_all" },
    { id: "action.home", actionKey: "navigation.open_home" },
    { id: "action.support", actionKey: "navigation.open_support" },
    { id: "action.orders", actionKey: "navigation.open_orders" },
    { id: "action.profile", actionKey: "navigation.open_profile" },
    { id: "action.demand", actionKey: "demand.open_create" },
  ],
  effectiveAt: "2026-07-23T00:00:00.000Z",
  expiresAt: null,
  publishedAt: "2026-07-22T00:00:00.000Z",
  fallbackPolicy: {
    strategy: "last_known_good_then_builtin",
    builtinManifestId: "customer.home.builtin",
    maximumStaleSeconds: 86_400,
  },
};

const SimpleComponent = ({ instance }: HomeComponentRuntimeProps) => (
  <section>{instance.id}</section>
);

function definition<TType extends CustomerSduiComponentType>(
  value: HomeComponentDefinition<TType>,
): HomeComponentDefinition<TType> {
  return value;
}

function makeComponentRegistry(
  serviceComponent: HomeComponentDefinition<"service_grid">["component"] = SimpleComponent,
): HomeComponentRegistry {
  return new HomeComponentRegistry()
    .register(definition({
      type: "location_header",
      region: "header",
      supportedContractVersions: ["1.0"],
      dataSlots: [{ slot: "location", dataKeys: ["customer.current_location"], required: true }],
      actionSlots: [{ slot: "location", actionKeys: ["location.open_picker"], required: true }],
      component: SimpleComponent,
    }))
    .register(definition({
      type: "search_bar",
      region: "header",
      supportedContractVersions: ["1.0"],
      dataSlots: [],
      actionSlots: [{ slot: "submit", actionKeys: ["search.submit"], required: true }],
      component: SimpleComponent,
    }))
    .register(definition({
      type: "service_grid",
      region: "content",
      supportedContractVersions: ["1.0"],
      dataSlots: [{ slot: "items", dataKeys: ["catalog.service_categories"], required: true }],
      actionSlots: [
        { slot: "item", actionKeys: ["service.open_category"], required: true },
        { slot: "view-all", actionKeys: ["service.open_all"], required: true },
      ],
      component: serviceComponent,
    }))
    .register(definition({
      type: "bottom_navigation",
      region: "footer",
      supportedContractVersions: ["1.0"],
      dataSlots: [],
      actionSlots: [
        { slot: "home", actionKeys: ["navigation.open_home"], required: true },
        { slot: "support", actionKeys: ["navigation.open_support"], required: true },
        { slot: "orders", actionKeys: ["navigation.open_orders"], required: true },
        { slot: "profile", actionKeys: ["navigation.open_profile"], required: true },
        { slot: "demand", actionKeys: ["demand.open_create"], required: true },
      ],
      component: SimpleComponent,
    }))
    .seal();
}

function makeActionRegistry(): HomeActionRegistry {
  return new HomeActionRegistry()
    .register("location.open_picker", vi.fn())
    .register("search.submit", vi.fn())
    .register("service.open_category", vi.fn())
    .register("service.open_all", vi.fn())
    .register("navigation.open_home", vi.fn())
    .register("navigation.open_support", vi.fn())
    .register("navigation.open_orders", vi.fn())
    .register("navigation.open_profile", vi.fn())
    .register("demand.open_create", vi.fn())
    .seal();
}

describe("Customer home composition runtime", () => {
  it("seals bundled component and action allowlists", () => {
    const components = makeComponentRegistry();
    const actions = makeActionRegistry();

    expect(components.list()).toEqual([
      "location_header",
      "search_bar",
      "service_grid",
      "bottom_navigation",
    ]);
    expect(actions.list()).toEqual([
      "location.open_picker",
      "search.submit",
      "service.open_category",
      "service.open_all",
      "navigation.open_home",
      "navigation.open_support",
      "navigation.open_orders",
      "navigation.open_profile",
      "demand.open_create",
    ]);
    expect(() => components.register(definition({
      type: "promotion_banner",
      region: "content",
      supportedContractVersions: ["1.0"],
      dataSlots: [],
      actionSlots: [],
      component: SimpleComponent,
    }))).toThrow(/sealed/);
    expect(() => actions.register("promotion.open", vi.fn())).toThrow(/sealed/);
  });

  it("invokes only the application handler matching the manifest action key", () => {
    const handler = vi.fn();
    const actions = new HomeActionRegistry().register("search.submit", handler).seal();
    const definition = { id: "action.search", actionKey: "search.submit" as const };

    actions.invoke("search.submit", {
      definition,
      sourceComponentId: "home.search",
      payload: { query: "空调清洗" },
    });

    expect(handler).toHaveBeenCalledWith({
      definition,
      sourceComponentId: "home.search",
      payload: { query: "空调清洗" },
    });
    expect(() => actions.invoke("search.submit", {
      definition: { id: "action.location", actionKey: "location.open_picker" },
      sourceComponentId: "home.search",
    })).toThrow(/mismatch/);
  });

  it("builds a deterministic region-ordered render plan", () => {
    expect(customerSduiPageManifestSchema.safeParse(manifest).success).toBe(true);
    const engine = new HomeCompositionEngine(makeComponentRegistry(), makeActionRegistry());
    const result = engine.compose(manifest);

    expect(result.status).toBe("ready");
    expect(result.nodes.map((node) => node.instance.id)).toEqual([
      "home.location",
      "home.search",
      "home.services",
      "home.navigation",
    ]);
    expect(result.nodes[0]?.dataBindings[0]?.source.dataKey).toBe("customer.current_location");
    expect(result.nodes[1]?.actionBindings[0]?.action.actionKey).toBe("search.submit");
  });

  it("degrades an unsupported optional component without taking down the shell", () => {
    const engine = new HomeCompositionEngine(makeComponentRegistry(), makeActionRegistry());
    const withPromotion: CustomerSduiPageManifest = {
      ...manifest,
      components: [
        ...manifest.components.slice(0, 3),
        {
          id: "home.promotion",
          type: "promotion_banner",
          contractVersion: "1.0",
          region: "content",
          order: 1,
          enabled: true,
          props: { title: null, autoplay: false, intervalMs: null },
          dataBindings: [],
          actionBindings: [],
        },
        manifest.components[3]!,
      ],
    };

    const result = engine.compose(withPromotion);

    expect(result.status).toBe("degraded");
    expect(result.nodes).toHaveLength(4);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "component_unregistered", componentId: "home.promotion" }),
    ]));
  });

  it("rejects the page when a protected shell component is unavailable", () => {
    const components = new HomeComponentRegistry()
      .register(definition({
        type: "service_grid",
        region: "content",
        supportedContractVersions: ["1.0"],
        dataSlots: [{ slot: "items", dataKeys: ["catalog.service_categories"], required: true }],
        actionSlots: [
          { slot: "item", actionKeys: ["service.open_category"], required: true },
          { slot: "view-all", actionKeys: ["service.open_all"], required: true },
        ],
        component: SimpleComponent,
      }))
      .seal();
    const result = new HomeCompositionEngine(components, makeActionRegistry()).compose(manifest);

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((item) => item.code === "protected_component_unavailable")).toHaveLength(3);
  });

  it("isolates a crashing component and continues rendering other instances", () => {
    const CrashingServiceGrid = () => {
      throw new Error("service grid render failed");
    };
    const result = new HomeCompositionEngine(
      makeComponentRegistry(CrashingServiceGrid),
      makeActionRegistry(),
    ).compose(manifest);
    const onComponentError = vi.fn();
    const expectedReactError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(<HomeRenderer composition={result} onComponentError={onComponentError} />);

      expect(screen.getByText("home.location")).toBeTruthy();
      expect(screen.getByText("此内容暂时不可用")).toBeTruthy();
      expect(screen.getByText("home.navigation")).toBeTruthy();
      expect(onComponentError).toHaveBeenCalledWith(expect.objectContaining({
        node: expect.objectContaining({ instance: expect.objectContaining({ id: "home.services" }) }),
        error: expect.any(Error),
      }));
    } finally {
      expectedReactError.mockRestore();
    }
  });

  it("exposes the real direct component hosts without adding layout wrappers", () => {
    const result = new HomeCompositionEngine(
      makeComponentRegistry(),
      makeActionRegistry(),
    ).compose(manifest);
    const observeComponent = vi.fn(() => vi.fn());
    const { container } = render(
      <HomeRenderer
        composition={result}
        observeComponent={observeComponent}
      />,
    );
    const root = container.querySelector("[data-customer-sdui-page]");

    expect(root?.children).toHaveLength(result.nodes.length);
    expect(observeComponent).toHaveBeenCalledTimes(result.nodes.length);
    expect(observeComponent.mock.calls[0]?.[0]).toBe(result.nodes[0]);
    expect(observeComponent.mock.calls[0]?.[1]).toBe(root?.children.item(0));
  });

  it("renders an explicit safe fallback for a rejected composition", () => {
    const components = new HomeComponentRegistry().seal();
    const result = new HomeCompositionEngine(components, makeActionRegistry()).compose(manifest);

    render(<HomeRenderer composition={result} />);

    expect(screen.getByRole("alert").textContent).toContain("主页暂时无法加载");
    expect(screen.queryByText("home.services")).toBeNull();
  });
});
