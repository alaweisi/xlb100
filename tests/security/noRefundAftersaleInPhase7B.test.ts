import { describe, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
describe("noRefundAftersaleInPhase7B", () => {
  it("passes the refund and aftersale gate", () => {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts/check-no-refund-aftersale-in-phase7b.ps1")]);
  });
});
