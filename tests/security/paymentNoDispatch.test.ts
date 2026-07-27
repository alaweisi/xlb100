import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { runPowerShellGateResult } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("paymentNoDispatch", () => {
  it("gate script passes", () => {
    const result = runPowerShellGateResult("check-payment-no-dispatch.ps1");
    expect(result.code).toBe(0);
  });

  it("order and payment modules do not import dispatch", () => {
    for (const file of [
      "backend/src/order/orderService.ts",
      "backend/src/payment/paymentOrderService.ts",
    ]) {
      const content = readFileSync(join(root, file), "utf8");
      expect(content).not.toMatch(/dispatchService|dispatchStream|workerMatcher/);
      expect(content).not.toMatch(/from ['"].*dispatch/);
    }
  });
});
