import { describe, it, expect } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("outboxRequired", () => {
  it("gate script passes", () => {
    const output = runPowerShellGate("check-outbox-required.ps1");
    expect(output).toMatch(/passed/i);
  });
});
