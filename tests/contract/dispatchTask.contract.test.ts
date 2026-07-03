import { describe, it, expect } from "vitest";
import { dispatchTaskStatusSchema } from "@xlb/validators";

describe("dispatchTask contract", () => {
  it("status enum includes Phase 7A accepted state", () => {
    expect(dispatchTaskStatusSchema.options).toEqual([
      "pending",
      "queued",
      "accepted",
      "failed",
      "cancelled",
    ]);
  });
});
