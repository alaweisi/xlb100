import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("noSettlementInPhase7B", () => {
  it("passes the settlement and payout gate", () => {
    runPowerShellGate("check-no-settlement-in-phase7b.ps1");
  });
});
