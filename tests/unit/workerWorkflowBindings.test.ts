import { describe, expect, it } from "vitest";
import { createWorkerWorkflowBinding, workerWorkflowActions } from "../../apps/worker/src/adapters/workflowBindings.js";

describe("Worker workflow bindings", () => {
  it("marks task pool and accept as wired when a queued task is actionable", () => {
    const binding = createWorkerWorkflowBinding({
      route: "hall",
      cityCode: "hangzhou",
      workerId: "worker-demo-hangzhou",
      dispatchTaskStatus: "queued",
    });

    const accept = binding.availableActions.find((action) => action.actionId === "worker.acceptTask");

    expect(binding.backendSource.status).toBe("wired");
    expect(binding.notWiredPolicy).toBeUndefined();
    expect(accept?.source).toBe("backend");
    expect(accept?.enabled).toBe(true);
    expect(accept?.disabledReasonCode).toBeNull();
    expect(binding.state.workerAnswer?.canAcceptOrder).toBe(true);
  });

  it("disables accept when the backend task state is no longer actionable", () => {
    const action = workerWorkflowActions.acceptTask({
      hasWorkerIdentity: true,
      dispatchTaskStatus: "accepted",
    });

    expect(action.enabled).toBe(false);
    expect(action.disabledReasonCode).toBe("STATE_NOT_ACTIONABLE");
  });

  it("derives fulfillment start and complete from fulfillment status", () => {
    const acceptedBinding = createWorkerWorkflowBinding({
      route: "tasks",
      cityCode: "hangzhou",
      workerId: "worker-demo-hangzhou",
      fulfillmentStatus: "accepted",
    });
    const inProgressBinding = createWorkerWorkflowBinding({
      route: "tasks",
      cityCode: "hangzhou",
      workerId: "worker-demo-hangzhou",
      fulfillmentStatus: "in_progress",
    });

    const acceptedStart = acceptedBinding.availableActions.find((action) => action.actionId === "worker.fulfillment.start");
    const acceptedComplete = acceptedBinding.availableActions.find((action) => action.actionId === "worker.fulfillment.complete");
    const inProgressStart = inProgressBinding.availableActions.find((action) => action.actionId === "worker.fulfillment.start");
    const inProgressComplete = inProgressBinding.availableActions.find((action) => action.actionId === "worker.fulfillment.complete");

    expect(acceptedBinding.backendSource.status).toBe("wired");
    expect(acceptedStart?.enabled).toBe(true);
    expect(acceptedComplete?.enabled).toBe(false);
    expect(inProgressStart?.enabled).toBe(false);
    expect(inProgressComplete?.enabled).toBe(true);
  });
});
