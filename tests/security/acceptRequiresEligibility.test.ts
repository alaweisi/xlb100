import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const scripts = [
  "check-accept-requires-eligibility.ps1",
  "check-accept-city-scoped.ps1",
  "check-fulfillment-skeleton-no-ledger.ps1",
  "check-no-payment-order-to-accept.ps1",
  "check-no-fulfillment-complete-in-phase7a.ps1",
];

describe("Phase 7A gate scripts", () => {
  for (const script of scripts) {
    it(`${script} passes`, () => {
      execSync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", script)}"`,
        { encoding: "utf-8" },
      );
    });
  }
});
