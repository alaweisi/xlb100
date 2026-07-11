import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("Phase 23D quality closure boundaries", () => {
  it("preserves locked scope and requires every quality artifact", () => {
    expect(runPowerShellGate("check-phase23d-boundaries.ps1")).toContain("check-phase23d-boundaries: passed");
  }, 20_000);

  it("keeps the hosted workflow hard-blocking", () => {
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/phase23d-quality-gates.yml"), "utf8");
    expect(workflow).toContain("pnpm gate:phase23d");
    expect(workflow).not.toContain("continue-on-error");
  });
});
