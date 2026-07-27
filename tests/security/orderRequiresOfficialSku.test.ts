import { describe, it, expect } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("orderRequiresOfficialSku", () => {
  it("gate script passes", () => {
    const output = runPowerShellGate("check-order-requires-official-sku.ps1");
    expect(output).toMatch(/passed/i);
  });
});
