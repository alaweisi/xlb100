import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noWorkerAcceptInPhase5B", () => {
  it("gate script passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-no-worker-accept-in-phase5b.ps1")}"`,
      { encoding: "utf-8" },
    );
  });

  it("no accept route in worker module", () => {
    const content = readFileSync(
      join(root, "backend/src/worker/taskPoolRoutes.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/accept|POST.*task-pool/);
  });
});
