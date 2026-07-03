import { describe, it, expect } from "vitest";
import {
  assertFulfillmentTransition,
  canTransitionFulfillment,
} from "../../backend/src/fulfillment/fulfillmentStateMachine.js";

describe("fulfillmentStateMachine", () => {
  it("allows accepted -> in_progress", () => {
    expect(canTransitionFulfillment("accepted", "in_progress")).toBe(true);
  });

  it("does not allow accepted -> completed directly in Phase 7A API", () => {
    expect(canTransitionFulfillment("accepted", "completed")).toBe(false);
    expect(() => assertFulfillmentTransition("accepted", "completed")).toThrow();
  });
});
