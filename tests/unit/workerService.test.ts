import { describe, it, expect } from "vitest";
import { WorkerService } from "../../backend/src/worker/workerService.js";

describe("workerService", () => {
  it("can be instantiated", () => {
    expect(new WorkerService()).toBeDefined();
  });
});
