import { describe, it, expect } from "vitest";
import { runPowerShellGateResult } from "./helpers/runPowerShellGate.js";

describe("officialCatalogRequiredBeforeOrder", () => {
  it("passes when official catalog seeds are imported", () => {
    const result = runPowerShellGateResult("check-official-catalog-ready.ps1");
    expect(result.code).toBe(0);
    expect(result.output).toMatch(/passed/i);
  });

  it("source file is confirmed", () => {
    const result = runPowerShellGateResult("check-official-catalog-ready.ps1");
    expect(result.output).not.toMatch(/waiting for user confirmation/i);
  });
});
