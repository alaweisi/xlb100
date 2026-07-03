import { describe, it, expect } from "vitest";
import { buildRequestContext } from "../../backend/src/context/requestContext.js";
import { cityRouter } from "../../backend/src/city/cityRouter.js";
import { XLB_HEADERS } from "@xlb/types";

describe("noMissingCityCode", () => {
  it("rejects city-scoped route without city_code header", () => {
    const result = buildRequestContext({
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
      },
      requireCityCode: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("x-xlb-city-code");
    }
  });

  it("cityRouter rejects context without cityCode", () => {
    const decision = cityRouter({
      traceId: "t1",
      appType: "customer",
      role: "customer",
      requestStartedAt: new Date().toISOString(),
    });
    expect(decision.allowed).toBe(false);
  });
});
