import { describe, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
describe("noSettlementInPhase7B", () => {
  it("passes the settlement and payout gate", () => {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts/check-no-settlement-in-phase7b.ps1")]);
  });
});
