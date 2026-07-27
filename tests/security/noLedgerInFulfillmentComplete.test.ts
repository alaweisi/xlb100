import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("noLedgerInFulfillmentComplete", () => {
  it("passes the no-ledger gate", () => {
    runPowerShellGate("check-fulfillment-complete-no-ledger.ps1");
  });
});
