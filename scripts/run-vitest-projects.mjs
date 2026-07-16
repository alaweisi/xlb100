import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const vitestEntry = path.join(rootDir, "node_modules", "vitest", "vitest.mjs");
const tsxEntry = path.join(rootDir, "backend", "node_modules", "tsx", "dist", "cli.mjs");
const extraArgs = process.argv.slice(2);

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function runProject(project, env = process.env) {
  return run(process.execPath, [
    vitestEntry,
    "run",
    "--project",
    project,
    ...extraArgs,
  ], env);
}

async function prepareIsolatedDatabase() {
  const suffix = `${Date.now()}_${process.pid}`;
  const database = `xlb_test_${suffix}`;
  if (!/^xlb_test_[0-9_]+$/u.test(database)) throw new Error("unsafe isolated test database name");
  const admin = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_ROOT_USER ?? "root",
    password: process.env.MYSQL_ROOT_PASSWORD ?? "xlb_root_password",
  });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    const appUser = process.env.MYSQL_USER ?? "xlb";
    if (!/^[A-Za-z0-9_]{1,64}$/u.test(appUser)) throw new Error("unsafe isolated test database user");
    await admin.query(`GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${appUser}'@'%'`);
    return { admin, database };
  } catch (error) {
    if (created) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
    throw error;
  }
}

async function migrateAndSeed(env) {
  for (const script of ["src/dal/migrateCli.ts", "src/dal/seedCli.ts"]) {
    const code = await run(process.execPath, [tsxEntry, path.join(rootDir, "backend", script)], env);
    if (code !== 0) throw new Error(`${script} failed for isolated test database`);
  }
}

const unitCode = await runProject("unit-contract");
if (unitCode !== 0) process.exit(unitCode);

if (process.env.XLB_SKIP_DB_TESTS === "1") {
  const dbCode = await runProject("db-serial");
  if (dbCode !== 0) process.exit(dbCode);
} else {
  let isolated;
  try {
    isolated = await prepareIsolatedDatabase();
    const env = {
      ...process.env,
      NODE_ENV: "test",
      MYSQL_DATABASE: isolated.database,
      XLB_SKIP_DB_TESTS: "0",
    };
    process.stdout.write(`[test-db] isolated database created: ${isolated.database}\n`);
    await migrateAndSeed(env);
    const dbCode = await runProject("db-serial", env);
    if (dbCode !== 0) process.exitCode = dbCode;
  } finally {
    if (isolated) {
      await isolated.admin.query(`DROP DATABASE IF EXISTS \`${isolated.database}\``);
      await isolated.admin.end();
      process.stdout.write(`[test-db] isolated database removed: ${isolated.database}\n`);
    }
  }
}
