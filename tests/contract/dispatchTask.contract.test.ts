import { describe, it, expect } from "vitest";
import { dispatchTaskStatusSchema } from "@xlb/validators";

describe("dispatchTask contract", () => {
  it("status enum includes P1 dispatch simulation states", () => {
    expect(dispatchTaskStatusSchema.options).toEqual([
      "pending",
      "queued",
      "offering",
      "accepted",
      "expired",
      "reassigning",
      "completed",
      "rejected",
      "timeout",
      "no_match",
      "manual_review",
      "failed",
      "cancelled",
    ]);
  });
});
