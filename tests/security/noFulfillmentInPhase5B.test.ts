import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noFulfillmentInPhase5B", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-no-fulfillment-in-worker-phase5b.ps1");
  });

  it("worker module does not import fulfillment", () => {
    for (const file of [
      "backend/src/worker/taskPoolService.ts",
      "backend/src/worker/workerService.ts",
      "backend/src/worker/taskPoolRoutes.ts",
    ]) {
      const content = readFileSync(join(root, file), "utf8");
      expect(content).not.toMatch(/from ['"].*fulfillment/);
    }
  });
});
