import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8B source boundary", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-consumes-ledger-accruals-only.ps1")).toContain("PASS")); });
