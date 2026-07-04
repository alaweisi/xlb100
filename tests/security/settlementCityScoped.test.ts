import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8B city scope", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-city-scoped.ps1")).toContain("PASS")); });
