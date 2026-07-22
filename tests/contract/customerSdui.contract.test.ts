import { describe, expect, it } from "vitest";
import {
  createCustomerSduiDraftRequestSchema,
  customerSduiManifestEnvelopeSchema,
  customerSduiPageManifestSchema,
  customerSduiRevisionSchema,
  publishCustomerSduiRevisionRequestSchema,
  rollbackCustomerSduiRevisionRequestSchema,
  setCustomerSduiKillSwitchRequestSchema,
  updateCustomerSduiDraftRequestSchema,
} from "@xlb/validators";
import type {
  CustomerSduiManifestDefinition,
  CustomerSduiManifestEnvelope,
  CustomerSduiPageManifest,
  CustomerSduiRevision,
} from "@xlb/types";

const fallbackPolicy = {
  strategy: "last_known_good_then_builtin" as const,
  builtinManifestId: "customer.home.builtin" as const,
  maximumStaleSeconds: 86_400,
};

function validManifest(): CustomerSduiPageManifest {
  return {
    schemaVersion: "1.0",
    componentContractVersion: "1.0",
    manifestId: "customer.home.primary",
    pageId: "customer.home",
    revision: "home:2026-07-23:1",
    contentHashSha256: "a".repeat(64),
    scope: {
      cityCodes: ["hangzhou"],
      locales: ["zh-CN"],
      minimumAppVersion: "1.0.0",
      maximumAppVersion: null,
      audienceTags: [],
    },
    rollout: {
      percentageBasisPoints: 10_000,
      bucketSeed: "customer.home.v1",
    },
    dataSources: [
      {
        id: "current-location",
        dataKey: "customer.current_location",
        parameters: {},
      },
      {
        id: "notification-summary",
        dataKey: "customer.notification_summary",
        parameters: {},
      },
      {
        id: "service-categories",
        dataKey: "catalog.service_categories",
        parameters: { limit: 16 },
      },
    ],
    actions: [
      { id: "choose-location", actionKey: "location.open_picker" },
      { id: "open-notifications", actionKey: "notification.open_center" },
      { id: "submit-search", actionKey: "search.submit" },
      { id: "open-category", actionKey: "service.open_category" },
      { id: "open-services", actionKey: "service.open_all" },
      { id: "open-home", actionKey: "navigation.open_home" },
      { id: "open-support", actionKey: "navigation.open_support" },
      { id: "open-orders", actionKey: "navigation.open_orders" },
      { id: "open-profile", actionKey: "navigation.open_profile" },
      { id: "open-demand", actionKey: "demand.open_create" },
    ],
    components: [
      {
        id: "home-location",
        type: "location_header",
        contractVersion: "1.0",
        region: "header",
        order: 0,
        enabled: true,
        props: { subtitle: "安心到家，服务就在身边", showNotifications: true },
        dataBindings: [
          { slot: "location", dataRef: "current-location", required: true },
          { slot: "notifications", dataRef: "notification-summary", required: false },
        ],
        actionBindings: [
          { slot: "location", actionRef: "choose-location" },
          { slot: "notification", actionRef: "open-notifications" },
        ],
      },
      {
        id: "home-search",
        type: "search_bar",
        contractVersion: "1.0",
        region: "header",
        order: 1,
        enabled: true,
        props: { placeholder: "搜索全部上门服务", accessibleLabel: "搜索上门服务" },
        dataBindings: [],
        actionBindings: [{ slot: "submit", actionRef: "submit-search" }],
      },
      {
        id: "home-service-grid",
        type: "service_grid",
        contractVersion: "1.0",
        region: "content",
        order: 0,
        enabled: true,
        props: { title: "全部服务", columns: 4, maxItems: 16, showViewAll: true },
        dataBindings: [{ slot: "items", dataRef: "service-categories", required: true }],
        actionBindings: [
          { slot: "item", actionRef: "open-category" },
          { slot: "view-all", actionRef: "open-services" },
        ],
      },
      {
        id: "home-bottom-navigation",
        type: "bottom_navigation",
        contractVersion: "1.0",
        region: "footer",
        order: 0,
        enabled: true,
        props: { activeItem: "home", showDemandAction: true },
        dataBindings: [],
        actionBindings: [
          { slot: "home", actionRef: "open-home" },
          { slot: "support", actionRef: "open-support" },
          { slot: "orders", actionRef: "open-orders" },
          { slot: "profile", actionRef: "open-profile" },
          { slot: "demand", actionRef: "open-demand" },
        ],
      },
    ],
    effectiveAt: "2026-07-23T02:00:00.000Z",
    expiresAt: "2026-08-23T02:00:00.000Z",
    publishedAt: "2026-07-23T01:55:00.000Z",
    fallbackPolicy,
  };
}

function validEnvelope(): CustomerSduiManifestEnvelope {
  return {
    schemaVersion: "1.0",
    requestId: "00000000-0000-4000-8000-000000000001",
    pageId: "customer.home",
    resolvedAt: "2026-07-23T02:00:00.000Z",
    scopeProof: "customer.home:hangzhou:zh-CN:1.0.0",
    resolutionReason: "published",
    killSwitchActive: false,
    cacheTtlSeconds: 300,
    manifest: validManifest(),
    fallbackPolicy,
  };
}

function validDefinition(): CustomerSduiManifestDefinition {
  const {
    revision: _revision,
    contentHashSha256: _contentHashSha256,
    scope: _scope,
    rollout: _rollout,
    effectiveAt: _effectiveAt,
    expiresAt: _expiresAt,
    publishedAt: _publishedAt,
    ...definition
  } = validManifest();
  return definition;
}

function validPublishedRevision(): CustomerSduiRevision {
  return {
    revisionId: "customer.home.revision-1",
    pageId: "customer.home",
    version: 3,
    status: "published",
    definition: validDefinition(),
    publication: {
      scope: validManifest().scope,
      rollout: validManifest().rollout,
      effectiveAt: "2026-07-23T02:00:00.000Z",
      expiresAt: "2026-08-23T02:00:00.000Z",
    },
    audit: {
      createdBy: "operator-author",
      createdAt: "2026-07-23T01:00:00.000Z",
      updatedBy: "operator-publisher",
      updatedAt: "2026-07-23T01:55:00.000Z",
      reviewedBy: "operator-reviewer",
      reviewedAt: "2026-07-23T01:30:00.000Z",
      reviewNote: "approved for release",
      publishedBy: "operator-publisher",
      publishedAt: "2026-07-23T01:55:00.000Z",
      retiredBy: null,
      retiredAt: null,
      retirementReason: null,
    },
  };
}

describe("Customer Hybrid SDUI shared contract", () => {
  it("accepts the strict v1 home manifest and delivery envelope", () => {
    expect(customerSduiPageManifestSchema.safeParse(validManifest()).success).toBe(true);
    expect(customerSduiManifestEnvelopeSchema.safeParse(validEnvelope()).success).toBe(true);
  });

  it("rejects unknown components, arbitrary actions, remote URLs, and extra props", () => {
    const unknownComponent = validManifest();
    expect(customerSduiPageManifestSchema.safeParse({
      ...unknownComponent,
      components: [
        ...unknownComponent.components,
        {
          id: "remote-code",
          type: "remote_javascript",
          contractVersion: "1.0",
          region: "content",
          order: 9,
          enabled: true,
          props: { src: "https://evil.example/component.js" },
          dataBindings: [],
          actionBindings: [],
        },
      ],
    }).success).toBe(false);

    expect(customerSduiPageManifestSchema.safeParse({
      ...validManifest(),
      actions: [{ id: "redirect", actionKey: "https://evil.example/redirect" }],
    }).success).toBe(false);

    const extraProps = validManifest();
    expect(customerSduiPageManifestSchema.safeParse({
      ...extraProps,
      components: extraProps.components.map((component) => component.type === "search_bar"
        ? { ...component, props: { ...component.props, script: "alert(1)" } }
        : component),
    }).success).toBe(false);
  });

  it("requires unique identities, stable region ordering, and resolvable bindings", () => {
    const duplicateIds = validManifest();
    duplicateIds.dataSources.push({
      id: "current-location",
      dataKey: "customer.notification_summary",
      parameters: {},
    });
    expect(customerSduiPageManifestSchema.safeParse(duplicateIds).success).toBe(false);

    const duplicateOrder = validManifest();
    duplicateOrder.components[1]!.order = 0;
    expect(customerSduiPageManifestSchema.safeParse(duplicateOrder).success).toBe(false);

    const unresolvedReference = validManifest();
    unresolvedReference.components[2]!.dataBindings[0]!.dataRef = "missing-source";
    expect(customerSduiPageManifestSchema.safeParse(unresolvedReference).success).toBe(false);

    const unresolvedAction = validManifest();
    unresolvedAction.components[2]!.actionBindings[0]!.actionRef = "missing-action";
    expect(customerSduiPageManifestSchema.safeParse(unresolvedAction).success).toBe(false);

    const wrongDataSlotContract = validManifest();
    wrongDataSlotContract.components[2]!.dataBindings[0]!.dataRef = "current-location";
    expect(customerSduiPageManifestSchema.safeParse(wrongDataSlotContract).success).toBe(false);

    const wrongActionSlotContract = validManifest();
    wrongActionSlotContract.components[1]!.actionBindings[0]!.actionRef = "choose-location";
    expect(customerSduiPageManifestSchema.safeParse(wrongActionSlotContract).success).toBe(false);
  });

  it("protects the home shell while allowing content components to be composed", () => {
    const disabledNavigation = validManifest();
    disabledNavigation.components[3]!.enabled = false;
    expect(customerSduiPageManifestSchema.safeParse(disabledNavigation).success).toBe(false);

    const missingSearch = validManifest();
    missingSearch.components = missingSearch.components.filter((component) => component.type !== "search_bar");
    expect(customerSduiPageManifestSchema.safeParse(missingSearch).success).toBe(false);

    const invalidRegion = validManifest();
    expect(customerSduiPageManifestSchema.safeParse({
      ...invalidRegion,
      components: invalidRegion.components.map((component) => component.type === "service_grid"
        ? { ...component, region: "footer" }
        : component),
    }).success).toBe(false);

    const composable = validManifest();
    composable.dataSources.push({
      id: "promotions",
      dataKey: "content.home_promotions",
      parameters: { limit: 3, placement: "home" },
    });
    composable.actions.push({ id: "open-promotion", actionKey: "promotion.open" });
    composable.components.push({
      id: "home-promotions",
      type: "promotion_banner",
      contractVersion: "1.0",
      region: "content",
      order: 1,
      enabled: true,
      props: { title: null, autoplay: true, intervalMs: 5_000 },
      dataBindings: [{ slot: "items", dataRef: "promotions", required: false }],
      actionBindings: [{ slot: "item", actionRef: "open-promotion" }],
    });
    expect(customerSduiPageManifestSchema.safeParse(composable).success).toBe(true);
  });

  it("rejects incompatible versions, invalid scope, and impossible publication windows", () => {
    expect(customerSduiPageManifestSchema.safeParse({
      ...validManifest(),
      schemaVersion: "2.0",
    }).success).toBe(false);

    const invalidScope = validManifest();
    invalidScope.scope.maximumAppVersion = "0.9.0";
    expect(customerSduiPageManifestSchema.safeParse(invalidScope).success).toBe(false);

    const duplicateCity = validManifest();
    duplicateCity.scope.cityCodes = ["hangzhou", "hangzhou"];
    expect(customerSduiPageManifestSchema.safeParse(duplicateCity).success).toBe(false);

    expect(customerSduiPageManifestSchema.safeParse({
      ...validManifest(),
      rollout: { percentageBasisPoints: 0, bucketSeed: "customer.home.v1" },
    }).success).toBe(false);

    const invalidWindow = validManifest();
    invalidWindow.publishedAt = "2026-07-24T02:00:00.000Z";
    expect(customerSduiPageManifestSchema.safeParse(invalidWindow).success).toBe(false);
  });

  it("requires clean fallback envelopes and a zero-TTL kill switch", () => {
    const killSwitch: CustomerSduiManifestEnvelope = {
      ...validEnvelope(),
      resolutionReason: "kill_switch",
      killSwitchActive: true,
      cacheTtlSeconds: 0,
      manifest: null,
    };
    expect(customerSduiManifestEnvelopeSchema.safeParse(killSwitch).success).toBe(true);

    expect(customerSduiManifestEnvelopeSchema.safeParse({
      ...killSwitch,
      cacheTtlSeconds: 300,
    }).success).toBe(false);
    expect(customerSduiManifestEnvelopeSchema.safeParse({
      ...validEnvelope(),
      resolutionReason: "upstream_unavailable",
    }).success).toBe(false);
    expect(customerSduiManifestEnvelopeSchema.safeParse({
      ...validEnvelope(),
      fallbackPolicy: { ...fallbackPolicy, maximumStaleSeconds: 0 },
    }).success).toBe(false);
  });

  it("defines one strict CAS and idempotency contract for control-plane mutations", () => {
    const definition = validDefinition();
    expect(createCustomerSduiDraftRequestSchema.safeParse({
      definition,
      idempotencyKey: "create-home-draft-1",
    }).success).toBe(true);
    expect(updateCustomerSduiDraftRequestSchema.safeParse({
      expectedVersion: 1,
      definition,
      idempotencyKey: "update-home-draft-1",
    }).success).toBe(true);
    expect(publishCustomerSduiRevisionRequestSchema.safeParse({
      expectedVersion: 2,
      scope: validManifest().scope,
      rollout: { percentageBasisPoints: 1_000, bucketSeed: "canary-hangzhou" },
      effectiveAt: "2026-07-24T00:00:00.000Z",
      expiresAt: "2026-08-24T00:00:00.000Z",
      idempotencyKey: "publish-home-revision-1",
    }).success).toBe(true);
    expect(rollbackCustomerSduiRevisionRequestSchema.safeParse({
      expectedVersion: 4,
      targetRevisionId: "customer.home.revision-1",
      reason: "restore known good revision",
      idempotencyKey: "rollback-home-revision-1",
    }).success).toBe(true);
    expect(setCustomerSduiKillSwitchRequestSchema.safeParse({
      expectedVersion: 1,
      enabled: true,
      reason: "invalid upstream manifest",
      idempotencyKey: "kill-home-manifest-1",
    }).success).toBe(true);

    expect(updateCustomerSduiDraftRequestSchema.safeParse({
      expectedVersion: 0,
      definition,
      idempotencyKey: "short",
    }).success).toBe(false);
    expect(publishCustomerSduiRevisionRequestSchema.safeParse({
      expectedVersion: 2,
      scope: validManifest().scope,
      rollout: { percentageBasisPoints: 0, bucketSeed: "invalid-canary" },
      effectiveAt: "2026-08-24T00:00:00.000Z",
      expiresAt: "2026-07-24T00:00:00.000Z",
      idempotencyKey: "publish-home-invalid-1",
    }).success).toBe(false);
  });

  it("keeps revision lifecycle evidence internally consistent", () => {
    expect(customerSduiRevisionSchema.safeParse(validPublishedRevision()).success).toBe(true);
    expect(customerSduiRevisionSchema.safeParse({
      ...validPublishedRevision(),
      status: "draft",
    }).success).toBe(false);
    const selfReviewed = validPublishedRevision();
    selfReviewed.audit.reviewedBy = selfReviewed.audit.createdBy;
    expect(customerSduiRevisionSchema.safeParse(selfReviewed).success).toBe(false);

    const strayRetirementReason = validPublishedRevision();
    strayRetirementReason.audit.retirementReason = "should not exist on a published revision";
    expect(customerSduiRevisionSchema.safeParse(strayRetirementReason).success).toBe(false);
  });
});
