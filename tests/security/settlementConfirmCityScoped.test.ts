import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8C confirmation city scope", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-confirm-city-scoped.ps1")).toContain("PASS")); });
