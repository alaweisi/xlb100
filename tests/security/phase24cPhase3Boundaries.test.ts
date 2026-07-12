import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase 24C Phase 3 boundaries", () => {
  it("preserves locked history and confines SLA breach and workbench behavior to Support", () => {
    expect(runPowerShellGate("check-phase24c-phase3-boundaries.ps1"))
      .toContain("check-phase24c-phase3-boundaries: passed");
  }, 30_000);
});
