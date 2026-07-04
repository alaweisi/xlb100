import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8B upstream immutability", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-no-upstream-mutation.ps1")).toContain("PASS")); });
