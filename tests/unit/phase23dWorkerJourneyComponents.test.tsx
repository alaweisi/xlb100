// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fulfillment, WorkerTaskPoolItem } from "@xlb/types";
import { HallPage, TasksPage } from "../../apps/worker/src/pages/TaskPages";
import { TaskDetailPage } from "../../apps/worker/src/pages/FulfillmentPages";

const task: WorkerTaskPoolItem = {
  dispatchTaskId: "dispatch-phase23d",
  cityCode: "hangzhou",
  orderId: "order-phase23d",
  skuId: "sku_home_daily_2h",
  amount: 128,
  streamName: "dispatch:hangzhou",
  status: "queued",
  createdAt: "2026-07-11T01:00:00.000Z",
};

const accepted: Fulfillment = {
  fulfillmentId: "fulfillment-phase23d",
  acceptanceId: "acceptance-phase23d",
  dispatchTaskId: task.dispatchTaskId,
  orderId: task.orderId,
  cityCode: "hangzhou",
  workerId: "worker-demo-hangzhou",
  skuId: task.skuId,
  status: "accepted",
  startedAt: null,
  completedAt: null,
  completionNote: null,
  createdAt: "2026-07-11T01:01:00.000Z",
  updatedAt: "2026-07-11T01:01:00.000Z",
};

afterEach(cleanup);

describe("Phase 23D Worker journey page components", () => {
  it("routes an eligible queued task to the real accept callback and locks it while busy", () => {
    const onAccept = vi.fn();
    const props = {
      tasks: [task], loading: false, error: null, acceptError: null, acceptNotice: null,
      acceptingDispatchTaskId: null, simulationAction: null, simulationControlsEnabled: false,
      cityCode: "hangzhou", workerId: "worker-demo-hangzhou", onRefresh: vi.fn(),
      onAccept, onReject: vi.fn(), onSimulateTimeout: vi.fn(),
    };
    const { rerender } = render(<HallPage {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith(task.dispatchTaskId);

    rerender(<HallPage {...props} acceptingDispatchTaskId={task.dispatchTaskId} />);
    expect((screen.getByRole("button", { name: "Accepting" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the selected fulfillment from the Worker task list", () => {
    const onOpenDetail = vi.fn();
    render(<TasksPage fulfillments={[accepted]} loading={false} error={null} onRefresh={vi.fn()} onOpenDetail={onOpenDetail} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenDetail).toHaveBeenCalledWith(accepted.fulfillmentId);
  });

  it("enforces accepted-to-start and in-progress-to-complete lifecycle actions", () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const props = {
      fulfillment: accepted, loading: false, error: null, fulfillmentId: accepted.fulfillmentId,
      lifecycleError: null, lifecycleNotice: null, lifecycleAction: null,
      evidenceAggregate: null, evidenceLoading: false, evidenceError: null, evidenceBusy: false,
      onBack: vi.fn(), onStart, onComplete, onRefreshEvidence: vi.fn(), onUploadEvidence: vi.fn(),
    };
    const { rerender } = render(<TaskDetailPage {...props} />);

    const start = screen.getByRole("button", { name: "Start service" }) as HTMLButtonElement;
    const complete = screen.getByRole("button", { name: "Complete service" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    expect(complete.disabled).toBe(true);
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith(accepted.fulfillmentId);

    const inProgress = { ...accepted, status: "in_progress" as const, startedAt: "2026-07-11T01:02:00.000Z" };
    rerender(<TaskDetailPage {...props} fulfillment={inProgress} />);
    expect((screen.getByRole("button", { name: "Start service" }) as HTMLButtonElement).disabled).toBe(true);
    const enabledComplete = screen.getByRole("button", { name: "Complete service" }) as HTMLButtonElement;
    expect(enabledComplete.disabled).toBe(false);
    fireEvent.click(enabledComplete);
    expect(onComplete).toHaveBeenCalledWith(accepted.fulfillmentId);
  });
});
