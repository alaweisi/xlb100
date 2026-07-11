import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required to run the Phase 23B migration gate");

async function migrate() {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmCli, "--filter", "@xlb/backend", "exec", "tsx", "src/dal/migrateCli.ts"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", value => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`migration command exited ${code}`);
}

const backendRequire = createRequire(path.join(root, "backend", "package.json"));
const { createConnection } = backendRequire("mysql2/promise");
const connection = await createConnection({
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.MYSQL_PORT ?? "3306", 10),
  database: process.env.MYSQL_DATABASE ?? "xlb_local",
  user: process.env.MYSQL_USER ?? "xlb",
  password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
});

const expectedColumns = [
  "processing_started_at", "lease_owner", "lease_token", "lease_expires_at",
  "attempt_count", "max_attempts", "available_at", "last_error_code",
  "last_error_message", "last_failed_at", "dead_lettered_at", "updated_at",
];
const expectedIndexes = [
  ["idx_event_outbox_claim", "city_code,status,available_at,created_at"],
  ["idx_event_outbox_typed_claim", "city_code,event_type,status,available_at,created_at"],
  ["idx_event_outbox_lease_reaper", "city_code,status,lease_expires_at"],
];

async function scalar(sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return String(Object.values(rows[0] ?? {})[0] ?? "");
}

async function verifySchema() {
  const marker = await scalar("SELECT COUNT(*) count FROM schema_migrations WHERE version='044_phase23b_event_outbox_reliability'");
  if (marker !== "1") throw new Error(`migration 044 marker expected 1, got ${marker}`);
  for (const column of expectedColumns) {
    const count = await scalar(
      "SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='event_outbox' AND column_name=?",
      [column],
    );
    if (count !== "1") throw new Error(`event_outbox.${column} expected once, got ${count}`);
  }
  for (const [index, expected] of expectedIndexes) {
    const columns = await scalar(
      "SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') columns FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='event_outbox' AND index_name=?",
      [index],
    );
    if (columns !== expected) throw new Error(`${index} expected ${expected}, got ${columns}`);
  }
}

const fixtureId = `evt_p23b_migration_${randomUUID()}`;
try {
  await migrate();
  await verifySchema();
  await connection.execute(
    `INSERT INTO event_outbox
      (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status)
     VALUES (?,'conflict_audit','migration-test',?,'hangzhou','{}','failed')`,
    [fixtureId, fixtureId],
  );
  await connection.execute("DELETE FROM schema_migrations WHERE version='044_phase23b_event_outbox_reliability'");
  await migrate();
  await verifySchema();
  const legacyStatus = await scalar("SELECT status FROM event_outbox WHERE event_id=?", [fixtureId]);
  if (legacyStatus !== "dead_letter") throw new Error(`legacy failed row expected dead_letter, got ${legacyStatus}`);
  process.stdout.write("[phase23b] migration 044 partial-DDL replay and legacy dead-letter conversion passed\n");
} finally {
  await connection.execute("DELETE FROM event_outbox WHERE event_id=?", [fixtureId]);
  await connection.end();
}
