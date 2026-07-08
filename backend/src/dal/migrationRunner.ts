import fs from "node:fs";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";
import { getDbPath } from "./paths.js";
import { getMysqlPool } from "./mysqlPool.js";

const SCHEMA_MIGRATIONS_BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(64) NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
`;

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

function listMigrationFiles(): string[] {
  const dir = getDbPath("migrations");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function isMigrationApplied(
  version: string,
): Promise<boolean> {
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT version FROM schema_migrations WHERE version = ? LIMIT 1",
    [version],
  );
  return rows.length > 0;
}

async function recordMigration(version: string): Promise<void> {
  const pool = getMysqlPool();
  await pool.query(
    "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version = version",
    [version],
  );
}

async function ensureSchemaMigrationsTable(): Promise<void> {
  const pool = getMysqlPool();
  await pool.query(SCHEMA_MIGRATIONS_BOOTSTRAP_SQL);
}

async function executeSqlFile(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, "utf8");
  const env = await import("@xlb/config").then((m) => m.loadEnv());
  const connection = await mysql.createConnection({
    host: env.mysqlHost,
    port: env.mysqlPort,
    user: env.mysqlUser,
    password: env.mysqlPassword,
    database: env.mysqlDatabase,
    multipleStatements: true,
  });
  try {
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}

export async function runMigrations(): Promise<MigrationResult> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const files = listMigrationFiles();

  await ensureSchemaMigrationsTable();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (await isMigrationApplied(version)) {
      skipped.push(version);
      continue;
    }
    await executeSqlFile(getDbPath("migrations", file));
    if (!(await isMigrationApplied(version))) {
      await recordMigration(version);
    }
    applied.push(version);
  }

  return { applied, skipped };
}

export async function getAppliedMigrations(): Promise<string[]> {
  await ensureSchemaMigrationsTable();
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT version FROM schema_migrations ORDER BY id",
  );
  return rows.map((r) => String(r.version));
}
