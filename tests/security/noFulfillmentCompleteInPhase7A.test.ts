import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noFulfillmentCompleteInPhase7A", () => {
  it("gate script check-no-fulfillment-complete-in-phase7a.ps1 passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-no-fulfillment-complete-in-phase7a.ps1")}"`,
      { encoding: "utf-8" },
    );
  });
});
