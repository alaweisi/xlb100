import { describe, it, expect } from "vitest";
import {
  assertAdminCityScope,
  assertAdminCanAccessCity,
  fetchAdminCityScopes,
} from "../../backend/src/dal/adminQueryGuard.js";
import type { RequestContext } from "@xlb/types";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("adminScopeLeak (DB-backed)", () => {
  it("admin without city_scope cannot access city", async () => {
    await expect(assertAdminCityScope("unknown-admin", "hangzhou")).rejects.toThrow(
      /no city_scope/,
    );
  });

  it("admin with hangzhou scope can access hangzhou", async () => {
    await expect(
      assertAdminCityScope("admin-hangzhou", "hangzhou"),
    ).resolves.toBeUndefined();
  });

  it("admin with hangzhou scope cannot access shanghai", async () => {
    await expect(
      assertAdminCityScope("admin-hangzhou", "shanghai"),
    ).rejects.toThrow(/scope leak/);
  });

  it("global admin can access any city", async () => {
    await expect(
      assertAdminCityScope("admin-global", "beijing"),
    ).resolves.toBeUndefined();
  });

  it("assertAdminCanAccessCity uses context userId", async () => {
    const ctx: RequestContext = {
      traceId: "t1",
      appType: "admin",
      role: "admin",
      userId: "admin-shanghai",
      cityCode: "shanghai",
      requestStartedAt: new Date().toISOString(),
    };
    await expect(assertAdminCanAccessCity(ctx, "shanghai")).resolves.toBeUndefined();
    await expect(assertAdminCanAccessCity(ctx, "hangzhou")).rejects.toThrow(/scope leak/);
  });

  it("fetchAdminCityScopes returns seeded scopes", async () => {
    const scopes = await fetchAdminCityScopes("admin-hangzhou");
    expect(scopes).toContain("hangzhou");
  });
});
