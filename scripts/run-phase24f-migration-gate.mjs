import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const root = process.cwd(),
  run = () => {
    const r = spawnSync(
      "npx",
      [
        "pnpm",
        "--filter",
        "@xlb/backend",
        "exec",
        "tsx",
        "src/dal/migrateCli.ts",
      ],
      { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
    );
    if (r.status !== 0) process.exit(r.status ?? 1);
  };
run();
run();
const require = createRequire(`${root}/backend/package.json`),
  mysql = require("mysql2/promise"),
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    database: process.env.MYSQL_DATABASE ?? "xlb_local",
    user: process.env.MYSQL_USER ?? "xlb",
    password: process.env.MYSQL_PASSWORD ?? "xlb_local_password",
  });
const scalar = async (sql, p = []) =>
  String(Object.values((await c.execute(sql, p))[0][0] ?? {})[0] ?? "");
if (
  (await scalar(
    "SELECT COUNT(*) FROM schema_migrations WHERE version='053_phase24f_support_quality'",
  )) !== "1"
)
  throw Error("053 marker missing");
if (
  (await scalar(
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('support_csat_records','support_quality_rubrics','support_quality_rubric_versions','support_quality_reviews')",
  )) !== "4"
)
  throw Error("quality tables missing");
if (
  (await scalar(
    "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='support_csat_records' AND index_name IN ('uq_csat_ticket','uq_csat_conversation')",
  )) !== "2"
)
  throw Error("CSAT uniqueness missing");
await c.end();
console.log("Phase 24F migration gate PASS");
