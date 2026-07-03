import { describe, it, expect } from "vitest";
import type { RequestContext } from "@xlb/types";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
  executeCityScoped,
  scopedExecutor,
  ScopedExecutorError,
} from "../../backend/src/dal/scopedExecutor.js";

const baseContext = (): RequestContext => ({
  traceId: "t1",
  appType: "customer",
  role: "customer",
  cityCode: "hangzhou",
  requestStartedAt: new Date().toISOString(),
});

describe("scopedExecutor", () => {
  it("assertCityScopedContext passes with valid cityCode", () => {
    expect(assertCityScopedContext(baseContext())).toBe("hangzhou");
  });

  it("assertCityScopedContext throws without cityCode", () => {
    const ctx = { ...baseContext(), cityCode: undefined };
    expect(() => assertCityScopedContext(ctx)).toThrow(ScopedExecutorError);
  });

  it("buildCityScopedWhere produces parameterized clause", () => {
    const where = buildCityScopedWhere("shanghai");
    expect(where.clause).toBe("city_code = ?");
    expect(where.params).toEqual(["shanghai"]);
  });

  it("executeCityScoped runs callback with cityCode", async () => {
    const result = await executeCityScoped(baseContext(), async (cityCode) => cityCode);
    expect(result).toBe("hangzhou");
  });

  it("scopedExecutor returns error result without cityCode", () => {
    const ctx = { ...baseContext(), cityCode: undefined };
    const result = scopedExecutor(ctx, {});
    expect(result.ok).toBe(false);
  });
});
