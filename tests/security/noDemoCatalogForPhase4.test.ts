import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";
import { runPowerShellGateResult } from "./helpers/runPowerShellGate.js";

describe("noDemoCatalogForPhase4", () => {
  it("passes when official catalog replaces demo-only state", () => {
    const result = runPowerShellGateResult(
      "check-no-demo-catalog-for-phase4.ps1",
    );
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
