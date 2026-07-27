import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noPaymentOrderToAccept", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-no-payment-order-to-accept.ps1");
  });

  it("payment module does not import accept", () => {
    const content = readFileSync(
      join(root, "backend/src/payment/paymentOrderService.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/workerAccept|fulfillmentService/);
  });
});
