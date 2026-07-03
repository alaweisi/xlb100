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
  it("blocks Phase 4 when official catalog seeds are missing", () => {
    const result = runScript("check-official-catalog-ready.ps1");
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/Phase 4|Official catalog not imported|007_official|FAILED/i);
  });

  it("source file still indicates waiting for user", () => {
    const result = runScript("check-official-catalog-ready.ps1");
    expect(result.output).toMatch(/waiting for user|007_official|008_official|WAITING_FOR_USER/i);
  });
});
