import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const require = createRequire(path.join(root, "backend", "package.json"));
const mysql = require("mysql2/promise");
const migrationPath = path.join(root, "db", "migrations", "054_phase27a_platform_delivery_foundation.sql");
const migrationText = fs.readFileSync(migrationPath, "utf8");
const migrationFilesThrough053 = fs.readdirSync(path.join(root, "db", "migrations"))
  .filter((name) => /^(\d{3})_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 53)
  .sort();
const tables = [
  "platform_event_subscribers",
  "platform_event_subscriptions",
  "platform_event_materialization_checkpoints",
  "platform_event_deliveries",
  "platform_event_delivery_attempts",
  "platform_event_replay_generations",
  "platform_event_delivery_actions",
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

async function verifySchema(connection, expectEmpty) {
  const marker = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='054_phase27a_platform_delivery_foundation'",
  );
  if (marker !== "1") throw new Error(`migration 054 marker expected 1, got ${marker}`);
  const tableCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema=DATABASE() AND table_name IN (${tables.map(() => "?").join(",")})`,
    tables,
  );
  if (tableCount !== String(tables.length)) throw new Error(`expected ${tables.length} Platform tables, got ${tableCount}`);

  const exactKey = await scalar(
    connection,
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
     FROM information_schema.statistics WHERE table_schema=DATABASE()
       AND table_name='platform_event_subscriptions' AND index_name='uq_platform_subscription_exact'`,
  );
  if (exactKey !== "city_code,subscriber_id,event_type,event_major_version") {
    throw new Error(`exact-major subscription key mismatch: ${exactKey}`);
  }
  const deliveryKey = await scalar(
    connection,
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
     FROM information_schema.statistics WHERE table_schema=DATABASE()
       AND table_name='platform_event_deliveries' AND index_name='uq_platform_delivery_subscriber_event'`,
  );
  if (deliveryKey !== "subscriber_id,event_id") throw new Error(`delivery idempotency key mismatch: ${deliveryKey}`);
  const rejectionKey = await scalar(
    connection,
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',')
     FROM information_schema.statistics WHERE table_schema=DATABASE()
       AND table_name='platform_event_delivery_actions'
       AND index_name='uq_platform_action_terminal_rejection'`,
  );
  if (
    rejectionKey !==
    "city_code,subscription_id_copy,subscriber_id_copy,event_id_copy,compatibility_handler_revision_copy,action_kind"
  ) {
    throw new Error(`terminal rejection key mismatch: ${rejectionKey}`);
  }

  const sourceFk = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.key_column_usage
     WHERE table_schema=DATABASE() AND table_name='platform_event_deliveries'
       AND constraint_name='fk_platform_delivery_source' AND referenced_table_name='event_outbox'`,
  );
  if (sourceFk !== "2") throw new Error(`composite source FK expected two columns, got ${sourceFk}`);
  const cascadeCount = await scalar(
    connection,
    `SELECT COUNT(*) FROM information_schema.referential_constraints
     WHERE constraint_schema=DATABASE() AND table_name LIKE 'platform_event_%'
       AND (delete_rule='CASCADE' OR update_rule='CASCADE')`,
  );
  if (cascadeCount !== "0") throw new Error("Platform Delivery FKs must not cascade evidence");

  if (expectEmpty) {
    for (const table of tables) {
      const count = await scalar(connection, `SELECT COUNT(*) FROM \`${table}\``);
      if (count !== "0") throw new Error(`${table} must start empty, got ${count}`);
    }
  }
}

async function applyMigrationsThrough053(connection) {
  for (const file of migrationFilesThrough053) {
    await connection.query(fs.readFileSync(path.join(root, "db", "migrations", file), "utf8"));
    const version = file.replace(/\.sql$/, "");
    await connection.execute(
      "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version=version",
      [version],
    );
  }
  const baseline = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='053_phase24f_support_quality'",
  );
  if (baseline !== "1") throw new Error("temporary baseline requires migration 053 exactly once");
  const marker054 = await scalar(
    connection,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='054_phase27a_platform_delivery_foundation'",
  );
  if (marker054 !== "0") throw new Error("temporary 000-053 baseline must not contain migration 054");
}

function sourceColumnsSql() {
  return `SELECT GROUP_CONCAT(CONCAT(column_name,':',column_type) ORDER BY ordinal_position SEPARATOR '|')
   FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox'`;
}

const insertTargets = [...migrationText.matchAll(/INSERT\s+INTO\s+([a-z0-9_]+)/gi)].map((match) => match[1]);
if (insertTargets.length !== 1 || insertTargets[0]?.toLowerCase() !== "schema_migrations") {
  throw new Error(`migration 054 must contain no seed/data INSERT; found ${insertTargets.join(",")}`);
}
if (/\b055_/i.test(migrationText)) throw new Error("migration 054 must not reference migration 055");

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
const sourceColumnsBefore = await scalar(current, sourceColumnsSql());
try {
  const baseline = await scalar(
    current,
    "SELECT COUNT(*) FROM schema_migrations WHERE version='053_phase24f_support_quality'",
  );
  if (baseline !== "1") throw new Error("existing upgrade Gate requires migration 053 before 054");
  migrate();
  await verifySchema(current, false);
  const sourceColumnsAfter = await scalar(current, sourceColumnsSql());
  if (sourceColumnsAfter !== sourceColumnsBefore) throw new Error("migration 054 changed source event_outbox schema");
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
  const database = `xlb_phase27a_gate_${label}_${Date.now()}`;
  if (!/^xlb_phase27a_gate_[a-z]+_[0-9]+$/.test(database)) throw new Error("unsafe temporary database name");
  await rootConnection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
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
    await applyMigrationsThrough053(connection);
    const sourceBefore = await scalar(connection, sourceColumnsSql());
    migrate(env);
    await verifySchema(connection, true);
    migrate(env);
    await verifySchema(connection, true);
    if (await scalar(connection, sourceColumnsSql()) !== sourceBefore) {
      throw new Error("existing 000-053 upgrade changed source event_outbox schema");
    }
  });

  await withTemporaryDatabase("partial", async ({ connection, env }) => {
    await applyMigrationsThrough053(connection);
    const sourceBefore = await scalar(connection, sourceColumnsSql());
    const interruptionBoundary = migrationText.indexOf(
      "CREATE TABLE IF NOT EXISTS platform_event_deliveries",
    );
    if (interruptionBoundary <= 0) throw new Error("cannot locate safe partial-DDL interruption boundary");
    await connection.query(migrationText.slice(0, interruptionBoundary));
    const partialTableCount = await scalar(
      connection,
      `SELECT COUNT(*) FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name IN (${tables.map(() => "?").join(",")})`,
      tables,
    );
    if (partialTableCount !== "3") throw new Error(`true partial-DDL setup expected 3 tables, got ${partialTableCount}`);
    const partialMarker = await scalar(
      connection,
      "SELECT COUNT(*) FROM schema_migrations WHERE version='054_phase27a_platform_delivery_foundation'",
    );
    if (partialMarker !== "0") throw new Error("true partial-DDL setup must not write migration 054 marker");

    migrate(env);
    await verifySchema(connection, true);
    migrate(env);
    await verifySchema(connection, true);
    if (await scalar(connection, sourceColumnsSql()) !== sourceBefore) {
      throw new Error("partial-DDL recovery changed source event_outbox schema");
    }
  });
} finally {
  await rootConnection.end();
}

process.stdout.write("Phase 27A migration 054 empty/existing/true-partial-DDL/double-replay Gate PASS\n");
