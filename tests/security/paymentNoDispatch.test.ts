import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function runScript(script: string): { code: number; output: string } {
  try {
    const output = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", script)}"`,
      { encoding: "utf-8" },
    );
    return { code: 0, output };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("paymentNoDispatch", () => {
  it("gate script passes", () => {
    const result = runScript("check-payment-no-dispatch.ps1");
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
