import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";
describe("Phase 8C outbox idempotency", () => { it("passes its gate", () => expect(runPowerShellGate("check-settlement-confirm-outbox-idempotent.ps1")).toContain("PASS")); });
