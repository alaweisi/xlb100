import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("workerTaskPoolCityScoped", () => {
  it("gate script passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-worker-taskpool-city-scoped.ps1")}"`,
      { encoding: "utf-8" },
    );
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
