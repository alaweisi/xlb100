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
    action("customer.catalog.retry", "重试目录", "api-derived", {
      endpoint: "/api/catalog",
      method: "GET",
    }),
  openServices: () => action("customer.services.open", "全部服务", "api-derived"),
  selectService: (skuId: string) =>
    action("customer.catalog.selectSku", "选择", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: "STATE_NOT_ACTIONABLE",
    }),
  retryQuote: (skuId?: string) =>
    action("customer.pricing.retryQuote", "重试报价", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: "STATE_NOT_ACTIONABLE",
      endpoint: "/api/pricing/quote?skuId=:skuId",
      method: "GET",
    }),
  submitOrder: (quoteReady: boolean, selectedSkuId: boolean, submitting: boolean) =>
    action("customer.order.submit", submitting ? "提交中" : "提交订单", "backend", {
      enabled: quoteReady && selectedSkuId && !submitting,
      disabledReasonCode: quoteReady ? "STATE_NOT_ACTIONABLE" : "API_NOT_AVAILABLE",
      endpoint: "/api/orders",
      method: "POST",
    }),
  viewOrders: () => action("customer.orders.open", "查看订单", "api-derived"),
  retryOrderDetails: (hasOrderIds: boolean) =>
    action("customer.orders.retryDetails", "重试订单详情", "api-derived", {
      enabled: hasOrderIds,
      disabledReasonCode: "WORKFLOW_NOT_IMPLEMENTED",
      endpoint: "/api/orders/:orderId",
      method: "GET",
    }),
  profileUnavailable: () => notWiredAction("customer.profile.unavailable", "资料未接线", "API_NOT_AVAILABLE"),
  addressUnavailable: () => notWiredAction("customer.address.unavailable", "地址未接线", "API_NOT_AVAILABLE"),
  authUnavailable: () => notWiredAction("customer.auth.unavailable", "账号设置未接线", "API_NOT_AVAILABLE"),
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
        label: "目录来自后端",
        source: "api-contract",
        customerAnswer: {
          currentStep: `浏览 ${input.cityCode} 服务目录`,
          nextAvailableStep: "选择真实 SKU 后进入下单",
          recoveryPath: "目录失败时重试 GET /api/catalog",
        },
      },
      availableActions: [customerWorkflowActions.openServices(), customerWorkflowActions.retryCatalog()],
      disabledReasons: [],
      customerFacingCopy: {
        title: "用户服务目录",
        body: "目录、报价和下单均由现有 API 支撑。",
        primaryCta: "全部服务",
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
        label: "筛选后端目录",
        source: "frontend-derived-from-api",
        customerAnswer: {
          currentStep: "筛选后端 catalog 返回的服务 SKU",
          nextAvailableStep: "选择 SKU 并读取报价",
          recoveryPath: "目录失败时重试 GET /api/catalog",
        },
      },
      availableActions: [customerWorkflowActions.retryCatalog()],
      disabledReasons: [],
      customerFacingCopy: {
        title: "服务选择",
        body: "筛选和选择只基于后端 catalog SKU。",
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
        label: input.quoteReady ? "报价已就绪" : "等待真实报价",
        source: "frontend-derived-from-api",
        customerAnswer: {
          currentStep: input.quoteReady ? "已收到真实报价" : "先读取真实报价",
          nextAvailableStep: submitAction.enabled ? "提交真实订单并创建支付单" : "等待可执行 API 状态",
          blockedReason: submitAction.disabledReasonCode ?? undefined,
          recoveryPath: "报价失败时重试 GET /api/pricing/quote",
        },
      },
      availableActions: [
        customerWorkflowActions.retryQuote(input.selectedSkuId),
        submitAction,
        customerWorkflowActions.viewOrders(),
      ],
      disabledReasons,
      customerFacingCopy: {
        title: "订单确认",
        body: "订单和支付单只在真实 API 成功后展示。",
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
        label: "订单列表 API 未接线",
        source: "not-wired-policy",
        customerAnswer: {
          currentStep: "只复查本浏览器真实创建过的订单详情",
          nextAvailableStep: input.hasOrderIds ? "读取订单详情" : "先创建真实订单",
          blockedReason: "WORKFLOW_NOT_IMPLEMENTED",
          recoveryPath: "真实订单创建后使用订单详情 API",
        },
      },
      availableActions: [readAction],
      disabledReasons: ["WORKFLOW_NOT_IMPLEMENTED"],
      customerFacingCopy: {
        title: "订单进度",
        body: "订单列表 API 未接线，页面不得展示本地编造订单。",
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
        userCopy: "后端尚未提供 C 端订单列表 API。",
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
      label: "资料 API 未接线",
      source: "not-wired-policy",
      customerAnswer: {
        currentStep: "仅展示账户能力边界",
        nextAvailableStep: "等待资料、地址、登录态 API",
        blockedReason: "API_NOT_AVAILABLE",
        recoveryPath: "继续使用已接线的目录、报价和下单能力",
      },
    },
    availableActions: [
      customerWorkflowActions.profileUnavailable(),
      customerWorkflowActions.addressUnavailable(),
      customerWorkflowActions.authUnavailable(),
    ],
    disabledReasons: ["API_NOT_AVAILABLE", "IDENTITY_REQUIRED"],
    customerFacingCopy: {
      title: "用户资料",
      body: "资料、地址簿和账号设置尚未接入真实 API。",
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
      userCopy: "后端尚未提供 C 端资料、地址或账号设置 API。",
      allowedUi: "guardrail",
      forbiddenClaims: ["No fabricated customer profile", "No fabricated address", "No fabricated login state"],
      allowedActions: [],
    },
  };
}
