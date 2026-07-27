import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runPowerShellGate } from "./helpers/runPowerShellGate.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noAcceptInPhase6", () => {
  it("gate script passes", () => {
    runPowerShellGate("check-certification-no-accept.ps1");
  });

  it("no accept route in compliance module", () => {
    const content = readFileSync(
      join(root, "backend/src/compliance/workerCertification/workerCertificationRoutes.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/acceptTask|\/accept/);
  });
});
