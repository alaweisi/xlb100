import { describe, it, expect } from "vitest";
import { requestContextSchema } from "@xlb/validators";
import { buildRequestContext } from "../../backend/src/context/requestContext.js";
import { XLB_HEADERS } from "@xlb/types";
import { createToken } from "../../backend/src/auth/tokenAuth.js";

describe("requestContext", () => {
  it("validates full request context", () => {
    const result = requestContextSchema.safeParse({
      traceId: "trace-1",
      appType: "customer",
      role: "customer",
      cityCode: "hangzhou",
      requestStartedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it("builds context with auto traceId when missing", () => {
    const result = buildRequestContext({
      headers: {
        [XLB_HEADERS.cityCode]: "hangzhou",
        Authorization: `Bearer ${createToken("customer-demo-001", "customer", "customer")}`,
      },
      requireCityCode: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.traceId).toBeTruthy();
      expect(result.context.cityCode).toBe("hangzhou");
      expect(result.context.requestStartedAt).toBeTruthy();
    }
  });

  it("rejects missing bearer token", () => {
    const result = buildRequestContext({
      headers: {},
      requireCityCode: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(401);
    }
  });
});
