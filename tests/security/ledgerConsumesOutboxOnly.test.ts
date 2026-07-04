import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("ledger consumes outbox only", () => { it("passes its architecture gate", () => { expect(runPowerShellGate("check-ledger-consumes-outbox-only.ps1")).toContain("PASS"); }); });
