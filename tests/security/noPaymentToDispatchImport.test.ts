import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noPaymentToDispatchImport", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-no-payment-to-dispatch-import.ps1");
  });

  it("order and payment modules do not import dispatch", () => {
    for (const file of [
      "backend/src/order/orderService.ts",
      "backend/src/payment/paymentOrderService.ts",
      "backend/src/events/eventOutbox.ts",
    ]) {
      const content = readFileSync(join(root, file), "utf8");
      expect(content).not.toMatch(/from ['"].*dispatch/);
    }
  });
});
