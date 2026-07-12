import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase 24B support ticket boundaries", () => {
  it("preserves locked migrations and prevents protected-domain writes", () => {
    expect(runPowerShellGate("check-phase24b-boundaries.ps1")).toContain("check-phase24b-boundaries: passed");
  }, 30_000);
});
