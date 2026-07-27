import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("dispatchConsumesOutboxOnly", () => {
  it("gate script passes", () => {
    const output = runPowerShellGate("check-dispatch-consumes-outbox-only.ps1");
    expect(output).toContain("passed");
  });

  it("payment webhook does not import dispatch", () => {
    const content = readFileSync(
      join(root, "backend/src/payment/paymentWebhook.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/dispatchService|runDispatchOutboxOnce/);
  });
});
