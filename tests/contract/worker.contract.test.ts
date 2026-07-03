import { describe, it, expect } from "vitest";
import { workerProfileStatusSchema } from "@xlb/validators";

describe("worker contract", () => {
  it("worker status enum matches Phase 5B", () => {
    expect(workerProfileStatusSchema.options).toEqual([
      "active",
      "suspended",
      "disabled",
    ]);
  });
});
