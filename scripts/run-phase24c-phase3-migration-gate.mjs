import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required to run the Phase 24C Phase 3 migration gate");

async function migrate() {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmCli, "--filter", "@xlb/backend", "exec", "tsx", "src/dal/migrateCli.ts"], {
      cwd: root, env: process.env, stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", value => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`migration command exited ${code}`);
}

const backendRequire = createRequire(path.join(root, "backend", "package.json"));
const { createConnection } = backendRequire("mysql2/promise");
const connection = await createConnection({
  host: process.env.MYSQL_HOST ?? "127.0.0.1", port: Number.parseInt(process.env.MYSQL_PORT ?? "3306", 10),
  database: process.env.MYSQL_DATABASE ?? "xlb_local", user: process.env.MYSQL_USER ?? "xlb",
  password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
});

async function scalar(sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return String(Object.values(rows[0] ?? {})[0] ?? "");
}

async function verifyIndex(indexName, expectedColumns) {
  const columns = await scalar(
    `SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') columns
       FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name='support_tickets' AND index_name=?`,
    [indexName],
  );
  if (columns !== expectedColumns.join(",")) {
    throw new Error(`${indexName} columns differ: ${columns}`);
  }
}

async function verify() {
  if (await scalar("SELECT COUNT(*) count FROM schema_migrations WHERE version='050_phase24c_support_sla_breach_workbench'") !== "1") {
    throw new Error("migration 050 marker must exist exactly once");
  }
  for (const column of ["sla_first_response_breached_at", "sla_resolution_breached_at"]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='support_tickets' AND column_name=? AND LOWER(column_type)='timestamp(3)'", [column]) !== "1") {
      throw new Error(`support_tickets.${column} must be a nullable TIMESTAMP(3)`);
    }
    if (await scalar("SELECT is_nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='support_tickets' AND column_name=?", [column]) !== "YES") {
      throw new Error(`support_tickets.${column} must remain nullable`);
    }
  }
  await verifyIndex("idx_support_ticket_first_response_sla_scan", [
    "city_code", "status", "first_responded_at", "sla_first_response_breached_at",
    "sla_first_response_due_at", "ticket_id",
  ]);
  await verifyIndex("idx_support_ticket_resolution_sla_scan", [
    "city_code", "status", "sla_resolution_breached_at", "sla_resolution_due_at", "ticket_id",
  ]);
  const eventCheck = (await scalar(
    `SELECT check_clause FROM information_schema.check_constraints
      WHERE constraint_schema=DATABASE() AND constraint_name='chk_support_ticket_event_type'`,
  )).toLowerCase();
  for (const eventType of ["claimed", "sla_breached"]) {
    // MySQL exposes CHECK literals with a charset introducer (for example
    // `_utf8mb4'claimed'`), and some clients preserve escaped quotes.
    if (!eventCheck.includes(eventType)) throw new Error(`ticket event CHECK is missing ${eventType}`);
  }
}

try {
  await migrate(); await verify();
  await connection.execute("DELETE FROM schema_migrations WHERE version='050_phase24c_support_sla_breach_workbench'");
  await migrate(); await verify();
  process.stdout.write("[phase24c3] migration 050 schema/re-execution verification passed\n");
} finally { await connection.end(); }
