import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
import { describe, expect, it } from "vitest";

describe("Phase 23B boundary gate", () => {
  it("requires atomic outbox, safe API retries, and preserves locked semantics", () => {
    expect(runPowerShellGate("check-phase23b-boundaries.ps1")).toContain(
      "check-phase23b-boundaries: passed",
    );
  });
});
