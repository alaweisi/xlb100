import type { CityCode } from "./city.js";

/**
 * Customer SDUI v1 is intentionally closed: a new schema, component, data
 * source, or action must be added to the shared contract before it can be
 * published by the control plane or interpreted by the customer app.
 */
export const CUSTOMER_SDUI_SCHEMA_VERSIONS = ["1.0"] as const;
export type CustomerSduiSchemaVersion = typeof CUSTOMER_SDUI_SCHEMA_VERSIONS[number];

export const CUSTOMER_SDUI_COMPONENT_CONTRACT_VERSIONS = ["1.0"] as const;
export type CustomerSduiComponentContractVersion =
  typeof CUSTOMER_SDUI_COMPONENT_CONTRACT_VERSIONS[number];

export const CUSTOMER_SDUI_PAGE_IDS = ["customer.home"] as const;
export type CustomerSduiPageId = typeof CUSTOMER_SDUI_PAGE_IDS[number];

export const CUSTOMER_SDUI_COMPONENT_TYPES = [
  "location_header",
  "search_bar",
  "service_grid",
  "promotion_banner",
  "recommend_list",
  "worker_nearby",
  "trust_guarantee",
  "bottom_navigation",
] as const;
export type CustomerSduiComponentType = typeof CUSTOMER_SDUI_COMPONENT_TYPES[number];

export const CUSTOMER_SDUI_COMPONENT_REGIONS = ["header", "content", "footer"] as const;
export type CustomerSduiComponentRegion = typeof CUSTOMER_SDUI_COMPONENT_REGIONS[number];

export const CUSTOMER_SDUI_DATA_KEYS = [
  "customer.current_location",
  "customer.notification_summary",
  "catalog.service_categories",
  "catalog.recommended_services",
  "provider.nearby",
  "content.home_promotions",
  "content.trust_guarantees",
] as const;
export type CustomerSduiDataKey = typeof CUSTOMER_SDUI_DATA_KEYS[number];

export const CUSTOMER_SDUI_ACTION_KEYS = [
  "location.open_picker",
  "notification.open_center",
  "search.submit",
  "service.open_category",
  "service.open_detail",
  "service.open_all",
  "promotion.open",
  "provider.open_detail",
  "provider.open_all",
  "demand.open_create",
  "navigation.open_home",
  "navigation.open_support",
  "navigation.open_orders",
  "navigation.open_profile",
] as const;
export type CustomerSduiActionKey = typeof CUSTOMER_SDUI_ACTION_KEYS[number];

export const CUSTOMER_SDUI_GUARANTEE_KEYS = [
  "verified_identity",
  "transparent_pricing",
  "service_tracking",
  "aftersale_guarantee",
] as const;
export type CustomerSduiGuaranteeKey = typeof CUSTOMER_SDUI_GUARANTEE_KEYS[number];

export interface CustomerSduiScope {
  /** null means all business cities; a reserved/global city marker is never valid. */
  cityCodes: CityCode[] | null;
  locales: string[];
  minimumAppVersion: string;
  maximumAppVersion: string | null;
  /** Server-resolved, non-authoritative display cohorts; never authorization claims. */
  audienceTags: string[];
}

export interface CustomerSduiRolloutPolicy {
  /** 10_000 basis points means the entire eligible scope. */
  percentageBasisPoints: number;
  /** Stable, opaque server-side bucketing seed. It is never executable code. */
  bucketSeed: string;
}

export type CustomerSduiNoParameters = Record<string, never>;

interface CustomerSduiDataSourceBase<
  TKey extends CustomerSduiDataKey,
  TParameters extends object,
> {
  id: string;
  dataKey: TKey;
  parameters: TParameters;
}

export type CustomerSduiDataSource =
  | CustomerSduiDataSourceBase<"customer.current_location", CustomerSduiNoParameters>
  | CustomerSduiDataSourceBase<"customer.notification_summary", CustomerSduiNoParameters>
  | CustomerSduiDataSourceBase<
      "catalog.service_categories",
      { limit: 4 | 8 | 12 | 16 }
    >
  | CustomerSduiDataSourceBase<
      "catalog.recommended_services",
      { limit: number; strategy: "default" | "nearby" | "popular" }
    >
  | CustomerSduiDataSourceBase<
      "provider.nearby",
      { limit: number; radiusMeters: number }
    >
  | CustomerSduiDataSourceBase<
      "content.home_promotions",
      { limit: number; placement: "home" }
    >
  | CustomerSduiDataSourceBase<"content.trust_guarantees", CustomerSduiNoParameters>;

export interface CustomerSduiActionDefinition {
  id: string;
  /** Application-owned handler key. Manifest actions never contain code or URLs. */
  actionKey: CustomerSduiActionKey;
}

export interface CustomerSduiDataBinding {
  slot: string;
  dataRef: string;
  required: boolean;
}

export interface CustomerSduiActionBinding {
  slot: string;
  actionRef: string;
}

interface CustomerSduiComponentBase<
  TType extends CustomerSduiComponentType,
  TRegion extends CustomerSduiComponentRegion,
  TProps extends object,
> {
  id: string;
  type: TType;
  contractVersion: CustomerSduiComponentContractVersion;
  region: TRegion;
  order: number;
  enabled: boolean;
  props: TProps;
  dataBindings: CustomerSduiDataBinding[];
  actionBindings: CustomerSduiActionBinding[];
}

export type CustomerSduiComponentInstance =
  | CustomerSduiComponentBase<
      "location_header",
      "header",
      { subtitle: string | null; showNotifications: boolean }
    >
  | CustomerSduiComponentBase<
      "search_bar",
      "header",
      { placeholder: string; accessibleLabel: string }
    >
  | CustomerSduiComponentBase<
      "service_grid",
      "content",
      { title: string; columns: 4; maxItems: 4 | 8 | 12 | 16; showViewAll: boolean }
    >
  | CustomerSduiComponentBase<
      "promotion_banner",
      "content",
      { title: string | null; autoplay: boolean; intervalMs: number | null }
    >
  | CustomerSduiComponentBase<
      "recommend_list",
      "content",
      { title: string; maxItems: number; cardDensity: "comfortable" | "compact" }
    >
  | CustomerSduiComponentBase<
      "worker_nearby",
      "content",
      { title: string; maxItems: number; showDistance: boolean; showVerification: boolean }
    >
  | CustomerSduiComponentBase<
      "trust_guarantee",
      "content",
      { itemKeys: CustomerSduiGuaranteeKey[] }
    >
  | CustomerSduiComponentBase<
      "bottom_navigation",
      "footer",
      { activeItem: "home"; showDemandAction: boolean }
    >;

export interface CustomerSduiFallbackPolicy {
  strategy: "last_known_good_then_builtin";
  builtinManifestId: "customer.home.builtin";
  maximumStaleSeconds: number;
}

/** Author-controlled content. Release metadata is deliberately server-owned. */
export interface CustomerSduiManifestDefinition {
  schemaVersion: CustomerSduiSchemaVersion;
  componentContractVersion: CustomerSduiComponentContractVersion;
  manifestId: string;
  pageId: CustomerSduiPageId;
  components: CustomerSduiComponentInstance[];
  dataSources: CustomerSduiDataSource[];
  actions: CustomerSduiActionDefinition[];
  fallbackPolicy: CustomerSduiFallbackPolicy;
}

export interface CustomerSduiPageManifest extends CustomerSduiManifestDefinition {
  revision: string;
  contentHashSha256: string;
  scope: CustomerSduiScope;
  rollout: CustomerSduiRolloutPolicy;
  effectiveAt: string;
  expiresAt: string | null;
  publishedAt: string;
}

export const CUSTOMER_SDUI_RESOLUTION_REASONS = [
  "published",
  "no_eligible_manifest",
  "kill_switch",
  "unsupported_client",
  "upstream_unavailable",
] as const;
export type CustomerSduiResolutionReason = typeof CUSTOMER_SDUI_RESOLUTION_REASONS[number];

export interface CustomerSduiManifestEnvelope {
  schemaVersion: CustomerSduiSchemaVersion;
  requestId: string;
  pageId: CustomerSduiPageId;
  resolvedAt: string;
  scopeProof: string;
  resolutionReason: CustomerSduiResolutionReason;
  killSwitchActive: boolean;
  cacheTtlSeconds: number;
  manifest: CustomerSduiPageManifest | null;
  fallbackPolicy: CustomerSduiFallbackPolicy;
}

export const CUSTOMER_SDUI_REVISION_STATUSES = [
  "draft",
  "reviewed",
  "published",
  "retired",
] as const;
export type CustomerSduiRevisionStatus = typeof CUSTOMER_SDUI_REVISION_STATUSES[number];

export interface CustomerSduiRevisionAuditMetadata {
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  retiredBy: string | null;
  retiredAt: string | null;
  retirementReason: string | null;
}

/** Server-owned control-plane representation used by every SDUI admin endpoint. */
export interface CustomerSduiRevision {
  revisionId: string;
  pageId: CustomerSduiPageId;
  version: number;
  status: CustomerSduiRevisionStatus;
  definition: CustomerSduiManifestDefinition;
  publication: {
    scope: CustomerSduiScope;
    rollout: CustomerSduiRolloutPolicy;
    effectiveAt: string;
    expiresAt: string | null;
  } | null;
  audit: CustomerSduiRevisionAuditMetadata;
}

export interface CustomerSduiMutationMetadata {
  idempotencyKey: string;
}

export interface CreateCustomerSduiDraftRequest extends CustomerSduiMutationMetadata {
  definition: CustomerSduiManifestDefinition;
}

export interface UpdateCustomerSduiDraftRequest extends CustomerSduiMutationMetadata {
  expectedVersion: number;
  definition: CustomerSduiManifestDefinition;
}

export interface ReviewCustomerSduiRevisionRequest extends CustomerSduiMutationMetadata {
  expectedVersion: number;
  reviewNote: string;
}

export interface PublishCustomerSduiRevisionRequest extends CustomerSduiMutationMetadata {
  expectedVersion: number;
  scope: CustomerSduiScope;
  rollout: CustomerSduiRolloutPolicy;
  effectiveAt: string;
  expiresAt: string | null;
}

export interface UnpublishCustomerSduiRevisionRequest extends CustomerSduiMutationMetadata {
  expectedVersion: number;
  reason: string;
}

export interface RollbackCustomerSduiRevisionRequest extends CustomerSduiMutationMetadata {
  expectedVersion: number;
  targetRevisionId: string;
  reason: string;
}

export interface SetCustomerSduiKillSwitchRequest extends CustomerSduiMutationMetadata {
  expectedVersion: number;
  enabled: boolean;
  reason: string;
}

export interface CustomerSduiKillSwitchState {
  pageId: CustomerSduiPageId;
  version: number;
  enabled: boolean;
  reason: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface CustomerSduiRevisionEnvelope {
  requestId: string;
  idempotentReplay: boolean;
  revision: CustomerSduiRevision;
}

export interface CustomerSduiKillSwitchEnvelope {
  requestId: string;
  idempotentReplay: boolean;
  killSwitch: CustomerSduiKillSwitchState;
}
