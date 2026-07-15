import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMigrationLockName,
  computeMigrationChecksum,
  normalizeMigrationSql,
  readMigrationLockTimeoutSeconds,
} from "../../backend/src/dal/migrationRunner.js";

const originalLockTimeout = process.env.MIGRATION_LOCK_TIMEOUT_SECONDS;

afterEach(() => {
  if (originalLockTimeout === undefined) {
    delete process.env.MIGRATION_LOCK_TIMEOUT_SECONDS;
  } else {
    process.env.MIGRATION_LOCK_TIMEOUT_SECONDS = originalLockTimeout;
  }
});

describe("migration runner core", () => {
  it("normalizes BOM, line endings, trailing whitespace, and terminal newline", () => {
    expect(normalizeMigrationSql("\uFEFF  SELECT 1;  \r\nSELECT 2;\t\r\n\r\n")).toBe(
      "SELECT 1;\nSELECT 2;\n",
    );
  });

  it("computes SHA-256 over normalized UTF-8 SQL", () => {
    const expected = createHash("sha256").update("SELECT 1;\n", "utf8").digest("hex");
    expect(computeMigrationChecksum("\uFEFFSELECT 1;  \r\n")).toBe(expected);
  });

  it("builds a deterministic MySQL-safe advisory lock name", () => {
    const lockName = buildMigrationLockName("xlb_local");
    expect(lockName).toMatch(/^xlb:migration:[0-9a-f]{32}$/u);
    expect(lockName).toBe(buildMigrationLockName("xlb_local"));
    expect(lockName.length).toBeLessThanOrEqual(64);
  });

  it("parses the lock timeout with fail-closed bounds", () => {
    delete process.env.MIGRATION_LOCK_TIMEOUT_SECONDS;
    expect(readMigrationLockTimeoutSeconds()).toBe(30);
    process.env.MIGRATION_LOCK_TIMEOUT_SECONDS = "0";
    expect(readMigrationLockTimeoutSeconds()).toBe(0);
    process.env.MIGRATION_LOCK_TIMEOUT_SECONDS = "3600";
    expect(readMigrationLockTimeoutSeconds()).toBe(3600);
    process.env.MIGRATION_LOCK_TIMEOUT_SECONDS = "3601";
    expect(() => readMigrationLockTimeoutSeconds()).toThrow(/integer between 0 and 3600/u);
    process.env.MIGRATION_LOCK_TIMEOUT_SECONDS = "1.5";
    expect(() => readMigrationLockTimeoutSeconds()).toThrow(/integer between 0 and 3600/u);
  });
});
