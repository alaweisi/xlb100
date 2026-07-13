import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const require = createRequire(path.join(root, "backend", "package.json"));
const mysql = require("mysql2/promise");
const migrationName = "056_phase28_review_reputation";
const migrationPath = path.join(root, "db", "migrations", `${migrationName}.sql`);
const migrationText = fs.readFileSync(migrationPath, "utf8");
const migrationsThrough055 = fs.readdirSync(path.join(root, "db", "migrations"))
  .filter((name) => /^(\d{3})_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 55)
  .sort();
const tables = [
  "review_moderation_decisions",
  "review_visibility_states",
  "review_appeals",
  "reputation_projection_generations",
  "reputation_projection_pointers",
  "reputation_worker_aggregates",
  "reputation_review_contributions",
  "review_content_access_audits",
  "reputation_projection_receipts",
];

function migrate(env = process.env) {
  const result = spawnSync(
    "npx",
    ["pnpm", "--filter", "@xlb/backend", "exec", "tsx", "src/dal/migrateCli.ts"],
    { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) throw new Error(`migration command exited ${result.status ?? 1}`);
}

async function scalar(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return String(Object.values(rows[0] ?? {})[0] ?? "");
}

async function snapshotSourceFacts(connection) {
  const [rows] = await connection.execute(
    `SELECT
       (SELECT COUNT(*) FROM event_outbox) AS event_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',event_id,city_code,event_type,aggregate_type,aggregate_id,status))),0)
          FROM event_outbox) AS event_hash,
       (SELECT COUNT(*) FROM order_reviews) AS review_count,
       (SELECT COALESCE(SUM(CRC32(CONCAT_WS('|',review_id,city_code,order_id,customer_id,worker_id,fulfillment_id,rating,comment,status))),0)
          FROM order_reviews) AS review_hash`,
  );
  return JSON.stringify(rows);
}

async function indexColumns(connection, table, index) {
  return scalar(
    connection,
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
       FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name=? AND index_name=?`,
    [table, index],
  );
}

async function verifySchema(connection, expectEmpty) {
  const marker = await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]);
  if (marker !== "1") throw new Error(`migration 056 marker expected 1, got ${marker}`);

  const eventMajor = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='event_outbox'
        AND column_name='event_major_version' AND is_nullable='NO' AND column_default='0'`,
  );
  if (eventMajor !== "1") throw new Error("event_outbox requires non-null event_major_version default 0");

  const actualTableCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema=DATABASE() AND table_name IN (${tables.map(() => "?").join(",")})`,
    tables,
  );
  if (actualTableCount !== String(tables.length)) {
    throw new Error(`expected ${tables.length} Phase28 tables, got ${actualTableCount}`);
  }

  const reviewCityFks = await scalar(
    connection,
    `SELECT COUNT(*) FROM (
       SELECT constraint_name
       FROM information_schema.key_column_usage
       WHERE constraint_schema=DATABASE() AND table_name='order_reviews'
         AND referenced_table_name IS NOT NULL
       GROUP BY constraint_name
       HAVING SUM(column_name='city_code') > 0
     ) scoped_review_fks`,
  );
  if (Number(reviewCityFks) < 3) throw new Error(`order_reviews composite city FKs expected >=3, got ${reviewCityFks}`);

  const expectedKeys = [
    ["review_visibility_states", "uq_review_visibility_review", "city_code,review_id"],
    ["review_moderation_decisions", "uq_review_moderation_version", "city_code,review_id,moderation_version"],
    ["review_appeals", "uq_review_appeal_active_subject_version", "city_code,review_id,moderation_version,appellant_type,appellant_id,active_appeal_guard"],
    ["review_appeals", "uq_review_appeal_withdrawal_idempotency", "city_code,appellant_type,appellant_id,withdrawal_idempotency_key_hash"],
    ["reputation_review_contributions", "uq_reputation_contribution_review", "city_code,generation_id,review_id"],
    ["reputation_projection_receipts", "uq_reputation_receipt_subscriber_event", "subscriber_id,event_id"],
  ];
  for (const [table, index, expected] of expectedKeys) {
    const actual = await indexColumns(connection, table, index);
    if (actual !== expected) throw new Error(`${table}.${index} expected ${expected}, got ${actual}`);
  }

  const legacyAppealUnique = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name='review_appeals'
        AND index_name='uq_review_appeal_subject_moderation_version'`,
  );
  if (legacyAppealUnique !== "0") throw new Error("terminal appeals must release the active-subject uniqueness guard");

  const withdrawalColumns = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='review_appeals'
        AND column_name IN ('withdrawal_idempotency_key_hash','withdrawal_request_fingerprint','withdrawn_at')`,
  );
  if (withdrawalColumns !== "3") throw new Error(`review appeal withdrawal columns expected 3, got ${withdrawalColumns}`);

  const activeGuard = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='review_appeals'
        AND column_name='active_appeal_guard'
        AND LOWER(generation_expression) LIKE '%open%'
        AND LOWER(generation_expression) NOT LIKE '%under_review%'`,
  );
  if (activeGuard !== "1") throw new Error("active appeal guard must cover open status only");

  const canonicalAppealStatus = await scalar(
    connection,
    `SELECT COUNT(*)
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON cc.constraint_schema=tc.constraint_schema AND cc.constraint_name=tc.constraint_name
      WHERE tc.constraint_schema=DATABASE() AND tc.table_name='review_appeals'
        AND tc.constraint_name='chk_review_appeal_status'
        AND LOWER(cc.check_clause) LIKE '%withdrawn%'
        AND LOWER(cc.check_clause) NOT LIKE '%under_review%'`,
  );
  if (canonicalAppealStatus !== "1") throw new Error("appeal status check must match the reachable Phase28 state machine");

  const cascadeCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.referential_constraints
      WHERE constraint_schema=DATABASE()
        AND (table_name IN (${tables.map(() => "?").join(",")}) OR table_name='order_reviews')
        AND (delete_rule='CASCADE' OR update_rule='CASCADE')`,
    tables,
  );
  if (cascadeCount !== "0") throw new Error("Phase28 evidence/city FKs must not cascade");

  const receiptMajorCheck = await scalar(
    connection,
    `SELECT COUNT(*)
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON cc.constraint_schema=tc.constraint_schema AND cc.constraint_name=tc.constraint_name
      WHERE tc.constraint_schema=DATABASE() AND tc.table_name='reputation_projection_receipts'
        AND tc.constraint_name='chk_reputation_receipt_major'
        AND REPLACE(REPLACE(LOWER(cc.check_clause),' ', ''),CHAR(96),'')
          LIKE '%event_major_version=1%'`,
  );
  if (receiptMajorCheck !== "1") throw new Error("Reputation receipt must accept exact major 1 only");

  if (expectEmpty) {
    for (const table of tables) {
      const count = await scalar(connection, `SELECT COUNT(*) FROM \`${table}\``);
      if (count !== "0") throw new Error(`${table} must start empty, got ${count}`);
    }
  }
}

async function applyMigrationsThrough055(connection) {
  for (const file of migrationsThrough055) {
    await connection.query(fs.readFileSync(path.join(root, "db", "migrations", file), "utf8"));
    const version = file.replace(/\.sql$/, "");
    await connection.execute(
      "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version=version",
      [version],
    );
  }
  const baseline = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='055_phase27b_notification_projection_foundation'",
  );
  if (baseline !== "1") throw new Error("temporary baseline requires migration 055 exactly once");
  const marker = await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]);
  if (marker !== "0") throw new Error("temporary 000-055 baseline must not contain migration 056");
}

const createTables = [...migrationText.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (JSON.stringify(createTables) !== JSON.stringify(tables)) {
  throw new Error(`migration 056 table ledger mismatch: ${createTables.join(",")}`);
}
const insertTargets = [...migrationText.matchAll(/INSERT\s+INTO\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (insertTargets.length !== 1 || insertTargets[0] !== "schema_migrations") {
  throw new Error(`migration 056 must contain no seed/data INSERT; found ${insertTargets.join(",")}`);
}
if (/\b057_/i.test(migrationText)) throw new Error("migration 056 must not reference Phase29 migration 057+");
if (/ON\s+(DELETE|UPDATE)\s+CASCADE/i.test(migrationText)) throw new Error("migration 056 must not cascade");

const common = { host: process.env.MYSQL_HOST ?? "127.0.0.1", port: Number(process.env.MYSQL_PORT ?? 3306) };
const currentConfig = {
  ...common,
  database: process.env.MYSQL_DATABASE ?? "xlb_local",
  user: process.env.MYSQL_USER ?? "xlb",
  password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
};

const current = await mysql.createConnection(currentConfig);
try {
  const sourceBefore = await snapshotSourceFacts(current);
  migrate();
  migrate();
  await verifySchema(current, false);
  if (await snapshotSourceFacts(current) !== sourceBefore) {
    throw new Error("migration 056 changed existing Outbox or Review source facts");
  }
} finally {
  await current.end();
}

const rootConfig = {
  ...common,
  user: process.env.MYSQL_ROOT_USER ?? "root",
  password: process.env.MYSQL_ROOT_PASSWORD ?? "xlb_root_password",
};
const rootConnection = await mysql.createConnection(rootConfig);

async function withTemporaryDatabase(label, callback) {
  const database = `xlb_phase28_gate_${label}_${Date.now()}`;
  if (!/^xlb_phase28_gate_[a-z]+_[0-9]+$/.test(database)) throw new Error("unsafe temporary database name");
  await rootConnection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  try {
    const env = { ...process.env, MYSQL_DATABASE: database, MYSQL_USER: rootConfig.user, MYSQL_PASSWORD: rootConfig.password };
    const connection = await mysql.createConnection({ ...rootConfig, database, multipleStatements: true });
    try { await callback({ connection, env }); } finally { await connection.end(); }
  } finally {
    await rootConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  }
}

try {
  await withTemporaryDatabase("empty", async ({ connection, env }) => {
    migrate(env);
    migrate(env);
    await verifySchema(connection, true);
  });

  await withTemporaryDatabase("upgrade", async ({ connection, env }) => {
    await applyMigrationsThrough055(connection);
    const sourceBefore = await snapshotSourceFacts(connection);
    migrate(env);
    migrate(env);
    await verifySchema(connection, true);
    if (await snapshotSourceFacts(connection) !== sourceBefore) {
      throw new Error("000-055 upgrade changed existing Outbox or Review source facts");
    }
  });

  await withTemporaryDatabase("partial", async ({ connection, env }) => {
    await applyMigrationsThrough055(connection);
    const sourceBefore = await snapshotSourceFacts(connection);
    const interruptionBoundary = migrationText.indexOf("CREATE TABLE IF NOT EXISTS review_appeals");
    if (interruptionBoundary <= 0) throw new Error("cannot locate true partial-DDL interruption boundary");
    await connection.query(migrationText.slice(0, interruptionBoundary));
    const partialTableCount = await scalar(
      connection,
      `SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema=DATABASE() AND table_name IN (${tables.map(() => "?").join(",")})`,
      tables,
    );
    if (partialTableCount !== "2") throw new Error(`true partial-DDL setup expected 2 tables, got ${partialTableCount}`);
    const partialMarker = await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]);
    if (partialMarker !== "0") throw new Error("true partial-DDL setup must not write migration 056 marker");

    migrate(env);
    migrate(env);
    await verifySchema(connection, true);
    if (await snapshotSourceFacts(connection) !== sourceBefore) {
      throw new Error("partial-DDL recovery changed existing Outbox or Review source facts");
    }
  });
} finally {
  await rootConnection.end();
}

process.stdout.write("Phase 28 migration 056 existing/empty/000-055-upgrade/true-partial-DDL/double-replay Gate PASS\n");
