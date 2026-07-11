import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required to run the Phase 23C migration gate");

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

async function markerCount() {
  const [rows] = await connection.execute(
    "SELECT COUNT(*) count FROM schema_migrations WHERE version='045_phase23c_frontend_engineering'",
  );
  return Number(rows[0]?.count ?? 0);
}

try {
  await migrate();
  if (await markerCount() !== 1) throw new Error("migration 045 marker must exist exactly once");
  await connection.execute("DELETE FROM schema_migrations WHERE version='045_phase23c_frontend_engineering'");
  await migrate();
  if (await markerCount() !== 1) throw new Error("migration 045 replay must restore exactly one marker");
  process.stdout.write("[phase23c] marker-only migration 045 replay passed\n");
} finally {
  await connection.end();
}
