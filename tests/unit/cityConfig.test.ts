import { describe, it, expect, beforeEach } from "vitest";
import type { RequestContext } from "@xlb/types";
import {
  cityConfigService,
  CityConfigWriteForbiddenError,
} from "../../backend/src/cityConfig/cityConfigService.js";
import { clearCityConfigCache } from "../../backend/src/cityConfig/cityConfigCache.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

function customerContext(cityCode: string): RequestContext {
  return {
    traceId: "t1",
    appType: "customer",
    role: "customer",
    cityCode: cityCode as RequestContext["cityCode"],
    requestStartedAt: new Date().toISOString(),
  };
}

function adminContext(userId: string, cityCode: string): RequestContext {
  return {
    traceId: "t2",
    appType: "admin",
    role: "admin",
    userId,
    cityCode: cityCode as RequestContext["cityCode"],
    requestStartedAt: new Date().toISOString(),
  };
}

describe.skipIf(!runDb)("cityConfigService", () => {
  beforeEach(() => clearCityConfigCache());

  it("returns config for hangzhou", async () => {
    const config = await cityConfigService.getCurrentConfig(customerContext("hangzhou"));
    expect(config.cityCode).toBe("hangzhou");
    expect(config.isOpen).toBe(true);
    expect(config.serviceEnabled).toBe(true);
  });

  it("admin without city_scope cannot write config", async () => {
    await expect(
      cityConfigService.updateConfig(adminContext("unknown-admin", "hangzhou"), {
        expectedVersion: 1,
        isOpen: false,
      }),
    ).rejects.toThrow(/scope/);
  });

  it("admin with hangzhou scope can write config", async () => {
    const current = await cityConfigService.getCurrentConfig(customerContext("hangzhou"));
    const updated = await cityConfigService.updateConfig(
      adminContext("admin-hangzhou", "hangzhou"),
      { expectedVersion: current.version, timezone: "Asia/Shanghai" },
    );
    expect(updated.cityCode).toBe("hangzhou");
    expect(updated.timezone).toBe("Asia/Shanghai");
  });

  it("customer cannot write config", async () => {
    await expect(
      cityConfigService.updateConfig(customerContext("hangzhou"), {
        expectedVersion: 1,
        isOpen: false,
      }),
    ).rejects.toThrow(CityConfigWriteForbiddenError);
  });
});

describe("cityConfigService (no DB)", () => {
  it("requires cityCode in context", async () => {
    const ctx: RequestContext = {
      traceId: "t",
      appType: "customer",
      role: "customer",
      requestStartedAt: new Date().toISOString(),
    };
    await expect(cityConfigService.getCurrentConfig(ctx)).rejects.toThrow(/city_code/);
  });
});
