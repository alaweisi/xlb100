import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("ledger no settlement payout", () => { it("passes its architecture gate", () => { expect(runPowerShellGate("check-ledger-no-settlement-payout.ps1")).toContain("PASS"); }); });
