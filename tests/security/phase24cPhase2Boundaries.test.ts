import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase 24C Phase 2 boundaries", () => {
  it("preserves locked migrations and blocks Phase 3 jobs, claim, queues, and protected-domain scope", () => {
    expect(runPowerShellGate("check-phase24c-phase2-boundaries.ps1"))
      .toContain("check-phase24c-phase2-boundaries: passed");
  }, 30_000);
});
