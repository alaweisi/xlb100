import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("eligibilityNoDispatchMutation", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-eligibility-no-dispatch-mutation.ps1");
  });
});
