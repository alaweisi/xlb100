import { describe, it, expect } from "vitest";
import { canonicalizeCityCode } from "../../backend/src/city/cityCanonicalizer.js";
import {
  resolveCityCode,
  requireCityCode,
} from "../../backend/src/city/cityResolver.js";

describe("cityResolver", () => {
  it("canonicalizes city code to lowercase", () => {
    expect(canonicalizeCityCode("HangZhou")).toBe("hangzhou");
  });

  it("resolves known seeded city", () => {
    const result = resolveCityCode("hangzhou");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cityCode).toBe("hangzhou");
    }
  });

  it("rejects unknown city", () => {
    const result = resolveCityCode("unknown_city");
    expect(result.ok).toBe(false);
  });

  it("rejects missing city_code", () => {
    const result = requireCityCode(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("required");
    }
  });

  it("rejects invalid format", () => {
    const result = resolveCityCode("杭州");
    expect(result.ok).toBe(false);
  });
});
