import { describe, it, expect } from "vitest";
import { TaskPoolService } from "../../backend/src/worker/taskPoolService.js";

describe("taskPoolService", () => {
  it("can be instantiated", () => {
    expect(new TaskPoolService()).toBeDefined();
  });
});
