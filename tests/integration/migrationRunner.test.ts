import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  getAppliedMigrations,
  runMigrations,
} from "../../backend/src/dal/migrationRunner.js";

const mysqlAvailable = process.env.XLB_SKIP_DB_TESTS !== "1";
const managedEnvKeys = [
  "MYSQL_DATABASE",
  "MYSQL_USER",
  "MYSQL_PASSWORD",
  "MIGRATION_DIR",
  "MIGRATION_LOCK_TIMEOUT_SECONDS",
] as const;
const originalEnv = new Map(managedEnvKeys.map((key) => [key, process.env[key]]));

const adminConfig = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.MYSQL_PORT ?? "3306", 10),
  user: process.env.MYSQL_ROOT_USER ?? "root",
  password: process.env.MYSQL_ROOT_PASSWORD ?? "xlb_root_password",
};

type MigrationMetadataRow = RowDataPacket & {
  version: string;
  checksum_sha256: string | null;
  execution_duration_ms: number | string | null;
  executor_id: string | null;
};

type CountRow = RowDataPacket & { count: number };
type HistoryRow = RowDataPacket & { status: string };

let admin: Connection;
let database = "";
let migrationDir = "";
const migrationControlVersion = "058_stage2c2_migration_control";

function migrationSql(version: string, body: string): string {
  return `${body.trim()}\n\nINSERT INTO schema_migrations (version) VALUES ('${version}')\nON DUPLICATE KEY UPDATE version = version;\n`;
}

function writeMigration(version: string, body: string): string {
  const sql = migrationSql(version, body);
  writeFileSync(join(migrationDir, `${version}.sql`), sql, "utf8");
  return sql;
}

function writeStandardMigrations(): Map<string, string> {
  const sources = new Map<string, string>();
  sources.set(
    "000_fixture_base",
    writeMigration(
      "000_fixture_base",
      `
          CREATE TABLE fixture_records (
            id INT NOT NULL PRIMARY KEY,
            value VARCHAR(64) NOT NULL
          );
          INSERT INTO fixture_records (id, value) VALUES (1, 'base');
        `,
    ),
  );
  sources.set(
    "001_fixture_second",
    writeMigration(
      "001_fixture_second",
      `
          CREATE TABLE fixture_second (
            id INT NOT NULL PRIMARY KEY
          );
        `,
    ),
  );
  sources.set(migrationControlVersion, writeControlMigration(sources));
  return sources;
}

function checksum(sql: string): string {
  const normalized = `${sql
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/u, ""))
    .join("\n")
    .trim()}\n`;
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function writeControlMigration(legacySources: ReadonlyMap<string, string>): string {
  const baselineValues = [...legacySources]
    .map(([version, sql]) => `('${version}', '${checksum(sql)}')`)
    .join(",\n          ");
  return writeMigration(
    migrationControlVersion,
    `
      SET @add_checksum_sql = (
        SELECT IF(
          EXISTS(
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'schema_migrations'
              AND column_name = 'checksum_sha256'
          ),
          'SELECT 1',
          'ALTER TABLE schema_migrations ADD COLUMN checksum_sha256 CHAR(64) NULL AFTER version'
        )
      );
      PREPARE add_checksum_stmt FROM @add_checksum_sql;
      EXECUTE add_checksum_stmt;
      DEALLOCATE PREPARE add_checksum_stmt;

      SET @add_duration_sql = (
        SELECT IF(
          EXISTS(
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'schema_migrations'
              AND column_name = 'execution_duration_ms'
          ),
          'SELECT 1',
          'ALTER TABLE schema_migrations ADD COLUMN execution_duration_ms BIGINT UNSIGNED NULL AFTER applied_at'
        )
      );
      PREPARE add_duration_stmt FROM @add_duration_sql;
      EXECUTE add_duration_stmt;
      DEALLOCATE PREPARE add_duration_stmt;

      SET @add_executor_sql = (
        SELECT IF(
          EXISTS(
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = 'schema_migrations'
              AND column_name = 'executor_id'
          ),
          'SELECT 1',
          'ALTER TABLE schema_migrations ADD COLUMN executor_id VARCHAR(128) NULL AFTER execution_duration_ms'
        )
      );
      PREPARE add_executor_stmt FROM @add_executor_sql;
      EXECUTE add_executor_stmt;
      DEALLOCATE PREPARE add_executor_stmt;

      CREATE TABLE IF NOT EXISTS migration_checksum_baselines (
        version VARCHAR(64) NOT NULL PRIMARY KEY,
        checksum_sha256 CHAR(64) NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      );
      INSERT INTO migration_checksum_baselines (version, checksum_sha256)
        VALUES ${baselineValues}
        ON DUPLICATE KEY UPDATE checksum_sha256 = VALUES(checksum_sha256);
      UPDATE schema_migrations AS applied
        JOIN migration_checksum_baselines AS baseline ON baseline.version = applied.version
        SET applied.checksum_sha256 = baseline.checksum_sha256
        WHERE applied.checksum_sha256 IS NULL;

      CREATE TABLE IF NOT EXISTS migration_execution_history (
        migration_execution_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        version VARCHAR(64) NOT NULL,
        checksum_sha256 CHAR(64) NOT NULL,
        status ENUM('running', 'succeeded', 'failed') NOT NULL,
        executor_id VARCHAR(128) NOT NULL,
        started_at TIMESTAMP(3) NOT NULL,
        finished_at TIMESTAMP(3) NULL,
        execution_duration_ms BIGINT UNSIGNED NULL,
        error_message VARCHAR(2000) NULL,
        PRIMARY KEY (migration_execution_id)
      );
    `,
  );
}

function lockNameFor(targetDatabase: string): string {
  const digest = createHash("sha256").update(targetDatabase, "utf8").digest("hex");
  return `xlb:migration:${digest.slice(0, 32)}`;
}

async function expectMigrationError(
  action: Promise<unknown>,
  expectedCode: "MIGRATION_CHECKSUM_MISMATCH" | "MIGRATION_LOCK_TIMEOUT",
): Promise<Error & { code?: string }> {
  try {
    await action;
    throw new Error(`Expected migration error ${expectedCode}`);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as { code?: string }).code).toBe(expectedCode);
    return error as Error & { code?: string };
  }
}

async function migrationRows(): Promise<MigrationMetadataRow[]> {
  const connection = await mysql.createConnection({ ...adminConfig, database });
  try {
    const [rows] = await connection.query<MigrationMetadataRow[]>(
      `SELECT version, checksum_sha256, execution_duration_ms, executor_id
       FROM schema_migrations ORDER BY version`,
    );
    return rows;
  } finally {
    await connection.end();
  }
}

async function countRows(table: string): Promise<number> {
  if (!/^[a-z0-9_]+$/u.test(table)) throw new Error("Unsafe fixture table name");
  const connection = await mysql.createConnection({ ...adminConfig, database });
  try {
    const [rows] = await connection.query<CountRow[]>(`SELECT COUNT(*) AS count FROM ${table}`);
    return Number(rows[0]?.count ?? 0);
  } finally {
    await connection.end();
  }
}

function restoreEnvironment(): void {
  for (const key of managedEnvKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe.skipIf(!mysqlAvailable).sequential("migrationRunner reliability integration", () => {
  beforeAll(async () => {
    admin = await mysql.createConnection(adminConfig);
  });

  beforeEach(async () => {
    await closeMysqlPool();
    database = `xlb_migration_test_${randomUUID().replaceAll("-", "")}`;
    migrationDir = mkdtempSync(join(tmpdir(), "xlb-migrations-"));
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    process.env.MYSQL_DATABASE = database;
    process.env.MYSQL_USER = adminConfig.user;
    process.env.MYSQL_PASSWORD = adminConfig.password;
    process.env.MIGRATION_DIR = migrationDir;
    process.env.MIGRATION_LOCK_TIMEOUT_SECONDS = "1";
  });

  afterEach(async () => {
    await closeMysqlPool();
    if (database) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    if (migrationDir) rmSync(migrationDir, { recursive: true, force: true });
    database = "";
    migrationDir = "";
    restoreEnvironment();
  });

  afterAll(async () => {
    restoreEnvironment();
    await admin.end();
  });

  it("records the independently computed SHA-256 checksum for every applied migration", async () => {
    const sourceByVersion = writeStandardMigrations();

    const result = await runMigrations();
    const rows = await migrationRows();

    expect(result.applied).toEqual([...sourceByVersion.keys()]);
    expect(rows).toHaveLength(sourceByVersion.size);
    for (const row of rows) {
      expect(row.checksum_sha256).toBe(checksum(sourceByVersion.get(row.version)!));
    }
    const control = rows.find((row) => row.version === migrationControlVersion);
    expect(Number(control?.execution_duration_ms)).toBeGreaterThanOrEqual(0);
    expect(control?.executor_id).toBeTruthy();
  });

  it("fails closed before executing pending SQL when an applied checksum was tampered", async () => {
    writeStandardMigrations();
    await runMigrations();
    writeMigration(
      "059_must_not_run",
      "CREATE TABLE checksum_guard_failed (id INT NOT NULL PRIMARY KEY);",
    );
    await admin.query(
      `UPDATE \`${database}\`.schema_migrations
       SET checksum_sha256 = ? WHERE version = '000_fixture_base'`,
      ["0".repeat(64)],
    );

    await expectMigrationError(runMigrations(), "MIGRATION_CHECKSUM_MISMATCH");

    const [tables] = await admin.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'checksum_guard_failed'`,
      [database],
    );
    expect(Number(tables[0]?.count ?? 0)).toBe(0);
  });

  it("fails fast when another connection owns the database migration advisory lock", async () => {
    writeStandardMigrations();
    const lockConnection = await mysql.createConnection({ ...adminConfig, database });
    const lockName = lockNameFor(database);
    const [lockRows] = await lockConnection.query<(RowDataPacket & { acquired: number })[]>(
      "SELECT GET_LOCK(?, 0) AS acquired",
      [lockName],
    );
    expect(Number(lockRows[0]?.acquired)).toBe(1);

    const startedAt = Date.now();
    try {
      await expectMigrationError(runMigrations(), "MIGRATION_LOCK_TIMEOUT");
    } finally {
      await lockConnection.query("SELECT RELEASE_LOCK(?)", [lockName]);
      await lockConnection.end();
    }

    expect(Date.now() - startedAt).toBeLessThan(3_500);
    const [tables] = await admin.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'fixture_records'`,
      [database],
    );
    expect(Number(tables[0]?.count ?? 0)).toBe(0);
  });

  it("is repeatable without new metadata or domain writes", async () => {
    const sourceByVersion = writeStandardMigrations();
    const first = await runMigrations();
    const metadataAfterFirst = await migrationRows();
    const second = await runMigrations();
    const metadataAfterSecond = await migrationRows();

    expect(first.applied).toEqual([...sourceByVersion.keys()]);
    expect(second).toEqual({ applied: [], skipped: [...sourceByVersion.keys()] });
    expect(metadataAfterSecond).toEqual(metadataAfterFirst);
    expect(await countRows("fixture_records")).toBe(1);
    expect(await getAppliedMigrations()).toEqual([...sourceByVersion.keys()]);
  });

  it("records a failed attempt but never writes a successful marker for failed SQL", async () => {
    writeStandardMigrations();
    writeMigration(
      "059_fixture_failure",
      `
        CREATE TABLE fixture_partial_ddl (id INT NOT NULL PRIMARY KEY);
        THIS IS DELIBERATELY INVALID SQL;
      `,
    );

    await expect(runMigrations()).rejects.toThrow();

    expect(await getAppliedMigrations()).toEqual([
      "000_fixture_base",
      "001_fixture_second",
      migrationControlVersion,
    ]);
    const connection = await mysql.createConnection({ ...adminConfig, database });
    try {
      const [history] = await connection.query<HistoryRow[]>(
        `SELECT status FROM migration_execution_history
         WHERE version = '059_fixture_failure' ORDER BY started_at DESC`,
      );
      expect(history[0]?.status).toBe("failed");
      const [marker] = await connection.query<CountRow[]>(
        `SELECT COUNT(*) AS count FROM schema_migrations
         WHERE version = '059_fixture_failure'`,
      );
      expect(Number(marker[0]?.count ?? 0)).toBe(0);
    } finally {
      await connection.end();
    }

    writeMigration(
      "059_fixture_failure",
      `
        CREATE TABLE IF NOT EXISTS fixture_partial_ddl (id INT NOT NULL PRIMARY KEY);
        INSERT INTO fixture_partial_ddl (id) VALUES (1)
          ON DUPLICATE KEY UPDATE id = id;
      `,
    );
    const recovery = await runMigrations();
    expect(recovery.applied).toEqual(["059_fixture_failure"]);
    expect(await getAppliedMigrations()).toContain("059_fixture_failure");
    expect(await countRows("fixture_partial_ddl")).toBe(1);
  });

  it("backfills a checksum for a pre-058 legacy marker after the reliability migration", async () => {
    const legacySql = writeMigration(
      "000_fixture_base",
      "CREATE TABLE fixture_records (id INT NOT NULL PRIMARY KEY);",
    );
    writeControlMigration(new Map([["000_fixture_base", legacySql]]));
    await admin.query(`
      CREATE TABLE \`${database}\`.schema_migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(64) NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await admin.query(
      `CREATE TABLE \`${database}\`.fixture_records (id INT NOT NULL PRIMARY KEY)`,
    );
    await admin.query(
      `INSERT INTO \`${database}\`.schema_migrations (version) VALUES ('000_fixture_base')`,
    );

    const result = await runMigrations();
    const rows = await migrationRows();
    const legacy = rows.find((row) => row.version === "000_fixture_base");

    expect(result.skipped).toContain("000_fixture_base");
    expect(result.applied).toContain(migrationControlVersion);
    expect(legacy?.checksum_sha256).toBe(checksum(legacySql));
    expect(legacy?.executor_id).toBeNull();
  });
});
