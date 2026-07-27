import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("orderPaymentNotMutatedByFulfillment", () => {
  it("passes the order/payment immutability gate", () => {
    runPowerShellGate("check-order-payment-not-mutated-by-fulfillment.ps1");
  });
});
