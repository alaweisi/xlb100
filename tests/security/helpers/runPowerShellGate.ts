import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const powerShell = process.platform === "win32" ? "powershell" : "pwsh";
const powerShellArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"];

export function runPowerShellGate(script: string): string {
  return execFileSync(
    powerShell,
    [...powerShellArgs, join(root, "scripts", script)],
    { encoding: "utf8" },
  );
}

export function runPowerShellGateResult(
  script: string,
): { code: number; output: string } {
  const result = spawnSync(
    powerShell,
    [...powerShellArgs, join(root, "scripts", script)],
    { encoding: "utf8", windowsHide: true },
  );
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    code: result.status ?? 1,
    output:
      result.status === 0
        ? stdout
        : `${stdout}${stderr}${result.error?.message ?? ""}`,
  };
}
