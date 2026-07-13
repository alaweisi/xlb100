import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const require = createRequire(path.join(root, "backend", "package.json"));
const mysql = require("mysql2/promise");
const migrationName = "055_phase27b_notification_projection_foundation";
const migrationPath = path.join(root, "db", "migrations", `${migrationName}.sql`);
const migrationText = fs.readFileSync(migrationPath, "utf8");
const migrationsThrough054 = fs.readdirSync(path.join(root, "db", "migrations"))
  .filter((name) => /^(\d{3})_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 54)
  .sort();
const tables = [
  "notification_templates",
  "notification_template_revisions",
  "notification_recipient_preferences",
  "notification_records",
  "notification_delivery_receipts",
  "notification_recipient_states",
  "notification_actions",
  "notification_tombstones",
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

async function rowsSnapshot(connection, sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return JSON.stringify(rows);
}

async function protectedSchemaSnapshot(connection) {
  const columns = await rowsSnapshot(
    connection,
    `SELECT table_name, ordinal_position, column_name, column_type, is_nullable,
            column_default, extra, generation_expression
       FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name NOT LIKE 'notification\\_%'
      ORDER BY table_name, ordinal_position`,
  );
  const indexes = await rowsSnapshot(
    connection,
    `SELECT table_name, index_name, non_unique, seq_in_index, column_name,
            collation, sub_part, nullable
       FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name NOT LIKE 'notification\\_%'
      ORDER BY table_name, index_name, seq_in_index`,
  );
  const references = await rowsSnapshot(
    connection,
    `SELECT table_name, constraint_name, unique_constraint_name,
            referenced_table_name, update_rule, delete_rule
       FROM information_schema.referential_constraints
      WHERE constraint_schema=DATABASE() AND table_name NOT LIKE 'notification\\_%'
      ORDER BY table_name, constraint_name`,
  );
  return JSON.stringify({ columns, indexes, references });
}

async function sourceDataSnapshot(connection) {
  return rowsSnapshot(
    connection,
    `SELECT COUNT(*) AS row_count,
            COALESCE(SUM(CRC32(CONCAT_WS('|', event_id, city_code, event_type,
              aggregate_type, aggregate_id, status, attempt_count))), 0) AS identity_checksum
       FROM event_outbox`,
  );
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
  const marker = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version=?",
    [migrationName],
  );
  if (marker !== "1") throw new Error(`migration 055 marker expected 1, got ${marker}`);

  const actualTables = await rowsSnapshot(
    connection,
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema=DATABASE() AND table_name LIKE 'notification\\_%'
      ORDER BY table_name`,
  );
  const expectedTables = JSON.stringify([...tables].sort().map((TABLE_NAME) => ({ TABLE_NAME })));
  if (actualTables !== expectedTables) {
    throw new Error(`Notification table set mismatch: ${actualTables}`);
  }

  const businessKey = await indexColumns(
    connection,
    "notification_records",
    "uq_notification_record_business",
  );
  if (businessKey !== "city_code,recipient_type,recipient_id,source_event_id,template_revision_id") {
    throw new Error(`notification business key mismatch: ${businessKey}`);
  }
  const receiptKey = await indexColumns(
    connection,
    "notification_delivery_receipts",
    "uq_notification_receipt_subscriber_event",
  );
  if (receiptKey !== "subscriber_id,event_id") {
    throw new Error(`notification receipt idempotency key mismatch: ${receiptKey}`);
  }
  const stateKey = await indexColumns(
    connection,
    "notification_recipient_states",
    "uq_notification_state_recipient",
  );
  if (stateKey !== "city_code,notification_id,recipient_type,recipient_id") {
    throw new Error(`notification state key mismatch: ${stateKey}`);
  }

  const recordDeliveryFk = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.key_column_usage
      WHERE table_schema=DATABASE() AND table_name='notification_records'
        AND constraint_name='fk_notification_record_delivery'
        AND referenced_table_name='platform_event_deliveries'`,
  );
  if (recordDeliveryFk !== "2") throw new Error(`record delivery FK expected 2 columns, got ${recordDeliveryFk}`);
  const ambiguousDeliveryColumns = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE()
        AND ((table_name='notification_records' AND column_name='platform_delivery_id')
          OR (table_name='notification_delivery_receipts' AND column_name='delivery_id'))`,
  );
  if (ambiguousDeliveryColumns !== "0") {
    throw new Error("Notification persistence must use only the canonical unique subscriber/event delivery reference");
  }
  const receiptTargetFk = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.key_column_usage
      WHERE table_schema=DATABASE() AND table_name='notification_delivery_receipts'
        AND constraint_name='fk_notification_receipt_record'
        AND referenced_table_name='notification_records'`,
  );
  if (receiptTargetFk !== "7") {
    throw new Error(`receipt target FK expected 7 columns, got ${receiptTargetFk}`);
  }

  const frozenHashColumns = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE()
        AND ((table_name='notification_records' AND column_name='render_parameters_hash'
              AND column_type='char(64)' AND is_nullable='NO')
          OR (table_name='notification_delivery_receipts'
              AND column_name IN ('source_payload_hash')
              AND column_type='char(64)' AND is_nullable='NO'))`,
  );
  if (frozenHashColumns !== "2") {
    throw new Error(`record/receipt frozen hash columns expected 2, got ${frozenHashColumns}`);
  }
  const receiptFrozenColumns = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='notification_delivery_receipts'
        AND column_name IN ('template_revision_id','source_payload_hash','result')
        AND is_nullable='NO'`,
  );
  if (receiptFrozenColumns !== "3") {
    throw new Error(`receipt frozen identity/result columns expected 3, got ${receiptFrozenColumns}`);
  }
  const actionRecipientColumns = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='notification_actions'
        AND column_name IN ('recipient_type_copy','recipient_id_copy')
        AND is_nullable='NO'`,
  );
  if (actionRecipientColumns !== "2") {
    throw new Error(`action recipient audit columns expected 2, got ${actionRecipientColumns}`);
  }
  const actionIdempotencyKey = await indexColumns(
    connection,
    "notification_actions",
    "uq_notification_action_recipient_idempotency",
  );
  if (actionIdempotencyKey !== "city_code,recipient_type_copy,recipient_id_copy,idempotency_key_hash") {
    throw new Error(`action idempotency key mismatch: ${actionIdempotencyKey}`);
  }
  const receiptResultCheck = await scalar(
    connection,
    `SELECT COUNT(*)
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON cc.constraint_schema=tc.constraint_schema
        AND cc.constraint_name=tc.constraint_name
      WHERE tc.constraint_schema=DATABASE()
        AND tc.table_name='notification_delivery_receipts'
        AND tc.constraint_name='chk_notification_receipt_result'
        AND LOWER(cc.check_clause) LIKE '%applied%'`,
  );
  if (receiptResultCheck !== "1") throw new Error("receipt result must be restricted to applied");

  const cascadeCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.referential_constraints
      WHERE constraint_schema=DATABASE() AND table_name LIKE 'notification\\_%'
        AND (delete_rule='CASCADE' OR update_rule='CASCADE')`,
  );
  if (cascadeCount !== "0") throw new Error("Notification FKs must not cascade evidence");

  const cityCheckCount = await scalar(
    connection,
    `SELECT COUNT(*)
       FROM information_schema.table_constraints tc
       JOIN information_schema.check_constraints cc
         ON cc.constraint_schema=tc.constraint_schema
        AND cc.constraint_name=tc.constraint_name
      WHERE tc.constraint_schema=DATABASE()
        AND tc.table_name LIKE 'notification\\_%'
        AND tc.constraint_type='CHECK'
        AND LOWER(cc.check_clause) LIKE '%city_code%__global__%'`,
  );
  if (cityCheckCount !== String(tables.length)) {
    throw new Error(`each Notification table requires a real-city check; got ${cityCheckCount}`);
  }

  const activePointerCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name LIKE 'notification\\_%'
        AND column_name IN ('active_revision_id','active_template_revision_id','is_active')`,
  );
  if (activePointerCount !== "0") throw new Error("B1 must not install an active template pointer");

  const tombstoneColumns = await rowsSnapshot(
    connection,
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='notification_tombstones'
      ORDER BY ordinal_position`,
  );
  for (const forbidden of ["raw", "content", "params", "token", "provider", "rendered"]) {
    if (tombstoneColumns.toLowerCase().includes(forbidden)) {
      throw new Error(`tombstone contains forbidden ${forbidden} material`);
    }
  }

  if (expectEmpty) {
    for (const table of tables) {
      const count = await scalar(connection, `SELECT COUNT(*) FROM \`${table}\``);
      if (count !== "0") throw new Error(`${table} must start empty, got ${count}`);
    }
  }
}

async function applyMigrationsThrough054(connection) {
  for (const file of migrationsThrough054) {
    await connection.query(fs.readFileSync(path.join(root, "db", "migrations", file), "utf8"));
    const version = file.replace(/\.sql$/, "");
    await connection.execute(
      "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version=version",
      [version],
    );
  }
  const baseline = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='054_phase27a_platform_delivery_foundation'",
  );
  if (baseline !== "1") throw new Error("temporary baseline requires migration 054 exactly once");
  const marker055 = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version=?",
    [migrationName],
  );
  if (marker055 !== "0") throw new Error("temporary 000-054 baseline must not contain migration 055");
}

const createTables = [...migrationText.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (JSON.stringify(createTables) !== JSON.stringify(tables)) {
  throw new Error(`migration 055 must create the exact ordered 8-table set; got ${createTables.join(",")}`);
}
const insertTargets = [...migrationText.matchAll(/INSERT\s+INTO\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (insertTargets.length !== 1 || insertTargets[0] !== "schema_migrations") {
  throw new Error(`migration 055 must contain no seed/data INSERT; found ${insertTargets.join(",")}`);
}
if (/\b056_/i.test(migrationText)) throw new Error("migration 055 must not reference migration 056+");
if (/ON\s+(DELETE|UPDATE)\s+CASCADE/i.test(migrationText)) throw new Error("migration 055 must not cascade");
if (/CREATE\s+TABLE[^;]*(external|channel|provider|retry|lease|dead.?letter|dlq)/is.test(migrationText)) {
  throw new Error("migration 055 must not create external-channel or independent retry/lease/DLQ schema");
}

const common = {
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number(process.env.MYSQL_PORT ?? 3306),
};
const currentConfig = {
  ...common,
  database: process.env.MYSQL_DATABASE ?? "xlb_local",
  user: process.env.MYSQL_USER ?? "xlb",
  password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
};

const current = await mysql.createConnection(currentConfig);
try {
  const baseline = await scalar(
    current,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='054_phase27a_platform_delivery_foundation'",
  );
  if (baseline !== "1") throw new Error("existing upgrade Gate requires migration 054 before 055");
  const protectedBefore = await protectedSchemaSnapshot(current);
  const sourceBefore = await sourceDataSnapshot(current);
  migrate();
  await verifySchema(current, true);
  if (await protectedSchemaSnapshot(current) !== protectedBefore) {
    throw new Error("migration 055 changed the pre-existing protected schema");
  }
  if (await sourceDataSnapshot(current) !== sourceBefore) {
    throw new Error("migration 055 changed source event_outbox data");
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
  const database = `xlb_phase27b_gate_${label}_${Date.now()}`;
  if (!/^xlb_phase27b_gate_[a-z]+_[0-9]+$/.test(database)) {
    throw new Error("unsafe temporary database name");
  }
  await rootConnection.query(
    `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  try {
    const env = {
      ...process.env,
      MYSQL_DATABASE: database,
      MYSQL_USER: rootConfig.user,
      MYSQL_PASSWORD: rootConfig.password,
    };
    const connection = await mysql.createConnection({ ...rootConfig, database, multipleStatements: true });
    try {
      await callback({ connection, env });
    } finally {
      await connection.end();
    }
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
    await applyMigrationsThrough054(connection);
    const protectedBefore = await protectedSchemaSnapshot(connection);
    const sourceBefore = await sourceDataSnapshot(connection);
    migrate(env);
    await verifySchema(connection, true);
    migrate(env);
    await verifySchema(connection, true);
    if (await protectedSchemaSnapshot(connection) !== protectedBefore) {
      throw new Error("000-054 upgrade changed the pre-existing protected schema");
    }
    if (await sourceDataSnapshot(connection) !== sourceBefore) {
      throw new Error("000-054 upgrade changed source event_outbox data");
    }
  });

  await withTemporaryDatabase("partial", async ({ connection, env }) => {
    await applyMigrationsThrough054(connection);
    const protectedBefore = await protectedSchemaSnapshot(connection);
    const sourceBefore = await sourceDataSnapshot(connection);
    const interruptionBoundary = migrationText.indexOf(
      "CREATE TABLE IF NOT EXISTS notification_delivery_receipts",
    );
    if (interruptionBoundary <= 0) throw new Error("cannot locate partial-DDL interruption boundary");
    await connection.query(migrationText.slice(0, interruptionBoundary));
    const partialTableCount = await scalar(
      connection,
      `SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema=DATABASE() AND table_name LIKE 'notification\\_%'`,
    );
    if (partialTableCount !== "4") {
      throw new Error(`true partial-DDL setup expected 4 tables, got ${partialTableCount}`);
    }
    const partialMarker = await scalar(
      connection,
      "SELECT COUNT(*) FROM schema_migrations WHERE version=?",
      [migrationName],
    );
    if (partialMarker !== "0") throw new Error("partial-DDL setup must not write migration 055 marker");

    migrate(env);
    await verifySchema(connection, true);
    migrate(env);
    await verifySchema(connection, true);
    if (await protectedSchemaSnapshot(connection) !== protectedBefore) {
      throw new Error("partial-DDL recovery changed the pre-existing protected schema");
    }
    if (await sourceDataSnapshot(connection) !== sourceBefore) {
      throw new Error("partial-DDL recovery changed source event_outbox data");
    }
  });
} finally {
  await rootConnection.end();
}

process.stdout.write(
  "Phase 27B migration 055 existing/empty/000-054-upgrade/true-partial-DDL/double-replay Gate PASS\n",
);
