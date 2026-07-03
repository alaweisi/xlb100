import { describe, it, expect } from "vitest";
import { forbidUnscopedAdminQuery } from "../../backend/src/dal/adminQueryGuard.js";
import { assertCityScopedContext } from "../../backend/src/dal/scopedExecutor.js";
import type { RequestContext } from "@xlb/types";

describe("noUnscopedQuery", () => {
  it("forbidUnscopedAdminQuery prevents unscoped admin access", () => {
    expect(() => forbidUnscopedAdminQuery()).toThrow(/Unscoped admin query forbidden/);
  });

  it("city-scoped query without cityCode fails", () => {
    const ctx: RequestContext = {
      traceId: "t1",
      appType: "worker",
      role: "worker",
      requestStartedAt: new Date().toISOString(),
    };
    expect(() => assertCityScopedContext(ctx)).toThrow(/city_code is required/);
  });
});
