import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("noAcceptInPhase6", () => {
  it("gate script passes", () => {
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-certification-no-accept.ps1")}"`,
      { encoding: "utf-8" },
    );
  });

  it("no accept route in compliance module", () => {
    const content = readFileSync(
      join(root, "backend/src/compliance/workerCertification/workerCertificationRoutes.ts"),
      "utf8",
    );
    expect(content).not.toMatch(/acceptTask|\/accept/);
  });
});
