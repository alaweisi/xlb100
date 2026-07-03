import { describe, it, expect } from "vitest";
import { runMigrations, getAppliedMigrations } from "../../backend/src/dal/migrationRunner.js";

const mysqlAvailable = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!mysqlAvailable)("migrationRunner integration", () => {
  it("runMigrations is idempotent", async () => {
    const first = await runMigrations();
    const second = await runMigrations();

    expect(first.applied.length + first.skipped.length).toBeGreaterThan(0);
    expect(second.skipped.length).toBeGreaterThan(0);
    expect(second.applied.length).toBe(0);

    const applied = await getAppliedMigrations();
    expect(applied).toContain("000_init");
    expect(applied).toContain("001_city_foundation");
  }, 30000);
});
