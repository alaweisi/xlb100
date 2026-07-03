import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
    return {
      code: e.status ?? 1,
      output: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    };
  }
}

describe("officialCatalogRequiredBeforeOrder", () => {
  it("passes when official catalog seeds are imported", () => {
    const result = runScript("check-official-catalog-ready.ps1");
    expect(result.code).toBe(0);
    expect(result.output).toMatch(/passed/i);
  });

  it("source file is confirmed", () => {
    const result = runScript("check-official-catalog-ready.ps1");
    expect(result.output).not.toMatch(/waiting for user confirmation/i);
  });
});
