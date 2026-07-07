import type {
  CityCode,
  WorkflowActionContract,
  WorkflowDisabledReason,
  WorkflowUiBinding,
} from "@xlb/types";

export type CustomerWorkflowRoute = "home" | "services" | "createOrder" | "orders" | "profile";

type CreateCustomerBindingInput = {
  route: CustomerWorkflowRoute;
  cityCode: CityCode;
  selectedSkuId?: string;
  quoteReady?: boolean;
  submitting?: boolean;
  hasOrderIds?: boolean;
};

type ActionOptions = {
  enabled?: boolean;
  disabledReasonCode?: WorkflowDisabledReason | null;
  endpoint?: string;
  method?: WorkflowActionContract["method"];
};

const customerThemeTokens = {
  activeThemeId: "customer-default",
  source: "default",
  affects: "visual-only",
  tokenRefs: [
    "role.customer.accent",
    "semantic.color.bgSurface",
    "semantic.color.fgPrimary",
    "component.card",
    "component.button",
    "component.bottomNav",
  ],
} satisfies WorkflowUiBinding["runtimeThemeTokens"];

function action(
  actionId: string,
  label: string,
  source: WorkflowActionContract["source"],
  options: ActionOptions = {},
): WorkflowActionContract {
  const enabled = options.enabled ?? true;
  return {
    actionId,
    label,
    enabled,
    disabledReasonCode: enabled ? null : options.disabledReasonCode ?? "STATE_NOT_ACTIONABLE",
    source,
    danger: false,
    confirmRequired: false,
    idempotencyRequired: options.method === "POST",
    auditRequired: false,
    cityScopeRequired: true,
    endpoint: options.endpoint,
    method: options.method,
  };
}

function notWiredAction(actionId: string, label: string, reasonCode: WorkflowDisabledReason): WorkflowActionContract {
  return action(actionId, label, "not-wired", { enabled: false, disabledReasonCode: reasonCode });
}

export const customerWorkflowActions = {
  retryCatalog: () =>
    action("customer.catalog.retry", "Retry catalog", "api-derived", {
      endpoint: "/api/catalog",
      method: "GET",
    }),
  openServices: () => action("customer.services.open", "All services", "api-derived"),
  selectService: (skuId: string) =>
    action("customer.catalog.selectSku", "Select", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: "STATE_NOT_ACTIONABLE",
    }),
  retryQuote: (skuId?: string) =>
    action("customer.pricing.retryQuote", "Retry quote", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: "STATE_NOT_ACTIONABLE",
      endpoint: "/api/pricing/quote?skuId=:skuId",
      method: "GET",
    }),
  submitOrder: (quoteReady: boolean, selectedSkuId: boolean, submitting: boolean) =>
    action("customer.order.submit", submitting ? "Submitting" : "Submit real order", "backend", {
      enabled: quoteReady && selectedSkuId && !submitting,
      disabledReasonCode: quoteReady ? "STATE_NOT_ACTIONABLE" : "API_NOT_AVAILABLE",
      endpoint: "/api/orders",
      method: "POST",
    }),
  viewOrders: () => action("customer.orders.open", "View orders", "api-derived"),
  retryOrderDetails: (hasOrderIds: boolean) =>
    action("customer.orders.retryDetails", "Retry order details", "api-derived", {
      enabled: hasOrderIds,
      disabledReasonCode: "WORKFLOW_NOT_IMPLEMENTED",
      endpoint: "/api/orders/:orderId",
      method: "GET",
    }),
  profileUnavailable: () => notWiredAction("customer.profile.unavailable", "Profile not wired", "API_NOT_AVAILABLE"),
  addressUnavailable: () => notWiredAction("customer.address.unavailable", "Address not wired", "API_NOT_AVAILABLE"),
  authUnavailable: () => notWiredAction("customer.auth.unavailable", "Account settings not wired", "API_NOT_AVAILABLE"),
};

export function runWorkflowAction(actionContract: WorkflowActionContract, handler: () => void) {
  if (actionContract.enabled) handler();
}

function baseBinding(input: CreateCustomerBindingInput): Pick<WorkflowUiBinding, "actor" | "route" | "runtimeThemeTokens"> {
  const routePath: Record<CustomerWorkflowRoute, string> = {
    home: "/customer/",
    services: "/customer/services",
    createOrder: "/customer/order/create",
    orders: "/customer/orders",
    profile: "/customer/profile",
  };

  return {
    actor: "customer",
    route: routePath[input.route],
    runtimeThemeTokens: customerThemeTokens,
  };
}

export function createCustomerWorkflowBinding(input: CreateCustomerBindingInput): WorkflowUiBinding {
  const common = baseBinding(input);

  if (input.route === "home") {
    return {
      ...common,
      workflowName: "customer.catalog.browsing",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_CATALOG.md"],
        endpoints: ["GET /api/catalog"],
        status: "wired",
      },
      state: {
        stateId: "catalog.ready-or-loading",
        label: "Catalog is backend sourced",
        source: "api-contract",
        customerAnswer: {
          currentStep: `Browse ${input.cityCode} service catalog`,
          nextAvailableStep: "Select a real SKU before order creation",
          recoveryPath: "Retry GET /api/catalog when catalog loading fails",
        },
      },
      availableActions: [customerWorkflowActions.openServices(), customerWorkflowActions.retryCatalog()],
      disabledReasons: [],
      customerFacingCopy: {
        title: "Customer catalog",
        body: "Catalog, quote, and order creation are backed by existing APIs.",
        primaryCta: "All services",
      },
      uiSlots: ["pageHero", "summaryCard", "emptyState", "apiError", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Customer / Home / Default",
        nodeId: "1:228",
        localPng: "docs/design/figma/frames/customer/customer_home_default_1-228.png",
      },
      packagesUiComponents: ["MobileShell", "TopBar", "HeroCard", "SearchBar", "ServiceCard", "ActionDock", "CustomerAnswerCard"],
    };
  }

  if (input.route === "services") {
    return {
      ...common,
      workflowName: "customer.catalog.browsing",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_CATALOG.md"],
        endpoints: ["GET /api/catalog"],
        status: "wired",
      },
      state: {
        stateId: "catalog.filtering",
        label: "Filtering backend catalog",
        source: "frontend-derived-from-api",
        customerAnswer: {
          currentStep: "Filter service SKUs returned by backend catalog",
          nextAvailableStep: "Select a SKU and read pricing quote",
          recoveryPath: "Retry GET /api/catalog when catalog loading fails",
        },
      },
      availableActions: [customerWorkflowActions.retryCatalog()],
      disabledReasons: [],
      customerFacingCopy: {
        title: "Service selection",
        body: "Filtering and selection are limited to backend catalog SKUs.",
      },
      uiSlots: ["summaryCard", "emptyState", "apiError", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Customer / Services / Default",
        nodeId: "1:411",
      },
      packagesUiComponents: ["SearchBar", "Tabs", "ServiceCard", "ActionDock", "CustomerAnswerCard"],
    };
  }

  if (input.route === "createOrder") {
    const submitAction = customerWorkflowActions.submitOrder(
      Boolean(input.quoteReady),
      Boolean(input.selectedSkuId),
      Boolean(input.submitting),
    );
    const disabledReasons = submitAction.disabledReasonCode ? [submitAction.disabledReasonCode] : [];
    return {
      ...common,
      workflowName: "customer.order.create",
      backendSource: {
        contractDocs: [
          "docs/contracts/CONTRACT_PRICING.md",
          "docs/contracts/CONTRACT_ORDER.md",
          "docs/contracts/CONTRACT_PAYMENT.md",
        ],
        endpoints: ["GET /api/pricing/quote?skuId", "POST /api/orders", "POST /api/payments/orders", "GET /api/orders/:orderId"],
        status: "wired",
      },
      state: {
        stateId: input.quoteReady ? "quote.ready" : "quote.required",
        label: input.quoteReady ? "Quote ready for order creation" : "Waiting for real quote",
        source: "frontend-derived-from-api",
        customerAnswer: {
          currentStep: input.quoteReady ? "Real quote received" : "Read a real quote first",
          nextAvailableStep: submitAction.enabled ? "Submit a real order and create payment order" : "Wait for actionable API state",
          blockedReason: submitAction.disabledReasonCode ?? undefined,
          recoveryPath: "Retry GET /api/pricing/quote when quote loading fails",
        },
      },
      availableActions: [
        customerWorkflowActions.retryQuote(input.selectedSkuId),
        submitAction,
        customerWorkflowActions.viewOrders(),
      ],
      disabledReasons,
      customerFacingCopy: {
        title: "Order confirmation",
        body: "Order and payment order are displayed only after real API success.",
        primaryCta: submitAction.label,
      },
      uiSlots: ["summaryCard", "primaryActionDock", "workflowTimeline", "stateBadge", "apiError", "guardrail", "themeSurface"],
      figmaBinding: {
        kind: "exact",
        frameName: "Customer / CreateOrder / Default",
        nodeId: "1:594",
        localPng: "docs/design/figma/frames/customer/customer_createorder_default_1-594.png",
      },
      packagesUiComponents: ["CustomerQuoteCard", "ActionDock", "WorkflowTimeline", "OrderCard", "CustomerAnswerCard"],
    };
  }

  if (input.route === "orders") {
    const readAction = customerWorkflowActions.retryOrderDetails(Boolean(input.hasOrderIds));
    return {
      ...common,
      workflowName: "customer.order.list.notWired",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_ORDER.md"],
        endpoints: ["GET /api/orders/:orderId"],
        status: "partial",
      },
      state: {
        stateId: "order.list.not-wired",
        label: "Order list API is not wired",
        source: "not-wired-policy",
        customerAnswer: {
          currentStep: "Only re-read real order details created in this browser session",
          nextAvailableStep: input.hasOrderIds ? "Read order details" : "Create a real order first",
          blockedReason: "WORKFLOW_NOT_IMPLEMENTED",
          recoveryPath: "Use order detail API after a real order is created",
        },
      },
      availableActions: [readAction],
      disabledReasons: ["WORKFLOW_NOT_IMPLEMENTED"],
      customerFacingCopy: {
        title: "Order progress",
        body: "Order list API is not wired, so the page must not show fabricated orders.",
      },
      uiSlots: ["workflowTimeline", "stateBadge", "notWired", "emptyState", "apiError", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Customer / Orders / All + Empty + Detail",
        nodeId: "1:824 / 1:947 / 1:1013",
        localPng: "docs/design/figma/frames/customer/customer_orders_all_1-824.png",
      },
      packagesUiComponents: ["OrderCard", "WorkflowTimeline", "NotWiredState", "ActionDock", "CustomerAnswerCard"],
      notWiredPolicy: {
        reasonCode: "WORKFLOW_NOT_IMPLEMENTED",
        userCopy: "Backend does not yet provide a customer order-list API.",
        allowedUi: "read-only-shell",
        forbiddenClaims: ["No fabricated order list", "No fabricated cancel success", "No fabricated dispatch state"],
        allowedActions: [readAction],
      },
    };
  }

  return {
    ...common,
    workflowName: "customer.profile.notWired",
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md"],
      endpoints: [],
      status: "not-wired",
    },
    state: {
      stateId: "profile.not-wired",
      label: "Profile API is not wired",
      source: "not-wired-policy",
      customerAnswer: {
        currentStep: "Show account capability boundary only",
        nextAvailableStep: "Wait for profile/address/auth APIs",
        blockedReason: "API_NOT_AVAILABLE",
        recoveryPath: "Continue using wired catalog, quote, and order capabilities",
      },
    },
    availableActions: [
      customerWorkflowActions.profileUnavailable(),
      customerWorkflowActions.addressUnavailable(),
      customerWorkflowActions.authUnavailable(),
    ],
    disabledReasons: ["API_NOT_AVAILABLE", "IDENTITY_REQUIRED"],
    customerFacingCopy: {
      title: "Customer profile",
      body: "Profile, address book, and account settings are not wired to real APIs.",
    },
    uiSlots: ["notWired", "summaryCard", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "partial",
      frameName: "Customer / Mine / Default + Settings / Default",
      nodeId: "1:1359 / 1:1440",
    },
    packagesUiComponents: ["Card", "NotWiredState", "ActionDock", "CustomerAnswerCard"],
    notWiredPolicy: {
      reasonCode: "API_NOT_AVAILABLE",
      userCopy: "Backend does not yet provide C-side profile, address, or account settings APIs.",
      allowedUi: "guardrail",
      forbiddenClaims: ["No fabricated customer profile", "No fabricated address", "No fabricated login state"],
      allowedActions: [],
    },
  };
}
