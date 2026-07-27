import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("noRefundAftersaleInPhase7B", () => {
  it("passes the refund and aftersale gate", () => {
    runPowerShellGate("check-no-refund-aftersale-in-phase7b.ps1");
  });
});
