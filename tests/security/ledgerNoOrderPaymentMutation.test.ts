import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("ledger no upstream mutation", () => { it("passes its architecture gate", () => { expect(runPowerShellGate("check-ledger-no-order-payment-mutation.ps1")).toContain("PASS"); }); });
