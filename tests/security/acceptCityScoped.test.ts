import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("acceptCityScoped", () => {
  it("gate script check-accept-city-scoped.ps1 passes", () => {
    runPowerShellGate("check-accept-city-scoped.ps1");
  });

  it("accept repository queries include city_code scope", () => {
    const repoPath = join(root, "backend/src/worker/workerAcceptRepository.ts");
    const content = readFileSync(repoPath, "utf8");
    expect(content).toContain("buildCityScopedWhere");
    expect(content).toContain("city_code");
  });
});
