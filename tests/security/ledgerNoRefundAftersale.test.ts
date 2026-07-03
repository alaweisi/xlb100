import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("ledger no refund aftersale", () => { it("passes its architecture gate", () => { expect(runPowerShellGate("check-ledger-no-refund-aftersale.ps1")).toContain("PASS"); }); });
