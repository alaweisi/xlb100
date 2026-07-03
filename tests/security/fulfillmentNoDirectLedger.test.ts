import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("fulfillment no direct ledger", () => { it("passes its architecture gate", () => { expect(runPowerShellGate("check-fulfillment-no-direct-ledger.ps1")).toContain("PASS"); }); });
