import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("workerTaskPoolCityScoped", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-worker-taskpool-city-scoped.ps1");
  });

  it("listQueuedTasks filters by city and status", () => {
    const content = readFileSync(
      join(root, "backend/src/dispatch/dispatchRepository.ts"),
      "utf8",
    );
    expect(content).toMatch(/listQueuedTasks/);
    expect(content).toMatch(/status = 'queued'/);
    expect(content).toMatch(/buildCityScopedWhere/);
  });
});
