import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required to run the Phase 24B migration gate");

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
  host: process.env.MYSQL_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.MYSQL_PORT ?? "3306", 10),
  database: process.env.MYSQL_DATABASE ?? "xlb_local",
  user: process.env.MYSQL_USER ?? "xlb",
  password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
});

async function scalar(sql, params = []) {
  const [rows] = await connection.execute(sql, params);
  return String(Object.values(rows[0] ?? {})[0] ?? "");
}

async function verify() {
  if (await scalar("SELECT COUNT(*) count FROM schema_migrations WHERE version='047_phase24b_support_ticket_mvp'") !== "1") {
    throw new Error("migration 047 marker must exist exactly once");
  }
  if (await scalar("SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('support_tickets','support_ticket_events')") !== "2") {
    throw new Error("Phase 24B support tables are incomplete");
  }
  for (const table of ["support_tickets", "support_ticket_events"]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name='city_code'", [table]) !== "1") {
      throw new Error(`${table} must contain city_code`);
    }
  }
  const queueIndex = await scalar(
    "SELECT COUNT(*) count FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='support_tickets' AND index_name='idx_support_ticket_queue'",
  );
  if (queueIndex === "0") throw new Error("support ticket queue index is missing");
}

try {
  await migrate();
  await verify();
  await connection.execute("DELETE FROM schema_migrations WHERE version='047_phase24b_support_ticket_mvp'");
  await migrate();
  await verify();
  process.stdout.write("[phase24b] migration 047 schema replay passed\n");
} finally {
  await connection.end();
}
