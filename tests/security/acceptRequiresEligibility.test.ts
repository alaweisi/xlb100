import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const scripts = [
  "check-accept-requires-eligibility.ps1",
  "check-accept-city-scoped.ps1",
  "check-fulfillment-skeleton-no-ledger.ps1",
  "check-no-payment-order-to-accept.ps1",
  "check-no-fulfillment-complete-in-phase7a.ps1",
];

describe("Phase 7A gate scripts", () => {
  for (const script of scripts) {
    it(`${script} passes`, () => {
      runPowerShellGate(script);
    });
  }
});
