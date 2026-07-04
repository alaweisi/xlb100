import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8B preparation status", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-no-paid-status-in-phase8b.ps1")).toContain("PASS")); });
