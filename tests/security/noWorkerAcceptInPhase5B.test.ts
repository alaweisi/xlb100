import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noWorkerAcceptInPhase5B", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-no-worker-accept-in-phase5b.ps1");
  });

  it("no accept route in worker module", () => {
    const content = readFileSync(
      join(root, "backend/src/worker/taskPoolRoutes.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/accept|POST.*task-pool/);
  });
});
