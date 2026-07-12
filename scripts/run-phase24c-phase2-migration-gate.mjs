import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("npm_execpath is required to run the Phase 24C Phase 2 migration gate");

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
  if (await scalar("SELECT COUNT(*) count FROM schema_migrations WHERE version='049_phase24c_support_routing_sla_policies'") !== "1") {
    throw new Error("migration 049 marker must exist exactly once");
  }
  if (await scalar("SELECT COUNT(*) count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='support_sla_policies'") !== "1") {
    throw new Error("support_sla_policies table is missing");
  }
  for (const column of ["city_code", "policy_series_id", "revision", "supersedes_policy_id", "first_response_minutes", "resolution_minutes", "effective_from", "effective_to", "create_idempotency_key", "create_fingerprint", "mutation_idempotency_key", "mutation_fingerprint", "version"]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='support_sla_policies' AND column_name=?", [column]) !== "1") {
      throw new Error(`support_sla_policies.${column} is missing`);
    }
  }
  if (await scalar("SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='support_tickets' AND column_name='routing_language'") !== "1") {
    throw new Error("support_tickets.routing_language is missing");
  }
  for (const constraint of ["fk_support_sla_policy_city", "fk_support_sla_policy_supersedes", "chk_support_sla_policy_city", "chk_support_sla_policy_minutes"]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name=?", [constraint]) !== "1") {
      throw new Error(`missing SLA policy constraint ${constraint}`);
    }
  }
  for (const index of ["uq_support_sla_policy_create_idempotency", "uq_support_sla_policy_mutation_idempotency", "uq_support_sla_policy_series_revision"]) {
    if (await scalar("SELECT COUNT(*) count FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='support_sla_policies' AND index_name=? AND non_unique=0", [index]) === "0") {
      throw new Error(`missing SLA policy unique index ${index}`);
    }
  }
  const routingColumn = await scalar("SELECT LOWER(column_type) column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='support_tickets' AND column_name='routing_language'");
  if (routingColumn !== "varchar(32)") throw new Error("support_tickets.routing_language must remain VARCHAR(32)");
  if (await scalar("SELECT COUNT(*) count FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='support_tickets' AND column_name IN ('sla_first_response_breached_at','sla_resolution_breached_at')") !== "0") {
    throw new Error("migration 049 entered Phase 3 breach scope");
  }
}

try {
  await migrate(); await verify();
  await connection.execute("DELETE FROM schema_migrations WHERE version='049_phase24c_support_routing_sla_policies'");
  await migrate(); await verify();
  process.stdout.write("[phase24c2] migration 049 schema/re-execution verification passed\n");
} finally { await connection.end(); }
