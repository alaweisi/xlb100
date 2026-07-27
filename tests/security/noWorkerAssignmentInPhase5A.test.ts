import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noWorkerAssignmentInPhase5A", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-dispatch-no-worker-assignment-yet.ps1");
  });

  it("migration 007 has no worker_id columns", () => {
    const sql = readFileSync(
      join(root, "db/migrations/007_dispatch_outbox_city_stream_foundation.sql"),
      "utf8",
    );
    expect(sql).not.toMatch(/worker_id|assigned_worker_id/);
  });

  it("workerMatcher is placeholder only", () => {
    const content = readFileSync(
      join(root, "backend/src/dispatch/workerMatcher.ts"),
      "utf8",
    );
    expect(content).toContain("phase5a_no_worker_assignment");
  });
});
