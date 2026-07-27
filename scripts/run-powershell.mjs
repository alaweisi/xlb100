import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function resolvePowerShell(spawn = spawnSync) {
  for (const command of process.platform === "win32"
    ? ["pwsh.exe", "powershell.exe"]
    : ["pwsh"]) {
    const result = spawn(command, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return command;
  }
  throw new Error("PowerShell 7 (pwsh) or Windows PowerShell is required");
}

export function runPowerShell(argumentsList = process.argv.slice(2)) {
  const [scriptArgument, ...scriptArguments] = argumentsList;
  if (!scriptArgument) {
    throw new Error("usage: node scripts/run-powershell.mjs <script.ps1> [arguments]");
  }
  const scriptPath = path.resolve(rootDir, scriptArgument);
  const relative = path.relative(rootDir, scriptPath);
  if (
    path.extname(scriptPath).toLowerCase() !== ".ps1"
    || relative === ".."
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
    || !fs.existsSync(scriptPath)
  ) {
    throw new Error("PowerShell script must be an existing repository .ps1 file");
  }
  const command = resolvePowerShell();
  const result = spawnSync(
    command,
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      ...scriptArguments,
    ],
    {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) runPowerShell();
