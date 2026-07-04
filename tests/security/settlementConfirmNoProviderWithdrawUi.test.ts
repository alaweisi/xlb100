import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8C provider boundary", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-confirm-no-provider-withdraw-ui.ps1")).toContain("PASS")); });
