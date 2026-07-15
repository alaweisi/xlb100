import { spawnSync } from "node:child_process";

function pnpmCommand(args) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  }
  return { command: "pnpm", args };
}

function run(label, args) {
  console.log(`check-contracts: ${label}`);
  const invocation = pnpmCommand(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status})`);
  }
}

try {
  run("contract package typecheck", [
    "exec",
    "turbo",
    "run",
    "typecheck",
    "--filter=@xlb/types",
    "--filter=@xlb/validators",
    "--filter=@xlb/api-client",
  ]);
  run("shared runtime build", ["--filter", "@xlb/shared", "build"]);
  run("contract tests", ["test:contracts"]);
  console.log("check-contracts: passed (types, validators, API client, shared runtime, and contract tests)");
} catch (error) {
  console.error(`check-contracts: failed: ${error.message}`);
  process.exitCode = 1;
}
