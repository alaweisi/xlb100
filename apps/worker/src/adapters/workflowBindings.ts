import type {
  CityCode,
  DispatchTaskStatus,
  FulfillmentStatus,
  WorkflowActionContract,
  WorkflowDisabledReason,
  WorkflowUiBinding,
} from "@xlb/types";

export type WorkerWorkflowRoute = "hall" | "tasks" | "wallet" | "profile" | "certification";

type CreateWorkerBindingInput = {
  route: WorkerWorkflowRoute;
  cityCode?: CityCode;
  workerId?: string;
  dispatchTaskStatus?: DispatchTaskStatus;
  fulfillmentStatus?: FulfillmentStatus;
  busy?: boolean;
};

const workerThemeTokens = {
  activeThemeId: "worker-default",
  source: "default",
  affects: "visual-only",
  tokenRefs: [
    "role.worker.accent",
    "semantic.color.bgSurface",
    "semantic.color.fgPrimary",
    "component.card",
    "component.button",
    "component.bottomNav",
  ],
} satisfies WorkflowUiBinding["runtimeThemeTokens"];

type ActionOptions = {
  enabled?: boolean;
  disabledReasonCode?: WorkflowDisabledReason;
  endpoint?: string;
  method?: WorkflowActionContract["method"];
  danger?: boolean;
  confirmRequired?: boolean;
  idempotencyRequired?: boolean;
  auditRequired?: boolean;
  cityScopeRequired?: boolean;
};

function createAction(
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
    danger: options.danger ?? false,
    confirmRequired: options.confirmRequired ?? false,
    idempotencyRequired: options.idempotencyRequired ?? options.method === "POST",
    auditRequired: options.auditRequired ?? false,
    cityScopeRequired: options.cityScopeRequired ?? true,
    endpoint: options.endpoint,
    method: options.method,
  };
}

function createNotWiredAction(
  actionId: string,
  label: string,
  reasonCode: WorkflowDisabledReason,
  endpoint?: string,
  method?: WorkflowActionContract["method"],
): WorkflowActionContract {
  return createAction(actionId, label, "not-wired", {
    enabled: false,
    disabledReasonCode: reasonCode,
    endpoint,
    method,
  });
}

function hasWorkerIdentity(input: { workerId?: string; hasWorkerIdentity?: boolean }): boolean {
  return input.hasWorkerIdentity ?? Boolean(input.workerId);
}

type WorkerActionState = {
  dispatchTaskStatus?: DispatchTaskStatus;
  fulfillmentStatus?: FulfillmentStatus;
  busy?: boolean;
  workerId?: string;
  hasWorkerIdentity?: boolean;
};

function disabledReasonsFromActions(actions: WorkflowActionContract[]): WorkflowUiBinding["disabledReasons"] {
  const reasons = new Set<WorkflowDisabledReason>();
  for (const action of actions) {
    if (action.disabledReasonCode) {
      reasons.add(action.disabledReasonCode);
    }
  }
  return [...reasons];
}

export const workerWorkflowActions = {
  waitForTaskPool: () =>
    createNotWiredAction("worker.taskPool.waitForBackend", "等待真实任务池", "API_NOT_AVAILABLE", "/api/worker/task-pool", "GET"),
  readTaskPool: () =>
    createAction("worker.taskPool.reload", "刷新任务池", "backend", {
      endpoint: "/api/worker/task-pool",
      method: "GET",
    }),
  acceptTask: (state: WorkerActionState = {}) => {
    const identityReady = hasWorkerIdentity(state);
    const stateReady = state.dispatchTaskStatus === "queued" || state.dispatchTaskStatus === "offering";
    const enabled = identityReady && stateReady && !state.busy;
    const disabledReasonCode = !identityReady
      ? "IDENTITY_REQUIRED"
      : !stateReady
        ? "STATE_NOT_ACTIONABLE"
        : "EXECUTION_DISABLED";

    return createAction("worker.acceptTask", state.busy ? "接单中" : "接单", "backend", {
      enabled,
      disabledReasonCode,
      endpoint: "/api/worker/tasks/:dispatchTaskId/accept",
      method: "POST",
      idempotencyRequired: true,
      auditRequired: true,
    });
  },
  readFulfillments: () =>
    createAction("worker.fulfillment.reload", "刷新履约任务", "backend", {
      endpoint: "/api/worker/fulfillments",
      method: "GET",
    }),
  startFulfillment: (state: WorkerActionState = {}) => {
    const identityReady = hasWorkerIdentity(state);
    const stateReady = state.fulfillmentStatus === "accepted";
    const enabled = identityReady && stateReady && !state.busy;
    const disabledReasonCode = !identityReady
      ? "IDENTITY_REQUIRED"
      : !stateReady
        ? "STATE_NOT_ACTIONABLE"
        : "EXECUTION_DISABLED";

    return createAction("worker.fulfillment.start", state.busy ? "开始中" : "开始服务", "backend", {
      enabled,
      disabledReasonCode,
      endpoint: "/api/worker/fulfillments/:fulfillmentId/start",
      method: "POST",
      idempotencyRequired: true,
    });
  },
  completeFulfillment: (state: WorkerActionState = {}) => {
    const identityReady = hasWorkerIdentity(state);
    const stateReady = state.fulfillmentStatus === "in_progress";
    const enabled = identityReady && stateReady && !state.busy;
    const disabledReasonCode = !identityReady
      ? "IDENTITY_REQUIRED"
      : !stateReady
        ? "STATE_NOT_ACTIONABLE"
        : "EXECUTION_DISABLED";

    return createAction("worker.fulfillment.complete", state.busy ? "完工中" : "完成服务", "backend", {
      enabled,
      disabledReasonCode,
      endpoint: "/api/worker/fulfillments/:fulfillmentId/complete",
      method: "POST",
      idempotencyRequired: true,
    });
  },
  waitForWallet: () => createNotWiredAction("worker.wallet.disabled", "收益未接线", "API_NOT_AVAILABLE"),
  waitForProfile: () => createNotWiredAction("worker.profile.disabled", "资料未接线", "API_NOT_AVAILABLE"),
  waitForCertification: () =>
    createNotWiredAction("worker.certification.disabled", "认证状态未接线", "API_NOT_AVAILABLE", "/api/worker/certifications", "POST"),
};

function baseBinding(route: WorkerWorkflowRoute): Pick<WorkflowUiBinding, "actor" | "route" | "runtimeThemeTokens"> {
  const routePath: Record<WorkerWorkflowRoute, string> = {
    hall: "/worker/",
    tasks: "/worker/tasks",
    wallet: "/worker/wallet",
    profile: "/worker/profile",
    certification: "/worker/certification",
  };

  return {
    actor: "worker",
    route: routePath[route],
    runtimeThemeTokens: workerThemeTokens,
  };
}

function notWiredPolicy(reasonCode: WorkflowDisabledReason, userCopy: string, actions: WorkflowActionContract[]): WorkflowUiBinding["notWiredPolicy"] {
  return {
    reasonCode,
    userCopy,
    allowedUi: "guardrail",
    forbiddenClaims: [
      "不得编造任务",
      "不得编造接单资格",
      "不得编造收入",
      "不得前端自造接单成功",
    ],
    allowedActions: actions,
  };
}

export function createWorkerWorkflowBinding(input: CreateWorkerBindingInput): WorkflowUiBinding {
  const common = baseBinding(input.route);

  if (input.route === "hall") {
    const acceptAction = workerWorkflowActions.acceptTask(input);
    const actions = [workerWorkflowActions.readTaskPool(), acceptAction];
    return {
      ...common,
      workflowName: "worker.taskPool",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_WORKER_TASK_POOL.md", "docs/contracts/CONTRACT_WORKER_ACCEPT.md"],
        endpoints: ["GET /api/worker/task-pool", "POST /api/worker/tasks/:dispatchTaskId/accept"],
        status: "wired",
      },
      state: {
        stateId: acceptAction.enabled ? "task-pool.acceptable" : "task-pool.ready",
        label: acceptAction.enabled ? "可接单" : "任务池已接线",
        source: "frontend-derived-from-api",
        workerAnswer: {
          canAcceptOrder: acceptAction.enabled,
          serviceCity: input.cityCode,
          blockedReason: acceptAction.disabledReasonCode ?? undefined,
          nextStep: acceptAction.enabled ? "调用接单接口" : "等待可接任务或刷新任务池",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: disabledReasonsFromActions(actions),
      workerFacingCopy: {
        title: "师傅接单大厅",
        body: "任务池和接单动作来自后端 worker workflow。",
      },
      uiSlots: ["pageHero", "summaryCard", "primaryActionDock", "tableActions", "stateBadge", "apiError", "emptyState", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "exact",
        frameName: "Worker / GrabHall / Online",
        nodeId: "1:1515",
        localPng: "docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png",
      },
      packagesUiComponents: ["WorkerStatusCard", "ActionDock", "WorkerAnswerCard", "WorkflowTimeline", "Table", "Button"],
    };
  }

  if (input.route === "tasks") {
    const startAction = workerWorkflowActions.startFulfillment(input);
    const completeAction = workerWorkflowActions.completeFulfillment(input);
    const actions = [workerWorkflowActions.readFulfillments(), startAction, completeAction];
    return {
      ...common,
      workflowName: "worker.fulfillment.lifecycle",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_FULFILLMENT_LIFECYCLE.md"],
        endpoints: ["GET /api/worker/fulfillments", "POST /api/worker/fulfillments/:fulfillmentId/start", "POST /api/worker/fulfillments/:fulfillmentId/complete"],
        status: "wired",
      },
      state: {
        stateId: input.fulfillmentStatus ? `fulfillment.${input.fulfillmentStatus}` : "fulfillment.list",
        label: "履约任务已接线",
        source: "frontend-derived-from-api",
        workerAnswer: {
          canAcceptOrder: false,
          serviceCity: input.cityCode,
          blockedReason: startAction.enabled || completeAction.enabled
            ? undefined
            : startAction.disabledReasonCode ?? completeAction.disabledReasonCode ?? undefined,
          nextStep: startAction.enabled
            ? "开始服务"
            : completeAction.enabled
              ? "完成服务"
              : "查看履约任务状态",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: disabledReasonsFromActions(actions),
      workerFacingCopy: {
        title: "师傅任务",
        body: "履约列表、开始服务和完工动作来自后端 fulfillment workflow。",
      },
      uiSlots: ["workflowTimeline", "stateBadge", "primaryActionDock", "tableActions", "emptyState", "apiError", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Worker / Tasks / Accepted + TaskDetail / InProgress",
        nodeId: "1:2452 / 1:2543",
      },
      packagesUiComponents: ["WorkerTaskCard", "ActionDock", "WorkerAnswerCard", "WorkflowTimeline", "Table", "Button"],
    };
  }

  if (input.route === "wallet") {
    const actions = [workerWorkflowActions.waitForWallet()];
    return {
      ...common,
      workflowName: "worker.wallet.notWired",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md"],
        endpoints: [],
        status: "not-wired",
      },
      state: {
        stateId: "wallet.not-wired",
        label: "收益 API 未接线",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          blockedReason: "API_NOT_AVAILABLE",
          nextStep: "等待师傅收入/钱包 API",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["API_NOT_AVAILABLE", "PHASE_BOUNDARY"],
      workerFacingCopy: {
        title: "师傅收益",
        body: "收入、提现和结算记录不得由前端编造。",
      },
      uiSlots: ["summaryCard", "notWired", "guardrail", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Worker / Income / Default",
        nodeId: "1:2742",
      },
      packagesUiComponents: ["MetricCard", "ActionDock", "WorkerAnswerCard", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "收入、钱包和提现能力尚未接入真实 API。", actions),
    };
  }

  if (input.route === "certification") {
    const actions = [workerWorkflowActions.waitForCertification()];
    return {
      ...common,
      workflowName: "worker.certification.status.notWired",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_WORKER_CERTIFICATION.md", "docs/contracts/CONTRACT_WORKER_ELIGIBILITY.md"],
        endpoints: ["POST /api/worker/certifications"],
        status: "not-wired",
      },
      state: {
        stateId: "certification.not-wired",
        label: "认证状态未接线",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          certificationPassed: undefined,
          blockedReason: "API_NOT_AVAILABLE",
          nextStep: "等待认证状态和资格 API",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["API_NOT_AVAILABLE", "IDENTITY_REQUIRED"],
      workerFacingCopy: {
        title: "师傅认证",
        body: "认证状态不得由页面本地判断。",
      },
      uiSlots: ["stateBadge", "guardrail", "notWired", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Worker / Mine / Default",
        nodeId: "1:2811",
        notes: "No standalone certification frame; bound to Worker Mine surface.",
      },
      packagesUiComponents: ["Card", "ActionDock", "WorkerAnswerCard", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "认证状态和服务城市尚未接线。", actions),
    };
  }

  const actions = [workerWorkflowActions.waitForProfile(), workerWorkflowActions.waitForCertification()];
  return {
    ...common,
    workflowName: "worker.profile.read.notWired",
    backendSource: {
      contractDocs: ["docs/contracts/CONTRACT_WORKER_PROFILE.md", "docs/contracts/CONTRACT_WORKER_CERTIFICATION.md"],
      endpoints: [],
      status: "not-wired",
    },
    state: {
      stateId: "profile.not-wired",
      label: "师傅资料未接线",
      source: "not-wired-policy",
      workerAnswer: {
        canAcceptOrder: false,
        blockedReason: "API_NOT_AVAILABLE",
        nextStep: "等待资料/认证 API",
        walletWired: false,
      },
    },
    availableActions: actions,
    disabledReasons: ["API_NOT_AVAILABLE", "IDENTITY_REQUIRED"],
    workerFacingCopy: {
      title: "师傅资料",
      body: "资料、服务城市和认证状态必须来自后端。",
    },
    uiSlots: ["summaryCard", "stateBadge", "guardrail", "notWired", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "partial",
      frameName: "Worker / Mine / Default",
      nodeId: "1:2811",
    },
    packagesUiComponents: ["Card", "ActionDock", "WorkerAnswerCard", "NotWiredState"],
    notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "师傅资料、认证状态和服务城市尚未接线。", actions),
  };
}
