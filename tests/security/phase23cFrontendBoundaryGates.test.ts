import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("Phase 23C frontend engineering boundary gates", () => {
  it("preserves locked migrations and frontend-only scope", () => {
    expect(runPowerShellGate("check-phase23c-boundaries.ps1")).toContain(
      "check-phase23c-boundaries: passed",
    );
  }, 15_000);

  it("keeps migration 045 marker-only", () => {
    const migration = source("db/migrations/045_phase23c_frontend_engineering.sql");
    expect(migration).toMatch(/INSERT\s+INTO\s+schema_migrations/i);
    expect(migration).not.toMatch(/^\s*(CREATE|ALTER|DROP|TRUNCATE|UPDATE|DELETE)\b/im);
  });

  it("keeps the hosted gate hard-blocking", () => {
    const workflow = source(".github/workflows/phase23c-frontend-gates.yml");
    expect(workflow).toContain("pnpm gate:phase23c");
    expect(workflow).not.toContain("continue-on-error");
  });
});
