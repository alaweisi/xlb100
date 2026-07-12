import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase 24C Phase 1 boundaries", () => {
  it("preserves locked migrations and blocks routing, SLA, Claim, UI, and protected-domain scope", () => {
    expect(runPowerShellGate("check-phase24c-phase1-boundaries.ps1"))
      .toContain("check-phase24c-phase1-boundaries: passed");
  }, 30_000);
});
