import { describe, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
describe("noLedgerInFulfillmentComplete", () => {
  it("passes the no-ledger gate", () => {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts/check-fulfillment-complete-no-ledger.ps1")]);
  });
});
