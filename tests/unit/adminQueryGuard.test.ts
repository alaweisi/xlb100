import { describe, it, expect } from "vitest";
import {
  adminQueryGuard,
  forbidUnscopedAdminQuery,
  AdminScopeError,
  GLOBAL_ADMIN_CITY_MARKER,
  isGlobalAdminScope,
} from "../../backend/src/dal/adminQueryGuard.js";
import { resolveCityScope } from "../../backend/src/city/cityScopeResolver.js";

describe("adminQueryGuard (sync)", () => {
  it("blocks admin query outside scoped city", () => {
    const scope = resolveCityScope("admin", "hangzhou");
    const guard = adminQueryGuard(scope, "shanghai");
    expect(guard.ok).toBe(false);
  });

  it("allows admin within scoped city", () => {
    const scope = resolveCityScope("admin", "hangzhou");
    const guard = adminQueryGuard(scope, "hangzhou");
    expect(guard.ok).toBe(true);
  });

  it("global admin must explicitly specify city_code", () => {
    const scope = { cityCodes: [], isGlobal: true };
    const withoutCity = adminQueryGuard(scope, undefined);
    expect(withoutCity.ok).toBe(false);
    const withCity = adminQueryGuard(scope, "hangzhou");
    expect(withCity.ok).toBe(true);
  });

  it("forbidUnscopedAdminQuery throws", () => {
    expect(() => forbidUnscopedAdminQuery()).toThrow(AdminScopeError);
  });

  it("detects global admin marker", () => {
    expect(isGlobalAdminScope([GLOBAL_ADMIN_CITY_MARKER])).toBe(true);
  });
});
