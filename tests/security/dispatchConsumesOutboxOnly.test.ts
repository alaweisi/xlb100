import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("dispatchConsumesOutboxOnly", () => {
  it("gate script passes", () => {
    const output = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-dispatch-consumes-outbox-only.ps1")}"`,
      { encoding: "utf-8" },
    );
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
