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
  retryCatalog: () => createAction("customer.catalog.retry", "重新加载服务", "api-derived", {
    endpoint: "/api/catalog",
    method: "GET",
  }),
  openServices: () => createAction("customer.services.open", "查看全部服务", "api-derived"),
  selectService: (skuId: string) =>
    createAction("customer.catalog.selectSku", "选择服务", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: "STATE_NOT_ACTIONABLE",
      endpoint: "/customer/order/create",
      method: "GET",
    }),
  retryQuote: (skuId?: string) =>
    createAction("customer.pricing.retryQuote", "重新获取报价", "api-derived", {
      enabled: Boolean(skuId),
      disabledReasonCode: skuId ? undefined : "API_NOT_AVAILABLE",
      endpoint: "/api/pricing/quote?skuId=:skuId",
      method: "GET",
    }),
  submitOrder: (quoteReady: boolean, selectedSkuId: boolean, submitting: boolean) =>
    createAction("customer.order.submit", submitting ? "正在提交" : "提交订单", "backend", {
      enabled: quoteReady && selectedSkuId && !submitting,
      disabledReasonCode: quoteReady && selectedSkuId && !submitting ? undefined : "STATE_NOT_ACTIONABLE",
      endpoint: "/api/orders",
      method: "POST",
      idempotencyRequired: true,
    }),
  viewOrders: () => createAction("customer.orders.open", "查看订单", "api-derived", {
    endpoint: "/customer/orders",
    method: "GET",
  }),
  retryOrderDetails: (hasOrderIds: boolean) =>
    createAction("customer.orders.retryDetails", "重新加载订单", "api-derived", {
      enabled: hasOrderIds,
      disabledReasonCode: hasOrderIds ? undefined : "WORKFLOW_NOT_IMPLEMENTED",
      endpoint: "/api/orders/:orderId",
      method: "GET",
    }),
  loadProfile: () => createAction("customer.profile.load", "加载个人资料", "api-derived", { endpoint: "/api/customer/profile", method: "GET" }),
  saveProfile: () => createAction("customer.profile.save", "保存个人资料", "backend", { endpoint: "/api/customer/profile", method: "POST" }),
  listAddresses: () => createAction("customer.address.list", "加载常用地址", "api-derived", { endpoint: "/api/customer/addresses", method: "GET" }),
  saveAddress: () => createAction("customer.address.save", "保存地址", "backend", { endpoint: "/api/customer/addresses", method: "POST" }),
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
    userCopy: "服务端暂未提供完整列表，请先创建订单或使用明确的订单号查询。",
    allowedUi: "read-only-shell",
    forbiddenClaims: [
      "不得展示虚构订单列表",
      "不得展示虚假支付成功",
      "不得展示虚假派单结果",
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
      label: "正在等待服务端数据",
      source: "api-contract",
      customerAnswer: {
        currentStep: "读取当前页面所需数据",
        nextAvailableStep: "展示服务与订单流程",
      },
    },
    availableActions: [],
    disabledReasons: [],
    customerFacingCopy: {
      title: "顾客服务",
      body: "顾客服务流程",
      primaryCta: "继续",
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
    title: "顾客服务",
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
  const stateLabel = "浏览本城市服务";
  const cityLabel = cityCode === "hangzhou" ? "杭州" : cityCode === "shanghai" ? "上海" : "北京";
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
        currentStep: `正在展示${cityLabel}服务目录`,
        nextAvailableStep: "选择服务后进入下单画面",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "发现服务",
      body: `浏览${cityLabel}可用服务。`,
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
  const cityLabel = cityCode === "hangzhou" ? "杭州" : cityCode === "shanghai" ? "上海" : "北京";
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
      label: "从服务目录选择",
      source: "frontend-derived-from-api",
      customerAnswer: {
        currentStep: `筛选${cityLabel}可预约服务`,
        nextAvailableStep: "选择具体服务项目",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "选择服务",
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
  const stateLabel = submitAction.enabled ? "可以提交订单" : "等待实时报价";

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
        currentStep: input.quoteReady ? "实时报价已返回" : "正在等待报价",
        nextAvailableStep: submitAction.enabled ? "提交订单" : "先获取报价并补全信息",
        blockedReason: undefined,
        recoveryPath: "重新从报价服务获取价格",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "确认订单",
      body: "服务、报价和订单状态均来自服务端。",
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
      label: hasOrderIds ? "查看订单详情" : "暂无可查询订单",
      source: hasOrderIds ? "api-contract" : "not-wired-policy",
      customerAnswer: {
        currentStep: hasOrderIds ? "订单详情已从服务端返回" : "服务端暂未提供订单列表接口",
        nextAvailableStep: hasOrderIds ? "查看服务、支付和售后状态" : "先创建订单",
        blockedReason: undefined,
        recoveryPath: "创建订单后使用订单号读取详情",
      },
    },
    availableActions: actions,
    disabledReasons: disabledReasonsFromActions(actions),
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "我的订单",
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
      label: "个人资料与地址可管理",
      source: "api-contract",
      customerAnswer: {
        currentStep: "个人资料与当前城市地址来自服务端",
        nextAvailableStep: "维护账号与服务地址",
        recoveryPath: "重新加载账号数据",
      },
    },
    availableActions: actions,
    disabledReasons: [],
    customerFacingCopy: {
      ...base.customerFacingCopy,
      title: "我的",
      body: "管理已登录账号与当前城市服务地址。",
      primaryCta: "保存修改",
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
