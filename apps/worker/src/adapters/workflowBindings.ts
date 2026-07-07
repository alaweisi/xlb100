import type {
  WorkflowActionContract,
  WorkflowDisabledReason,
  WorkflowUiBinding,
} from "@xlb/types";

export type WorkerWorkflowRoute = "hall" | "tasks" | "wallet" | "profile" | "certification";

type CreateWorkerBindingInput = {
  route: WorkerWorkflowRoute;
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

function action(
  actionId: string,
  label: string,
  source: WorkflowActionContract["source"],
  reasonCode: WorkflowDisabledReason,
  endpoint?: string,
  method?: WorkflowActionContract["method"],
): WorkflowActionContract {
  return {
    actionId,
    label,
    enabled: false,
    disabledReasonCode: reasonCode,
    source,
    danger: false,
    confirmRequired: false,
    idempotencyRequired: method === "POST",
    auditRequired: false,
    cityScopeRequired: true,
    endpoint,
    method,
  };
}

export const workerWorkflowActions = {
  waitForTaskPool: () =>
    action("worker.taskPool.waitForBackend", "等待真实任务池", "not-wired", "API_NOT_AVAILABLE", "/api/worker/task-pool", "GET"),
  waitForAccept: () =>
    action("worker.accept.disabled", "接单未开放", "not-wired", "WORKFLOW_NOT_IMPLEMENTED", "/api/worker/tasks/:dispatchTaskId/accept", "POST"),
  waitForFulfillment: () =>
    action("worker.fulfillment.disabled", "履约未接线", "not-wired", "WORKFLOW_NOT_IMPLEMENTED", "/api/worker/fulfillments/:id/start", "POST"),
  waitForWallet: () => action("worker.wallet.disabled", "收益未接线", "not-wired", "API_NOT_AVAILABLE"),
  waitForProfile: () => action("worker.profile.disabled", "资料未接线", "not-wired", "API_NOT_AVAILABLE"),
  waitForCertification: () =>
    action("worker.certification.disabled", "认证未接线", "not-wired", "API_NOT_AVAILABLE", "/api/worker/certifications", "POST"),
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
    const actions = [workerWorkflowActions.waitForTaskPool(), workerWorkflowActions.waitForAccept()];
    return {
      ...common,
      workflowName: "worker.taskPool.notWired",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_WORKER_TASK_POOL.md", "docs/contracts/CONTRACT_WORKER_ACCEPT.md"],
        endpoints: ["GET /api/worker/task-pool", "POST /api/worker/tasks/:dispatchTaskId/accept"],
        status: "not-wired",
      },
      state: {
        stateId: "task-pool.not-wired",
        label: "任务池未接线",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          blockedReason: "API_NOT_AVAILABLE",
          nextStep: "等待真实任务池、城市绑定和资格结果",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["API_NOT_AVAILABLE", "WORKFLOW_NOT_IMPLEMENTED"],
      workerFacingCopy: {
        title: "师傅接单大厅",
        body: "任务、资格和接单动作必须来自后端 workflow。",
      },
      uiSlots: ["pageHero", "summaryCard", "stateBadge", "guardrail", "notWired", "emptyState", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "exact",
        frameName: "Worker / GrabHall / Online",
        nodeId: "1:1515",
        localPng: "docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png",
      },
      packagesUiComponents: ["WorkerStatusCard", "ActionDock", "WorkerAnswerCard", "WorkflowTimeline", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "真实任务池和接单资格尚未接线。", actions),
    };
  }

  if (input.route === "tasks") {
    const actions = [workerWorkflowActions.waitForFulfillment()];
    return {
      ...common,
      workflowName: "worker.fulfillment.tasks.notWired",
      backendSource: {
        contractDocs: ["docs/contracts/CONTRACT_FULFILLMENT_LIFECYCLE.md"],
        endpoints: ["GET /api/worker/fulfillments", "POST /api/worker/fulfillments/:fulfillmentId/start", "POST /api/worker/fulfillments/:fulfillmentId/complete"],
        status: "not-wired",
      },
      state: {
        stateId: "fulfillment.not-wired",
        label: "履约任务未接线",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          blockedReason: "WORKFLOW_NOT_IMPLEMENTED",
          nextStep: "等待真实履约列表和状态机",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["WORKFLOW_NOT_IMPLEMENTED"],
      workerFacingCopy: {
        title: "师傅任务",
        body: "履约状态和动作必须来自后端 workflow。",
      },
      uiSlots: ["workflowTimeline", "stateBadge", "guardrail", "notWired", "emptyState", "apiError", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Worker / Tasks / Accepted + TaskDetail / InProgress",
        nodeId: "1:2452 / 1:2543",
      },
      packagesUiComponents: ["WorkerTaskCard", "ActionDock", "WorkerAnswerCard", "WorkflowTimeline", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("WORKFLOW_NOT_IMPLEMENTED", "履约列表和动作尚未接线。", actions),
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
