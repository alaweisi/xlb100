import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required");
async function migrate() {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmCli, "--filter", "@xlb/backend", "exec", "tsx", "src/dal/migrateCli.ts"], { cwd: root, env: process.env, stdio: "inherit" });
    child.on("error", reject); child.on("exit", value => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`migration exited ${code}`);
}
const backendRequire = createRequire(path.join(root, "backend", "package.json"));
const { createConnection } = backendRequire("mysql2/promise");
const db = await createConnection({ host: process.env.MYSQL_HOST ?? "127.0.0.1", port: Number(process.env.MYSQL_PORT ?? 3306), database: process.env.MYSQL_DATABASE ?? "xlb_local", user: process.env.MYSQL_USER ?? "xlb", password: process.env.MYSQL_PASSWORD ?? "xlb_local_password" });
async function scalar(sql, params=[]) { const [rows] = await db.execute(sql, params); return String(Object.values(rows[0] ?? {})[0] ?? ""); }
async function verify() {
  if (await scalar("SELECT COUNT(*) c FROM schema_migrations WHERE version='051_phase24d_support_realtime_conversations'") !== "1") throw new Error("051 marker missing");
  for (const table of ["support_conversations", "support_conversation_participants", "support_messages"]) {
    if (await scalar("SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?", [table]) !== "1") throw new Error(`${table} missing`);
  }
  for (const index of ["uq_support_message_client", "uq_support_message_seq"]) {
    if (await scalar("SELECT COUNT(*) c FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='support_messages' AND index_name=?", [index]) === "0") throw new Error(`${index} missing`);
  }
}
try { await migrate(); await verify(); await db.execute("DELETE FROM schema_migrations WHERE version='051_phase24d_support_realtime_conversations'"); await migrate(); await verify(); console.log("[phase24d] migration 051 replay passed"); } finally { await db.end(); }
