import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("orderRequiresOfficialSku", () => {
  it("gate script passes", () => {
    const output = execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${join(root, "scripts", "check-order-requires-official-sku.ps1")}"`,
      { encoding: "utf-8" },
    );
    expect(output).toMatch(/passed/i);
  });
});
