import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required to run the Phase 23D migration gate");

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

const indexes = [
  ["idx_payment_orders_city_order_status", "city_code,order_id,status"],
  ["idx_payment_orders_city_order_created", "city_code,order_id,created_at"],
];

async function verify() {
  if (await scalar("SELECT COUNT(*) count FROM schema_migrations WHERE version='046_phase23d_query_path_indexes'") !== "1") {
    throw new Error("migration 046 marker must exist exactly once");
  }
  for (const [indexName, expectedColumns] of indexes) {
    const columns = await scalar(
      "SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index SEPARATOR ',') columns FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='payment_orders' AND index_name=?",
      [indexName],
    );
    if (columns !== expectedColumns) throw new Error(`${indexName} expected ${expectedColumns}, got ${columns}`);
  }
}

try {
  await migrate();
  await verify();
  await connection.execute("DELETE FROM schema_migrations WHERE version='046_phase23d_query_path_indexes'");
  await migrate();
  await verify();
  process.stdout.write("[phase23d] migration 046 guarded-index replay passed\n");
} finally {
  await connection.end();
}
