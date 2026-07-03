import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noPaymentOrderToAccept", () => {
  it("gate script passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-no-payment-order-to-accept.ps1")}"`,
      { encoding: "utf-8" },
    );
  });

  it("payment module does not import accept", () => {
    const content = readFileSync(
      join(root, "backend/src/payment/paymentOrderService.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/workerAccept|fulfillmentService/);
  });
});
