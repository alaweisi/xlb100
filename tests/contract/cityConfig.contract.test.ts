import { describe, it, expect } from "vitest";
import { cityConfigSnapshotSchema } from "@xlb/validators";

describe("cityConfig contract", () => {
  it("CityConfigSnapshot schema requires cityCode", () => {
    const result = cityConfigSnapshotSchema.safeParse({
      version: 1,
      isOpen: true,
      timezone: "Asia/Shanghai",
      serviceEnabled: true,
      pricingEnabled: true,
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid snapshot", () => {
    const result = cityConfigSnapshotSchema.safeParse({
      cityCode: "hangzhou",
      version: 1,
      isOpen: true,
      timezone: "Asia/Shanghai",
      serviceEnabled: true,
      pricingEnabled: true,
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
