import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noWorkerAssignmentInPhase5B", () => {
  it("dispatch_tasks migration has no worker fields", () => {
    const sql = readFileSync(
      join(root, "db/migrations/007_dispatch_outbox_city_stream_foundation.sql"),
      "utf8",
    );
    expect(sql).not.toMatch(/worker_id|assigned_worker_id/);
  });

  it("008 migration has no worker fields on dispatch_tasks", () => {
    const sql = readFileSync(
      join(root, "db/migrations/008_worker_pool_taskpool_readiness_foundation.sql"),
      "utf8",
    );
    expect(sql).not.toMatch(/ALTER TABLE dispatch_tasks/);
    expect(sql).not.toMatch(/assigned_worker/);
  });
});
