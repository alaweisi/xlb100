import { describe, it, expect } from "vitest";
import { adminQueryGuard } from "../../backend/src/dal/adminQueryGuard.js";
import { resolveCityScope } from "../../backend/src/city/cityScopeResolver.js";

describe("adminScopeLeak", () => {
  it("blocks admin query when city_code outside scope", () => {
    const scope = resolveCityScope("admin", "hangzhou");
    const guard = adminQueryGuard(scope, "shanghai");
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.statusCode).toBe(403);
      expect(guard.message).toContain("scope leak");
    }
  });

  it("allows admin query within scoped city_code", () => {
    const scope = resolveCityScope("admin", "hangzhou");
    const guard = adminQueryGuard(scope, "hangzhou");
    expect(guard.ok).toBe(true);
  });

  it("blocks admin without city scope", () => {
    const scope = resolveCityScope("admin", undefined);
    const guard = adminQueryGuard(scope, "hangzhou");
    expect(guard.ok).toBe(false);
  });
});
