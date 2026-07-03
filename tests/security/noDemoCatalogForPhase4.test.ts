import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

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

describe("noDemoCatalogForPhase4", () => {
  it("blocks Phase 4 when only demo catalog is available", () => {
    const result = runScript("check-no-demo-catalog-for-phase4.ps1");
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/Phase 4|demo/i);
  });

  it("rejects __global__ as catalog cityCode (not valid business city)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
        [XLB_HEADERS.cityCode]: "__global__",
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
