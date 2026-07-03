import { describe, it, expect } from "vitest";
import { dispatchTaskStatusSchema } from "@xlb/validators";

describe("dispatchTask contract", () => {
  it("status enum matches Phase 5A states", () => {
    expect(dispatchTaskStatusSchema.options).toEqual([
      "pending",
      "queued",
      "failed",
      "cancelled",
    ]);
  });
});
