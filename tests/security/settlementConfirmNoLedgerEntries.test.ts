import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8C ledger boundary", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-confirm-no-ledger-entries.ps1")).toContain("PASS")); });
