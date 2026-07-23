import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(path.join(root, "backend", "package.json"));
const mysql = require("mysql2/promise");
const migrationName = "062_customer_sdui_control_plane";
const migrationPath = path.join(root, "db", "migrations", `${migrationName}.sql`);
const migrationText = fs.readFileSync(migrationPath, "utf8");
const tables = [
  "customer_sdui_revisions",
  "customer_sdui_kill_switches",
  "customer_sdui_mutation_records",
  "customer_sdui_audit_records",
];

const createdTables = [...migrationText.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (JSON.stringify(createdTables) !== JSON.stringify(tables)) {
  throw new Error(`migration 062 table ledger mismatch: ${createdTables.join(",")}`);
}
const insertTargets = [...migrationText.matchAll(/INSERT\s+INTO\s+([a-z0-9_]+)/gi)]
  .map((match) => match[1].toLowerCase());
if (insertTargets.length !== 1 || insertTargets[0] !== "schema_migrations") {
  throw new Error(`migration 062 must contain no business seed INSERT; found ${insertTargets.join(",")}`);
}
if (/ON\s+(DELETE|UPDATE)\s+CASCADE/i.test(migrationText)) throw new Error("Customer SDUI evidence tables must not cascade");
if (/CREATE\s+(TRIGGER|EVENT|PROCEDURE|FUNCTION)/i.test(migrationText)) {
  throw new Error("Customer SDUI migration must not create executable database objects");
}

const common = { host: process.env.MYSQL_HOST ?? "127.0.0.1", port: Number(process.env.MYSQL_PORT ?? 3306) };
const rootConfig = {
  ...common,
  user: process.env.MYSQL_ROOT_USER ?? "root",
  password: process.env.MYSQL_ROOT_PASSWORD ?? "xlb_root_password",
};
const database = `xlb_customer_sdui_gate_${Date.now()}`;
if (!/^xlb_customer_sdui_gate_[0-9]+$/.test(database)) throw new Error("unsafe temporary database name");

function migrate(env) {
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

const rootConnection = await mysql.createConnection(rootConfig);
try {
  await rootConnection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const connection = await mysql.createConnection({ ...rootConfig, database, multipleStatements: true });
  try {
    const baselineFiles = fs.readdirSync(path.join(root, "db", "migrations"))
      .filter((name) => /^(\d{3})_.*\.sql$/.test(name) && Number(name.slice(0, 3)) <= 58)
      .sort();
    for (const file of baselineFiles) {
      await connection.query(fs.readFileSync(path.join(root, "db", "migrations", file), "utf8"));
    }
    const boundary = migrationText.indexOf("CREATE TABLE IF NOT EXISTS customer_sdui_mutation_records");
    if (boundary <= 0) throw new Error("cannot locate partial-DDL boundary");
    await connection.query(migrationText.slice(0, boundary));
    if (await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]) !== "0") {
      throw new Error("partial migration must not write the 062 marker");
    }

    const env = { ...process.env, MYSQL_DATABASE: database, MYSQL_USER: rootConfig.user, MYSQL_PASSWORD: rootConfig.password };
    migrate(env);
    migrate(env);

    if (await scalar(connection, "SELECT COUNT(*) FROM schema_migrations WHERE version=?", [migrationName]) !== "1") {
      throw new Error("migration 062 marker must exist exactly once");
    }
    if (await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()
       AND table_name IN (${tables.map(() => "?").join(",")})`, tables) !== String(tables.length)) {
      throw new Error("Customer SDUI control-plane table set is incomplete");
    }
    const cityFks = await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.key_column_usage WHERE constraint_schema=DATABASE()
       AND table_name IN (${tables.map(() => "?").join(",")}) AND referenced_table_name='cities'`, tables);
    if (cityFks !== String(tables.length)) throw new Error(`all Customer SDUI tables require city FKs; got ${cityFks}`);
    const cascades = await scalar(connection,
      `SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE()
       AND table_name IN (${tables.map(() => "?").join(",")}) AND (delete_rule='CASCADE' OR update_rule='CASCADE')`, tables);
    if (cascades !== "0") throw new Error("Customer SDUI foreign keys must not cascade");
    for (const table of tables) {
      if (await scalar(connection, `SELECT COUNT(*) FROM \`${table}\``) !== "0") {
        throw new Error(`${table} must start empty`);
      }
    }
  } finally {
    await connection.end();
  }
} finally {
  await rootConnection.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await rootConnection.end();
}

process.stdout.write("Customer SDUI migration 062 partial-DDL/double-replay/constraint Gate PASS\n");
