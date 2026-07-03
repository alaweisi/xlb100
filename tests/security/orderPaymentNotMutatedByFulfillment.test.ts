import { describe, it } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
describe("orderPaymentNotMutatedByFulfillment", () => {
  it("passes the order/payment immutability gate", () => {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", join(root, "scripts/check-order-payment-not-mutated-by-fulfillment.ps1")]);
  });
});
