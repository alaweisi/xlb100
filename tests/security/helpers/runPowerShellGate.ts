import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const powerShell = process.platform === "win32" ? "powershell" : "pwsh";

export function runPowerShellGate(script: string): string {
  return execFileSync(powerShell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts", script)], { encoding: "utf8" });
}
