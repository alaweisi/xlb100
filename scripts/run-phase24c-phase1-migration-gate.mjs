import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required to run the Phase 24C Phase 1 migration gate");

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

async function verify() {
  if (await scalar("SELECT COUNT(*) count FROM schema_migrations WHERE version='048_phase24c_support_agents_skill_groups'") !== "1") {
    throw new Error("migration 048 marker must exist exactly once");
  }
  const tables = ["support_agents", "support_skill_groups", "support_agent_skill_groups"];
  if (await scalar("SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?,?,?)", tables) !== "3") {
    throw new Error("Phase 24C Phase 1 tables are incomplete");
  }
  for (const table of tables) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name='city_code'", [table]) !== "1") {
      throw new Error(`${table} must contain city_code`);
    }
  }
  for (const [table, column] of [
    ["support_agents", "create_fingerprint"],
    ["support_agents", "last_mutation_fingerprint"],
    ["support_skill_groups", "create_fingerprint"],
    ["support_skill_groups", "last_mutation_fingerprint"],
    ["support_agent_skill_groups", "last_mutation_fingerprint"],
  ]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?", [table, column]) !== "1") {
      throw new Error(`missing idempotency fingerprint column ${table}.${column}`);
    }
  }
  for (const constraint of [
    "fk_support_agent_city", "fk_support_agent_admin_city_scope", "fk_support_skill_group_city",
    "fk_support_agent_skill_group_agent", "fk_support_agent_skill_group_group",
  ]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=? AND constraint_type='FOREIGN KEY'", [constraint]) !== "1") {
      throw new Error(`missing same-city foreign key ${constraint}`);
    }
  }
  if (await scalar("SELECT COUNT(*) count FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='support_skill_groups' AND index_name='uq_support_skill_group_active_default' AND non_unique=0") === "0") {
    throw new Error("active default skill-group uniqueness is missing");
  }
  for (const [table, index] of [
    ["support_agents", "uq_support_agent_create_idempotency"],
    ["support_skill_groups", "uq_support_skill_group_create_idempotency"],
    ["support_agent_skill_groups", "uq_support_agent_skill_group_idempotency"],
  ]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=? AND non_unique=0", [table, index]) === "0") {
      throw new Error(`missing idempotency unique index ${index}`);
    }
  }
  for (const constraint of ["chk_support_agent_city", "chk_support_skill_group_city", "chk_support_agent_skill_group_city"]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=? AND constraint_type='CHECK'", [constraint]) !== "1") {
      throw new Error(`missing non-global check ${constraint}`);
    }
  }
  if (await scalar("SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('support_sla_policies','support_conversations')") !== "0") {
    throw new Error("migration 048 entered a future Phase");
  }
}

try {
  await migrate(); await verify();
  await connection.execute("DELETE FROM schema_migrations WHERE version='048_phase24c_support_agents_skill_groups'");
  await migrate(); await verify();
  process.stdout.write("[phase24c1] migration 048 schema/re-execution verification passed\n");
} finally { await connection.end(); }
