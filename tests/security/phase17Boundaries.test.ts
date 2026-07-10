import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase 17 execution boundaries", () => {
  it("blocks payment, provider refund, ledger, and dispatch assignment mutations", () => {
    expect(runPowerShellGate("check-phase17-boundaries.ps1")).toContain("passed");
  });
});
