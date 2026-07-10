import type {
  CityCode,
  WorkflowActionContract,
  WorkflowDisabledReason,
  WorkflowUiBinding,
  WorkflowRuntimeThemeTokens,
} from "@xlb/types";

export type CustomerWorkflowRoute = "home" | "services" | "createOrder" | "orders" | "profile";

type CustomerBindingInput = {
  route: CustomerWorkflowRoute;
  cityCode: CityCode;
  selectedSkuId?: string;
  quoteReady?: boolean;
  submitting?: boolean;
  hasOrderIds?: boolean;
};

const defaultThemeTokens: WorkflowRuntimeThemeTokens = {
  activeThemeId: "customer-default",
  source: "localFallback",
  affects: "visual-only",
  tokenRefs: [
    "role.customer.accent",
    "semantic.color.bgSurface",
    "semantic.color.fgPrimary",
    "component.card",
    "component.button",
  ],
};

const routePath: Record<CustomerWorkflowRoute, string> = {
  home: "/customer/",
  services: "/customer/services",
  createOrder: "/customer/order/create",
  orders: "/customer/orders",
  profile: "/customer/profile",
};

function createAction(
  actionId: string,
  label: string,
  source: WorkflowActionContract["source"],
  options: {
    enabled?: boolean;
    disabledReasonCode?: WorkflowDisabledReason;
    endpoint?: string;
    method?: WorkflowActionContract["method"];
    danger?: boolean;
    confirmRequired?: boolean;
    idempotencyRequired?: boolean;
    auditRequired?: boolean;
    cityScopeRequired?: boolean;
  } = {},
): WorkflowActionContract {
  const enabled = options.enabled ?? true;
  return {
    actionId,
    label,
    enabled,
    disabledReasonCode: enabled ? null : options.disabledReasonCode ?? "STATE_NOT_ACTIONABLE",
    source,
    danger: options.danger ?? false,
    confirmRequired: options.confirmRequired ?? false,
    idempotencyRequired: options.idempotencyRequired ?? false,
    auditRequired: options.auditRequired ?? false,
    cityScopeRequired: options.cityScopeRequired ?? true,
    endpoint: options.endpoint,
    method: options.method,
  };
}

export const customerWorkflowActions = {
  retryCatalog: () => createAction("customer.catalog.retry", "Retry catalog", "api-derived", {
    endpoint: "/api/catalog",
    method: "GET",
  }),
  openServices: () => createAction("customer.services.open", "Open services", "api-derived"),
  selectService: (skuId: string) =>
    createAction("customer.catalog.selectSku", "Select service", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: "STATE_NOT_ACTIONABLE",
      endpoint: "/customer/order/create",
      method: "GET",
    }),
  retryQuote: (skuId?: string) =>
    createAction("customer.pricing.retryQuote", "Retry quote", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: skuId ? undefined : "API_NOT_AVAILABLE",
      endpoint: "/api/pricing/quote?skuId=:skuId",
      method: "GET",
    }),
  submitOrder: (quoteReady: boolean, selectedSkuId: boolean, submitting: boolean) =>
    createAction("customer.order.submit", submitting ? "Submitting..." : "Submit order", "backend", {
      enabled: quoteReady && selectedSkuId && !submitting,
      disabledReasonCode: quoteReady && selectedSkuId && !submitting ? undefined : "STATE_NOT_ACTIONABLE",
      endpoint: "/api/orders",
      method: "POST",
      idempotencyRequired: true,
    }),
  viewOrders: () => createAction("customer.orders.open", "Open orders", "api-derived", {
    endpoint: "/customer/orders",
    method: "GET",
  }),
  retryOrderDetails: (hasOrderIds: boolean) =>
    createAction("customer.orders.retryDetails", "Reload order detail", "api-derived", {
      enabled: hasOrderIds,
      disabledReasonCode: hasOrderIds ? undefined : "WORKFLOW_NOT_IMPLEMENTED",
      endpoint: "/api/orders/:orderId",
      method: "GET",
    }),
  loadProfile: () => createAction("customer.profile.load", "Load profile", "api-derived", { endpoint: "/api/customer/profile", method: "GET" }),
  saveProfile: () => createAction("customer.profile.save", "Save profile", "backend", { endpoint: "/api/customer/profile", method: "POST" }),
  listAddresses: () => createAction("customer.address.list", "Load addresses", "api-derived", { endpoint: "/api/customer/addresses", method: "GET" }),
  saveAddress: () => createAction("customer.address.save", "Save address", "backend", { endpoint: "/api/customer/addresses", method: "POST" }),
};

function getWorkflowRuntimeTokens() {
  return {
    ...defaultThemeTokens,
    tokenRefs: [...defaultThemeTokens.tokenRefs],
  };
}

function disabledReasonsFromActions(actions: WorkflowActionContract[]): WorkflowUiBinding["disabledReasons"] {
  const reasons = new Set<WorkflowDisabledReason>();
  for (const action of actions) {
    if (action.disabledReasonCode) {
      reasons.add(action.disabledReasonCode);
    }
  }
  return [...reasons];
}

function makeNotWiredPolicy(code: WorkflowDisabledReason, allowedActions: WorkflowActionContract[]): WorkflowUiBinding["notWiredPolicy"] {
  return {
    reasonCode: code,
    userCopy: "Backend workflow data is not fully wired yet.",
    allowedUi: "read-only-shell",
    forbiddenClaims: [
      "show fabricated order list",
      "show fake payment success",
      "show fake dispatch result",
    ],
    allowedActions,
  };
}

function createBaseBinding(route: CustomerWorkflowRoute): WorkflowUiBinding {
  return {
    workflowName: "customer.home",
    actor: "customer",
    route: routePath[route],
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md"],
      endpoints: [],
      status: "not-wired",
    },
    state: {
      stateId: "not-started",
      label: "Customer route waiting for backend facts",
      source: "api-contract",
      customerAnswer: {
        currentStep: "Load API facts for the current route",
        nextAvailableStep: "Show service list and order flow",
      },
    },
    availableActions: [],
    disabledReasons: [],
    customerFacingCopy: {
      title: "Customer route",
      body: "Customer service workflow page",
      primaryCta: "Continue",
    },
    uiSlots: ["pageHero", "summaryCard", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "partial",
      frameName: "Customer / Route",
      notes: "placeholder",
    },
    packagesUiComponents: [],
    runtimeThemeTokens: getWorkflowRuntimeTokens(),
  };
}

function withRouteMeta(binding: WorkflowUiBinding, patch: Partial<WorkflowUiBinding>): WorkflowUiBinding {
  const baseFacingCopy = binding.customerFacingCopy ?? {
    title: "Customer route",
  };

  return {
    ...binding,
    ...patch,
    customerFacingCopy: {
      ...baseFacingCopy,
      ...patch.customerFacingCopy,
    },
    runtimeThemeTokens: getWorkflowRuntimeTokens(),
  };
}

function buildHomeBinding(cityCode: CityCode): WorkflowUiBinding {
  const actions = [customerWorkflowActions.openServices(), customerWorkflowActions.retryCatalog()];
  const stateLabel = "Browse city services";
  const base = createBaseBinding("home");
  return withRouteMeta(base, {
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_CATALOG.md"],
      endpoints: ["GET /api/catalog"],
      status: "wired",
    },
    state: {
      ...base.state,
      stateId: "catalog.ready",
      label: stateLabel,
      source: "api-contract",
      customerAnswer: {
        currentStep: `Showing catalog flow for ${cityCode}`,
        nextAvailableStep: "Select a service to create an order",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "Service discovery",
      body: `Browse services in ${cityCode}.`,
    },
    uiSlots: ["pageHero", "summaryCard", "primaryActionDock", "emptyState", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "partial",
      frameName: "Customer / Home / Search & Discovery",
    },
    packagesUiComponents: ["RuntimeThemeSurface", "LocationSearchBar", "ServiceCard", "ActionDock", "CustomerAnswerCard"],
  });
}

function buildServicesBinding(cityCode: CityCode): WorkflowUiBinding {
  const actions = [customerWorkflowActions.retryCatalog()];
  const base = createBaseBinding("services");
  return withRouteMeta(base, {
    workflowName: "customer.catalog.browsing",
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_CATALOG.md"],
      endpoints: ["GET /api/catalog"],
      status: "wired",
    },
    state: {
      ...base.state,
      stateId: "services.filtering",
      label: "Select from catalog",
      source: "frontend-derived-from-api",
      customerAnswer: {
        currentStep: `Filter services for ${cityCode}`,
        nextAvailableStep: "Pick a service SKU",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "Select a service",
    },
    uiSlots: ["summaryCard", "primaryActionDock", "emptyState", "apiError", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "partial",
      frameName: "Customer / Services / Service List",
    },
    packagesUiComponents: ["SearchBar", "Tabs", "ServiceCard", "ActionDock", "CustomerAnswerCard"],
  });
}

function buildCreateOrderBinding(input: CustomerBindingInput): WorkflowUiBinding {
  const submitAction = customerWorkflowActions.submitOrder(Boolean(input.quoteReady), Boolean(input.selectedSkuId), Boolean(input.submitting));
  const quoteAction = customerWorkflowActions.retryQuote(input.selectedSkuId);
  const actions = [quoteAction, submitAction, customerWorkflowActions.viewOrders()];
  const base = createBaseBinding("createOrder");
  const stateLabel = submitAction.enabled ? "Ready to create order" : "Waiting for quote";

  return withRouteMeta(base, {
    workflowName: "customer.order.create",
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_PRICING.md", "docs/contracts/CONTRACT_ORDER.md", "docs/contracts/CONTRACT_PAYMENT.md"],
      endpoints: ["GET /api/pricing/quote?skuId", "POST /api/orders", "POST /api/payments/orders", "GET /api/orders/:orderId"],
      status: "wired",
    },
    state: {
      ...base.state,
      stateId: input.quoteReady ? "quote.ready" : "quote.required",
      label: stateLabel,
      source: "frontend-derived-from-api",
      customerAnswer: {
        currentStep: input.quoteReady ? "Quote loaded from pricing service" : "Waiting for quote",
        nextAvailableStep: submitAction.enabled ? "Create order" : "Obtain quote first",
        blockedReason: submitAction.disabledReasonCode ?? undefined,
        recoveryPath: "Retry quote from pricing API",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "Create order",
      body: "Submit order data from real APIs only.",
      primaryCta: submitAction.label,
    },
    uiSlots: [
      "summaryCard",
      "primaryActionDock",
      "secondaryActions",
      "workflowTimeline",
      "stateBadge",
      "apiError",
      "guardrail",
      "bottomNav",
      "themeSurface",
    ],
    figmaBinding: {
      kind: "exact",
      frameName: "Customer / Create Order / Quote to Payment",
      nodeId: "customer-create-order",
    },
    packagesUiComponents: ["CustomerQuoteCard", "ActionDock", "WorkflowTimeline", "OrderCard", "CustomerAnswerCard", "ApiErrorPanel"],
  });
}

function buildOrdersBinding(input: CustomerBindingInput): WorkflowUiBinding {
  const readAction = customerWorkflowActions.retryOrderDetails(Boolean(input.hasOrderIds));
  const actions = [readAction];
  const hasOrderIds = Boolean(input.hasOrderIds);
  const base = createBaseBinding("orders");
  return withRouteMeta(base, {
    workflowName: "customer.order.review",
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_ORDER.md"],
      endpoints: ["GET /api/orders/:orderId"],
      status: hasOrderIds ? "partial" : "not-wired",
    },
    state: {
      ...base.state,
      stateId: hasOrderIds ? "order.detail.review" : "order.list.unavailable",
      label: hasOrderIds ? "Review created order" : "Order detail not wired",
      source: hasOrderIds ? "api-contract" : "not-wired-policy",
      customerAnswer: {
        currentStep: hasOrderIds ? "Order detail available from backend" : "No order detail source yet",
        nextAvailableStep: hasOrderIds ? "Open order and payment detail" : "Create an order first",
        blockedReason: hasOrderIds ? undefined : "WORKFLOW_NOT_IMPLEMENTED",
        recoveryPath: "Create an order and keep latest orderId in state",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "Order review",
    },
    uiSlots: ["summaryCard", "stateBadge", "notWired", "emptyState", "apiError", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "partial",
      frameName: "Customer / Orders / Detail",
    },
    packagesUiComponents: ["OrderCard", "WorkflowTimeline", "NotWiredState", "ActionDock", "CustomerAnswerCard"],
    notWiredPolicy: hasOrderIds
      ? undefined
      : makeNotWiredPolicy("WORKFLOW_NOT_IMPLEMENTED", [readAction]),
  });
}

function buildProfileBinding(): WorkflowUiBinding {
  const actions = [customerWorkflowActions.loadProfile(), customerWorkflowActions.saveProfile(), customerWorkflowActions.listAddresses(), customerWorkflowActions.saveAddress()];
  const base = createBaseBinding("profile");
  return withRouteMeta(base, {
    workflowName: "customer.profile.operations",
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_PHASE21_OPERATIONS.md"],
      endpoints: ["GET /api/customer/profile", "POST /api/customer/profile", "GET /api/customer/addresses", "POST /api/customer/addresses"],
      status: "wired",
    },
    state: {
      ...base.state,
      stateId: "profile.operations.ready",
      label: "Profile and address operations ready",
      source: "api-contract",
      customerAnswer: {
        currentStep: "Profile and city-scoped service addresses are persisted",
        nextAvailableStep: "Maintain account and service address details",
        recoveryPath: "Retry the authenticated customer API",
      },
    },
    availableActions: actions,
    disabledReasons: [],
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "Profile",
      body: "Manage the authenticated account and city-scoped service addresses.",
      primaryCta: "Save changes",
    },
    uiSlots: ["summaryCard", "primaryActionDock", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "derived",
      frameName: "Customer / Profile / Operations",
    },
    packagesUiComponents: ["Card", "FormField", "Input", "ActionDock"],
  });
}

export function createCustomerWorkflowBinding(input: CustomerBindingInput): WorkflowUiBinding {
  if (input.route === "home") {
    return buildHomeBinding(input.cityCode);
  }
  if (input.route === "services") {
    return buildServicesBinding(input.cityCode);
  }
  if (input.route === "createOrder") {
    return buildCreateOrderBinding(input);
  }
  if (input.route === "orders") {
    return buildOrdersBinding(input);
  }
  return buildProfileBinding();
}
