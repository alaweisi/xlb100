import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noFulfillmentInPhase5B", () => {
  it("gate script passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-no-fulfillment-in-worker-phase5b.ps1")}"`,
      { encoding: "utf-8" },
    );
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
