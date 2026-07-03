import { describe, it, expect } from "vitest";
import { scopedExecutor } from "../../backend/src/dal/scopedExecutor.js";
import { authorizeRequest } from "../../backend/src/gateway/authz.js";
import type { RequestContext } from "@xlb/types";

describe("noBypassArchitecture", () => {
  it("scopedExecutor rejects missing city_code in context", () => {
    const ctx: RequestContext = {
      traceId: "t1",
      appType: "customer",
      role: "customer",
      requestStartedAt: new Date().toISOString(),
    };
    const result = scopedExecutor(ctx, { action: "read" });
    expect(result.ok).toBe(false);
  });

  it("authorizeRequest rejects mismatched appType and role", () => {
    const ctx: RequestContext = {
      traceId: "t1",
      appType: "customer",
      role: "admin",
      cityCode: "hangzhou",
      requestStartedAt: new Date().toISOString(),
    };
    const result = authorizeRequest(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(401);
    }
  });

  it("scopedExecutor attaches city_code to scoped query", () => {
    const ctx: RequestContext = {
      traceId: "t1",
      appType: "worker",
      role: "worker",
      cityCode: "shanghai",
      requestStartedAt: new Date().toISOString(),
    };
    const result = scopedExecutor(ctx, { action: "list" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.cityCode).toBe("shanghai");
    }
  });
});
