import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const vitestEntry = path.join(rootDir, "node_modules", "vitest", "vitest.mjs");
const extraArgs = process.argv.slice(2);

function runProject(project) {
  const args = [
    vitestEntry,
    "run",
    "--workspace",
    "vitest.workspace.ts",
    "--project",
    project,
    ...extraArgs,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`vitest ${project} exited by signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

for (const project of ["unit-contract", "db-serial"]) {
  const code = await runProject(project);
  if (code !== 0) {
    process.exit(code);
  }
}
