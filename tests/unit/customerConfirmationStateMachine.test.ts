import { describe, expect, it } from "vitest";
import { assertCustomerConfirmationTransition } from "../../backend/src/fulfillment/evidence/customerConfirmationStateMachine.js";

describe("customer confirmation state machine", () => {
  it.each(["confirmed", "disputed"] as const)("allows pending -> %s", (target) => {
    expect(() => assertCustomerConfirmationTransition("pending", target)).not.toThrow();
  });

  it.each([
    ["confirmed", "disputed"],
    ["disputed", "confirmed"],
    ["confirmed", "confirmed"],
    ["pending", "pending"],
  ] as const)("rejects %s -> %s", (from, target) => {
    expect(() => assertCustomerConfirmationTransition(from, target)).toThrow("Invalid customer confirmation transition");
  });
});
