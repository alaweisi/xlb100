import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import type { Connection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDbPath } from "./paths.js";
import { getMysqlPool } from "./mysqlPool.js";

const SCHEMA_MIGRATIONS_BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(64) NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

const MIGRATION_CONTROL_VERSION = "058_stage2c2_migration_control";
const DEFAULT_MIGRATION_LOCK_TIMEOUT_SECONDS = 30;

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

type MigrationFile = {
  version: string;
  filePath: string;
  sql: string;
  checksum: string;
  hasTerminalMarker: boolean;
};

type AppliedMigrationRow = RowDataPacket & {
  version: string;
  checksum_sha256: string | null;
};

type CountRow = RowDataPacket & { count: number };
type LockRow = RowDataPacket & { acquired: number | null };
type InterruptedHistoryRow = RowDataPacket & {
  migration_execution_id: number;
  version: string;
  checksum_sha256: string;
  executor_id: string;
  applied_checksum_sha256: string | null;
  recovery_duration_ms: number | string;
};

export class MigrationLockTimeoutError extends Error {
  readonly code = "MIGRATION_LOCK_TIMEOUT";

  constructor(lockName: string, timeoutSeconds: number) {
    super(`Timed out after ${timeoutSeconds}s waiting for migration lock ${lockName}`);
    this.name = "MigrationLockTimeoutError";
  }
}

export class MigrationChecksumMismatchError extends Error {
  readonly code = "MIGRATION_CHECKSUM_MISMATCH";

  constructor(version: string, expected: string, actual: string) {
    super(`Migration checksum mismatch for ${version}: expected ${expected}, received ${actual}`);
    this.name = "MigrationChecksumMismatchError";
  }
}

export function normalizeMigrationSql(sql: string): string {
  return `${sql
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/gu, ""))
    .join("\n")
    .trim()}\n`;
}

export function computeMigrationChecksum(sql: string): string {
  return createHash("sha256").update(normalizeMigrationSql(sql), "utf8").digest("hex");
}

export function buildMigrationLockName(database: string): string {
  const databaseHash = createHash("sha256").update(database, "utf8").digest("hex").slice(0, 32);
  return `xlb:migration:${databaseHash}`;
}

export function readMigrationLockTimeoutSeconds(): number {
  const raw = process.env.MIGRATION_LOCK_TIMEOUT_SECONDS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MIGRATION_LOCK_TIMEOUT_SECONDS;
  if (!/^\d+$/u.test(raw.trim())) {
    throw new Error("MIGRATION_LOCK_TIMEOUT_SECONDS must be an integer between 0 and 3600");
  }
  const timeoutSeconds = Number.parseInt(raw, 10);
  if (timeoutSeconds < 0 || timeoutSeconds > 3600) {
    throw new Error("MIGRATION_LOCK_TIMEOUT_SECONDS must be an integer between 0 and 3600");
  }
  return timeoutSeconds;
}

function getMigrationDirectory(): string {
  const override = process.env.MIGRATION_DIR?.trim();
  return override ? path.resolve(override) : getDbPath("migrations");
}

function hasTerminalMigrationMarker(sql: string, version: string): boolean {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const terminalMarker = new RegExp(
    `INSERT\\s+INTO\\s+schema_migrations\\s*\\(\\s*version\\s*\\)\\s*` +
      `VALUES\\s*\\(\\s*'${escapedVersion}'\\s*\\)\\s*` +
      `ON\\s+DUPLICATE\\s+KEY\\s+UPDATE\\s+version\\s*=\\s*version\\s*;?\\s*$`,
    "iu",
  );
  return terminalMarker.test(normalizeMigrationSql(sql));
}

function listMigrationFiles(): MigrationFile[] {
  const directory = getMigrationDirectory();
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => {
      const filePath = path.join(directory, file);
      const sql = fs.readFileSync(filePath, "utf8");
      return {
        version: file.replace(/\.sql$/u, ""),
        filePath,
        sql,
        checksum: computeMigrationChecksum(sql),
        hasTerminalMarker: hasTerminalMigrationMarker(
          sql,
          file.replace(/\.sql$/u, ""),
        ),
      };
    });
}

function readLegacyChecksumBaseline(files: MigrationFile[]): ReadonlyMap<string, string> {
  const controlMigration = files.find((file) => file.version === MIGRATION_CONTROL_VERSION);
  if (!controlMigration) return new Map();

  const valuesMatch = controlMigration.sql.match(
    /INSERT\s+INTO\s+migration_checksum_baselines\s*\([^)]*\)\s*VALUES([\s\S]*?)ON\s+DUPLICATE\s+KEY\s+UPDATE/iu,
  );
  if (!valuesMatch?.[1]) {
    throw new Error(`${MIGRATION_CONTROL_VERSION} does not contain a checksum baseline`);
  }

  const baseline = new Map<string, string>();
  const tuplePattern = /\('([^']+)',\s*'([0-9a-f]{64})'\)/gu;
  for (const match of valuesMatch[1].matchAll(tuplePattern)) {
    const version = match[1];
    const checksum = match[2];
    if (version && checksum) baseline.set(version, checksum);
  }
  return baseline;
}

function assertLegacyBaselineMatchesFiles(
  files: MigrationFile[],
  baseline: ReadonlyMap<string, string>,
): void {
  if (baseline.size === 0) return;
  const legacyFiles = files.filter((file) => file.version < MIGRATION_CONTROL_VERSION);
  if (baseline.size !== legacyFiles.length) {
    throw new Error(
      `${MIGRATION_CONTROL_VERSION} checksum baseline has ${baseline.size} rows; expected ${legacyFiles.length}`,
    );
  }
  for (const file of legacyFiles) {
    const expected = baseline.get(file.version);
    if (!expected) {
      throw new Error(`${MIGRATION_CONTROL_VERSION} checksum baseline is missing ${file.version}`);
    }
    if (expected !== file.checksum) {
      throw new MigrationChecksumMismatchError(file.version, expected, file.checksum);
    }
  }
}

async function ensureSchemaMigrationsTable(connection: Connection): Promise<void> {
  await connection.query(SCHEMA_MIGRATIONS_BOOTSTRAP_SQL);
}

async function hasColumn(connection: Connection, table: string, column: string): Promise<boolean> {
  const [rows] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  );
  return Number(rows[0]?.count ?? 0) === 1;
}

async function hasTable(connection: Connection, table: string): Promise<boolean> {
  const [rows] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return Number(rows[0]?.count ?? 0) === 1;
}

async function hasMigrationControls(connection: Connection): Promise<boolean> {
  return hasColumn(connection, "schema_migrations", "checksum_sha256");
}

async function isMigrationRecorded(connection: Connection, version: string): Promise<boolean> {
  const [rows] = await connection.query<CountRow[]>(
    "SELECT COUNT(*) AS count FROM schema_migrations WHERE version = ?",
    [version],
  );
  return Number(rows[0]?.count ?? 0) === 1;
}

async function recoverInterruptedSuccessfulMigrations(
  connection: Connection,
  files: MigrationFile[],
): Promise<void> {
  if (!(await hasTable(connection, "migration_execution_history"))) return;
  const filesByVersion = new Map(files.map((file) => [file.version, file]));
  const [rows] = await connection.query<InterruptedHistoryRow[]>(
    `SELECT history.migration_execution_id,
            history.version,
            history.checksum_sha256,
            history.executor_id,
            applied.checksum_sha256 AS applied_checksum_sha256,
            GREATEST(
              0,
              TIMESTAMPDIFF(MICROSECOND, history.started_at, CURRENT_TIMESTAMP(3)) DIV 1000
            ) AS recovery_duration_ms
       FROM migration_execution_history AS history
       JOIN schema_migrations AS applied
         ON BINARY applied.version = BINARY history.version
      WHERE history.status = 'running'
      ORDER BY history.migration_execution_id`,
  );

  for (const row of rows) {
    const version = String(row.version);
    const migration = filesByVersion.get(version);
    const historyChecksum = String(row.checksum_sha256);
    const appliedChecksum = row.applied_checksum_sha256 === null
      ? null
      : String(row.applied_checksum_sha256);
    if (
      !migration?.hasTerminalMarker ||
      historyChecksum !== migration.checksum ||
      (appliedChecksum !== null && appliedChecksum !== migration.checksum)
    ) {
      continue;
    }

    const durationMs = Math.max(0, Number(row.recovery_duration_ms));
    // The file's terminal marker is committed only after all preceding SQL.
    // A matching running-history checksum therefore closes the crash window
    // between that marker and the runner's metadata/history updates.
    await connection.execute(
      `UPDATE schema_migrations
          SET checksum_sha256 = ?,
              execution_duration_ms = COALESCE(execution_duration_ms, ?),
              executor_id = COALESCE(executor_id, ?)
        WHERE version = ? AND (checksum_sha256 IS NULL OR checksum_sha256 = ?)`,
      [migration.checksum, durationMs, String(row.executor_id), version, migration.checksum],
    );
    await connection.execute(
      `UPDATE migration_execution_history
          SET status = 'succeeded',
              finished_at = CURRENT_TIMESTAMP(3),
              execution_duration_ms = ?,
              error_message = NULL
        WHERE migration_execution_id = ? AND status = 'running'`,
      [durationMs, Number(row.migration_execution_id)],
    );
  }
}

async function abandonInterruptedExecutionHistory(connection: Connection): Promise<void> {
  if (!(await hasTable(connection, "migration_execution_history"))) return;
  await connection.query(
    `UPDATE migration_execution_history
        SET status = 'failed',
            finished_at = CURRENT_TIMESTAMP(3),
            execution_duration_ms = GREATEST(
              0,
              TIMESTAMPDIFF(MICROSECOND, started_at, CURRENT_TIMESTAMP(3)) DIV 1000
            ),
            error_message = 'Migration process ended before recording completion'
      WHERE status = 'running'`,
  );
}

async function getAppliedRows(
  connection: Connection,
  controlsEnabled: boolean,
): Promise<AppliedMigrationRow[]> {
  const checksumProjection = controlsEnabled ? "checksum_sha256" : "NULL AS checksum_sha256";
  const [rows] = await connection.query<AppliedMigrationRow[]>(
    `SELECT version, ${checksumProjection} FROM schema_migrations ORDER BY id`,
  );
  return rows;
}

async function verifyDatabaseBaseline(
  connection: Connection,
  expectedBaseline: ReadonlyMap<string, string>,
): Promise<void> {
  if (expectedBaseline.size === 0) return;
  if (!(await hasTable(connection, "migration_checksum_baselines"))) {
    throw new Error("Migration checksum baseline table is missing after migration controls were applied");
  }
  const [rows] = await connection.query<AppliedMigrationRow[]>(
    "SELECT version, checksum_sha256 FROM migration_checksum_baselines ORDER BY version",
  );
  if (rows.length !== expectedBaseline.size) {
    throw new Error(
      `Database migration checksum baseline has ${rows.length} rows; expected ${expectedBaseline.size}`,
    );
  }
  for (const row of rows) {
    const expected = expectedBaseline.get(String(row.version));
    const actual = String(row.checksum_sha256);
    if (!expected) throw new Error(`Database migration checksum baseline has unknown ${row.version}`);
    if (expected !== actual) {
      throw new MigrationChecksumMismatchError(String(row.version), expected, actual);
    }
  }
}

async function validateAppliedMigrations(
  connection: Connection,
  files: MigrationFile[],
  baseline: ReadonlyMap<string, string>,
  controlsEnabled: boolean,
): Promise<Set<string>> {
  const filesByVersion = new Map(files.map((file) => [file.version, file]));
  const rows = await getAppliedRows(connection, controlsEnabled);
  const applied = new Set<string>();

  for (const row of rows) {
    const version = String(row.version);
    const file = filesByVersion.get(version);
    if (!file) throw new Error(`Applied migration ${version} has no matching SQL file`);
    applied.add(version);
    if (!controlsEnabled) continue;

    const storedChecksum = row.checksum_sha256 === null ? null : String(row.checksum_sha256);
    if (storedChecksum === null) {
      const safeBackfillChecksum = baseline.get(version);
      if (safeBackfillChecksum !== file.checksum && version !== MIGRATION_CONTROL_VERSION) {
        throw new Error(`Applied migration ${version} is missing a trusted checksum`);
      }
      await connection.query(
        "UPDATE schema_migrations SET checksum_sha256 = ? WHERE version = ? AND checksum_sha256 IS NULL",
        [file.checksum, version],
      );
      continue;
    }
    if (storedChecksum !== file.checksum) {
      throw new MigrationChecksumMismatchError(version, storedChecksum, file.checksum);
    }
  }
  return applied;
}

function getExecutorId(): string {
  const configured = process.env.MIGRATION_EXECUTOR_ID?.trim();
  return (configured || `${os.hostname()}:${process.pid}`).slice(0, 128);
}

async function startExecutionHistory(
  connection: Connection,
  migration: MigrationFile,
  executorId: string,
  startedAt: Date,
): Promise<number | null> {
  if (!(await hasTable(connection, "migration_execution_history"))) return null;
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO migration_execution_history
       (version, checksum_sha256, status, executor_id, started_at)
     VALUES (?, ?, 'running', ?, ?)`,
    [migration.version, migration.checksum, executorId, startedAt],
  );
  return result.insertId;
}

async function finishExecutionHistory(
  connection: Connection,
  historyId: number | null,
  migration: MigrationFile,
  executorId: string,
  startedAt: Date,
  durationMs: number,
  error: unknown,
): Promise<void> {
  if (!(await hasTable(connection, "migration_execution_history"))) return;
  const status = error === null ? "succeeded" : "failed";
  const errorMessage = error === null
    ? null
    : (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  if (historyId !== null) {
    await connection.execute(
      `UPDATE migration_execution_history
          SET status = ?, finished_at = CURRENT_TIMESTAMP(3), execution_duration_ms = ?, error_message = ?
        WHERE migration_execution_id = ?`,
      [status, durationMs, errorMessage, historyId],
    );
    return;
  }
  await connection.execute(
    `INSERT INTO migration_execution_history
       (version, checksum_sha256, status, executor_id, started_at, finished_at,
        execution_duration_ms, error_message)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP(3), ?, ?)`,
    [migration.version, migration.checksum, status, executorId, startedAt, durationMs, errorMessage],
  );
}

async function ensureSuccessfulMarker(
  connection: Connection,
  migration: MigrationFile,
  durationMs: number,
  executorId: string,
): Promise<void> {
  const controlsEnabled = await hasMigrationControls(connection);
  if (controlsEnabled) {
    await connection.execute(
      `INSERT INTO schema_migrations
         (version, checksum_sha256, execution_duration_ms, executor_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         checksum_sha256 = VALUES(checksum_sha256),
         execution_duration_ms = VALUES(execution_duration_ms),
         executor_id = VALUES(executor_id)`,
      [migration.version, migration.checksum, durationMs, executorId],
    );
    return;
  }
  await connection.execute(
    "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version = version",
    [migration.version],
  );
}

async function executeMigration(
  connection: Connection,
  migration: MigrationFile,
  executorId: string,
): Promise<void> {
  const startedAt = new Date();
  const historyId = await startExecutionHistory(connection, migration, executorId, startedAt);
  let sqlCompleted = false;
  try {
    await connection.query(migration.sql);
    sqlCompleted = true;
    const durationMs = Math.max(0, Date.now() - startedAt.getTime());
    await ensureSuccessfulMarker(connection, migration, durationMs, executorId);
  } catch (error) {
    const durationMs = Math.max(0, Date.now() - startedAt.getTime());
    const cleanupErrors: unknown[] = [];
    if (!sqlCompleted) {
      // Only a failed SQL batch may have written a false marker. Once the SQL
      // batch completed, its terminal marker is a success fact and must survive
      // metadata/history failures for restart reconciliation.
      try {
        await connection.execute(
          "DELETE FROM schema_migrations WHERE version = ?",
          [migration.version],
        );
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        await finishExecutionHistory(
          connection,
          historyId,
          migration,
          executorId,
          startedAt,
          durationMs,
          error,
        );
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (error instanceof Error && cleanupErrors.length > 0) {
      Object.defineProperty(error, "migrationCleanupErrors", {
        configurable: true,
        enumerable: false,
        value: cleanupErrors,
      });
    }
    throw error;
  }

  const durationMs = Math.max(0, Date.now() - startedAt.getTime());
  // A history failure must fail the CLI but never erase a successful marker.
  // The running row and matching marker/checksum are reconciled on the next run.
  await finishExecutionHistory(
    connection,
    historyId,
    migration,
    executorId,
    startedAt,
    durationMs,
    null,
  );
}

async function acquireMigrationLock(
  connection: Connection,
  lockName: string,
  timeoutSeconds: number,
): Promise<void> {
  const [rows] = await connection.query<LockRow[]>("SELECT GET_LOCK(?, ?) AS acquired", [
    lockName,
    timeoutSeconds,
  ]);
  if (Number(rows[0]?.acquired) !== 1) {
    throw new MigrationLockTimeoutError(lockName, timeoutSeconds);
  }
}

export async function runMigrations(): Promise<MigrationResult> {
  const env = await import("@xlb/config").then((module) => module.loadEnv());
  const files = listMigrationFiles();
  const baseline = readLegacyChecksumBaseline(files);
  assertLegacyBaselineMatchesFiles(files, baseline);
  const timeoutSeconds = readMigrationLockTimeoutSeconds();
  const lockName = buildMigrationLockName(env.mysqlDatabase);
  const executorId = getExecutorId();
  const applied: string[] = [];
  const skipped: string[] = [];
  const connection = await mysql.createConnection({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    multipleStatements: true,
  });
  let lockAcquired = false;
  let operationError: unknown;
  let result: MigrationResult | undefined;

  try {
    await acquireMigrationLock(connection, lockName, timeoutSeconds);
    lockAcquired = true;
    await ensureSchemaMigrationsTable(connection);
    let controlsEnabled = await hasMigrationControls(connection);
    if (controlsEnabled) {
      await recoverInterruptedSuccessfulMigrations(connection, files);
      await abandonInterruptedExecutionHistory(connection);
      // 058 uses idempotent DDL so an interrupted first attempt can be resumed.
      // The database baseline is authoritative only after its success marker exists.
      if (await isMigrationRecorded(connection, MIGRATION_CONTROL_VERSION)) {
        await verifyDatabaseBaseline(connection, baseline);
      }
    }
    let appliedVersions = await validateAppliedMigrations(
      connection,
      files,
      baseline,
      controlsEnabled,
    );

    for (const migration of files) {
      if (appliedVersions.has(migration.version)) {
        skipped.push(migration.version);
        continue;
      }
      await executeMigration(connection, migration, executorId);
      applied.push(migration.version);
      appliedVersions.add(migration.version);

      if (migration.version === MIGRATION_CONTROL_VERSION) {
        controlsEnabled = await hasMigrationControls(connection);
        if (!controlsEnabled) throw new Error("Migration controls were not installed by migration 058");
        await verifyDatabaseBaseline(connection, baseline);
        appliedVersions = await validateAppliedMigrations(
          connection,
          files,
          baseline,
          controlsEnabled,
        );
      }
    }

    result = { applied, skipped };
  } catch (error) {
    operationError = error;
  }

  let cleanupError: unknown;
  if (lockAcquired) {
    try {
      await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
    } catch (error) {
      cleanupError = error;
    }
  }
  try {
    await connection.end();
  } catch (error) {
    cleanupError ??= error;
  }

  if (operationError !== undefined) throw operationError;
  if (cleanupError !== undefined) throw cleanupError;
  if (result === undefined) throw new Error("Migration batch ended without a result");
  return result;
}

export async function getAppliedMigrations(): Promise<string[]> {
  const pool = getMysqlPool();
  await pool.query(SCHEMA_MIGRATIONS_BOOTSTRAP_SQL);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT version FROM schema_migrations ORDER BY id",
  );
  return rows.map((row) => String(row.version));
}
