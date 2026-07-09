import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

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
  it("passes when official catalog replaces demo-only state", () => {
    const result = runScript("check-no-demo-catalog-for-phase4.ps1");
    expect(result.code).toBe(0);
    expect(result.output).toMatch(/passed/i);
  });

  it("rejects __global__ as catalog cityCode (not valid business city)", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: {
        ...bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
        [XLB_HEADERS.cityCode]: "__global__",
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
