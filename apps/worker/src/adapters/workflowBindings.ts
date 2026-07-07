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
    action("worker.taskPool.waitForBackend", "Wait for real task-pool API", "not-wired", "API_NOT_AVAILABLE", "/api/worker/task-pool", "GET"),
  waitForAccept: () =>
    action("worker.accept.disabled", "Accept not enabled", "not-wired", "WORKFLOW_NOT_IMPLEMENTED", "/api/worker/tasks/:dispatchTaskId/accept", "POST"),
  waitForFulfillment: () =>
    action("worker.fulfillment.disabled", "Fulfillment not wired", "not-wired", "WORKFLOW_NOT_IMPLEMENTED", "/api/worker/fulfillments/:id/start", "POST"),
  waitForWallet: () => action("worker.wallet.disabled", "Wallet not wired", "not-wired", "API_NOT_AVAILABLE"),
  waitForProfile: () => action("worker.profile.disabled", "Profile not wired", "not-wired", "API_NOT_AVAILABLE"),
  waitForCertification: () =>
    action("worker.certification.disabled", "Certification not wired", "not-wired", "API_NOT_AVAILABLE", "/api/worker/certifications", "POST"),
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
      "No fabricated tasks",
      "No fabricated accept eligibility",
      "No fabricated income",
      "No frontend-created accept success",
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
        label: "Task pool is not wired",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          blockedReason: "API_NOT_AVAILABLE",
          nextStep: "Wait for real task pool, city binding, and eligibility results",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["API_NOT_AVAILABLE", "WORKFLOW_NOT_IMPLEMENTED"],
      workerFacingCopy: {
        title: "Worker hall",
        body: "Tasks, eligibility, and accept actions must come from backend workflow.",
      },
      uiSlots: ["pageHero", "summaryCard", "stateBadge", "guardrail", "notWired", "emptyState", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "exact",
        frameName: "Worker / GrabHall / Online",
        nodeId: "1:1515",
        localPng: "docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png",
      },
      packagesUiComponents: ["WorkerStatusCard", "ActionDock", "WorkerAnswerCard", "WorkflowTimeline", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "Real task pool and accept eligibility are not wired yet.", actions),
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
        label: "Fulfillment tasks are not wired",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          blockedReason: "WORKFLOW_NOT_IMPLEMENTED",
          nextStep: "Wait for real fulfillment list and state machine",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["WORKFLOW_NOT_IMPLEMENTED"],
      workerFacingCopy: {
        title: "Worker tasks",
        body: "Fulfillment state and actions must come from backend workflow.",
      },
      uiSlots: ["workflowTimeline", "stateBadge", "guardrail", "notWired", "emptyState", "apiError", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Worker / Tasks / Accepted + TaskDetail / InProgress",
        nodeId: "1:2452 / 1:2543",
      },
      packagesUiComponents: ["WorkerTaskCard", "ActionDock", "WorkerAnswerCard", "WorkflowTimeline", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("WORKFLOW_NOT_IMPLEMENTED", "Fulfillment list and actions are not wired yet.", actions),
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
        label: "Wallet API is not wired",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          blockedReason: "API_NOT_AVAILABLE",
          nextStep: "Wait for worker income/wallet API",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["API_NOT_AVAILABLE", "PHASE_BOUNDARY"],
      workerFacingCopy: {
        title: "Worker wallet",
        body: "Income, withdrawal, and settlement records must not be fabricated by frontend.",
      },
      uiSlots: ["summaryCard", "notWired", "guardrail", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Worker / Income / Default",
        nodeId: "1:2742",
      },
      packagesUiComponents: ["MetricCard", "ActionDock", "WorkerAnswerCard", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "Income, wallet, and withdrawal capabilities are not wired to real APIs.", actions),
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
        label: "Certification status is not wired",
        source: "not-wired-policy",
        workerAnswer: {
          canAcceptOrder: false,
          certificationPassed: undefined,
          blockedReason: "API_NOT_AVAILABLE",
          nextStep: "Wait for certification status and eligibility API",
          walletWired: false,
        },
      },
      availableActions: actions,
      disabledReasons: ["API_NOT_AVAILABLE", "IDENTITY_REQUIRED"],
      workerFacingCopy: {
        title: "Worker certification",
        body: "Certification state must not be decided locally by the page.",
      },
      uiSlots: ["stateBadge", "guardrail", "notWired", "bottomNav", "themeSurface"],
      figmaBinding: {
        kind: "partial",
        frameName: "Worker / Mine / Default",
        nodeId: "1:2811",
        notes: "No standalone certification frame; bound to Worker Mine surface.",
      },
      packagesUiComponents: ["Card", "ActionDock", "WorkerAnswerCard", "NotWiredState"],
      notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "Certification status and service city are not wired yet.", actions),
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
      label: "Worker profile is not wired",
      source: "not-wired-policy",
      workerAnswer: {
        canAcceptOrder: false,
        blockedReason: "API_NOT_AVAILABLE",
        nextStep: "Wait for profile/certification API",
        walletWired: false,
      },
    },
    availableActions: actions,
    disabledReasons: ["API_NOT_AVAILABLE", "IDENTITY_REQUIRED"],
    workerFacingCopy: {
      title: "Worker profile",
      body: "Profile, service city, and certification state must come from backend.",
    },
    uiSlots: ["summaryCard", "stateBadge", "guardrail", "notWired", "bottomNav", "themeSurface"],
    figmaBinding: {
      kind: "partial",
      frameName: "Worker / Mine / Default",
      nodeId: "1:2811",
    },
    packagesUiComponents: ["Card", "ActionDock", "WorkerAnswerCard", "NotWiredState"],
    notWiredPolicy: notWiredPolicy("API_NOT_AVAILABLE", "Worker profile, certification status, and service city are not wired yet.", actions),
  };
}
