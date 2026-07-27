import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("noFulfillmentCompleteInPhase7A", () => {
  it("gate script check-no-fulfillment-complete-in-phase7a.ps1 passes", () => {
    runPowerShellGate("check-no-fulfillment-complete-in-phase7a.ps1");
  });
});
