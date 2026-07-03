import { describe, it, expect } from "vitest";
import {
  canRetryAcceptForWorker,
  isSameWorkerAcceptance,
} from "../../backend/src/worker/workerAcceptIdempotency.js";
import type { WorkerTaskAcceptance } from "@xlb/types";

const base: WorkerTaskAcceptance = {
  acceptanceId: "acc_1",
  dispatchTaskId: "dpt_1",
  cityCode: "hangzhou",
  orderId: "ord_1",
  workerId: "worker-demo-hangzhou",
  skuId: "sku_home_daily_2h",
  status: "accepted",
  acceptedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("workerAcceptIdempotency", () => {
  it("detects same worker acceptance", () => {
    expect(isSameWorkerAcceptance(base, "worker-demo-hangzhou")).toBe(true);
    expect(isSameWorkerAcceptance(base, "worker-other")).toBe(false);
  });

  it("allows retry for same worker", () => {
    expect(canRetryAcceptForWorker(base, "worker-demo-hangzhou")).toBe(true);
    expect(canRetryAcceptForWorker(null, "worker-demo-hangzhou")).toBe(false);
  });
});
