import type { CustomerSduiPageManifest } from "@xlb/types";
import { customerSduiPageManifestSchema } from "@xlb/validators";

const BUILTIN_HOME_MANIFEST: CustomerSduiPageManifest = {
  schemaVersion: "1.0",
  componentContractVersion: "1.0",
  manifestId: "customer.home.builtin",
  pageId: "customer.home",
  revision: "builtin-1",
  contentHashSha256: "0".repeat(64),
  scope: {
    cityCodes: null,
    locales: ["zh-CN"],
    minimumAppVersion: "0.0.0",
    maximumAppVersion: null,
    audienceTags: [],
  },
  rollout: {
    percentageBasisPoints: 10_000,
    bucketSeed: "customer-home-builtin",
  },
  components: [
    {
      id: "builtin.location",
      type: "location_header",
      contractVersion: "1.0",
      region: "header",
      order: 0,
      enabled: true,
      props: { subtitle: "安心到家，服务就在身边", showNotifications: false },
      dataBindings: [{ slot: "location", dataRef: "builtin.location", required: true }],
      actionBindings: [{ slot: "location", actionRef: "builtin.location.open" }],
    },
    {
      id: "builtin.search",
      type: "search_bar",
      contractVersion: "1.0",
      region: "header",
      order: 1,
      enabled: true,
      props: {
        placeholder: "搜索全部上门服务",
        accessibleLabel: "搜索全部上门服务",
      },
      dataBindings: [],
      actionBindings: [{ slot: "submit", actionRef: "builtin.search.submit" }],
    },
    {
      id: "builtin.services",
      type: "service_grid",
      contractVersion: "1.0",
      region: "content",
      order: 0,
      enabled: true,
      props: { title: "全部服务", columns: 4, maxItems: 16, showViewAll: true },
      dataBindings: [{ slot: "items", dataRef: "builtin.categories", required: true }],
      actionBindings: [
        { slot: "item", actionRef: "builtin.category.open" },
        { slot: "view-all", actionRef: "builtin.services.open" },
      ],
    },
    {
      id: "builtin.navigation",
      type: "bottom_navigation",
      contractVersion: "1.0",
      region: "footer",
      order: 0,
      enabled: true,
      props: { activeItem: "home", showDemandAction: true },
      dataBindings: [],
      actionBindings: [
        { slot: "home", actionRef: "builtin.navigation.home" },
        { slot: "support", actionRef: "builtin.navigation.support" },
        { slot: "orders", actionRef: "builtin.navigation.orders" },
        { slot: "profile", actionRef: "builtin.navigation.profile" },
        { slot: "demand", actionRef: "builtin.demand.open" },
      ],
    },
  ],
  dataSources: [
    {
      id: "builtin.location",
      dataKey: "customer.current_location",
      parameters: {},
    },
    {
      id: "builtin.categories",
      dataKey: "catalog.service_categories",
      parameters: { limit: 16 },
    },
  ],
  actions: [
    { id: "builtin.location.open", actionKey: "location.open_picker" },
    { id: "builtin.search.submit", actionKey: "search.submit" },
    { id: "builtin.category.open", actionKey: "service.open_category" },
    { id: "builtin.services.open", actionKey: "service.open_all" },
    { id: "builtin.navigation.home", actionKey: "navigation.open_home" },
    { id: "builtin.navigation.support", actionKey: "navigation.open_support" },
    { id: "builtin.navigation.orders", actionKey: "navigation.open_orders" },
    { id: "builtin.navigation.profile", actionKey: "navigation.open_profile" },
    { id: "builtin.demand.open", actionKey: "demand.open_create" },
  ],
  fallbackPolicy: {
    strategy: "last_known_good_then_builtin",
    builtinManifestId: "customer.home.builtin",
    maximumStaleSeconds: 86_400,
  },
  effectiveAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  publishedAt: "2026-01-01T00:00:00.000Z",
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

const parsedBuiltinManifest = deepFreeze(
  customerSduiPageManifestSchema.parse(BUILTIN_HOME_MANIFEST),
);

export function getBuiltinHomeManifest(): CustomerSduiPageManifest {
  return parsedBuiltinManifest;
}
