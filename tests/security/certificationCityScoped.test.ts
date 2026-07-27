import { describe, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

describe("certificationCityScoped", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-certification-city-scoped.ps1");
  });
});
