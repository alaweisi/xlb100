import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noPaymentToDispatchImport", () => {
  it("gate script passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-no-payment-to-dispatch-import.ps1")}"`,
      { encoding: "utf-8" },
    );
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
