import { describe, it, expect } from "vitest";
import {
  cityConfigSnapshotSchema,
  cityConfigUpdateSchema,
} from "@xlb/validators";

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

  it("requires expectedVersion for updates", () => {
    const result = cityConfigUpdateSchema.safeParse({
      cityCode: "hangzhou",
      isOpen: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optimistic update with at least one changed field", () => {
    const result = cityConfigUpdateSchema.safeParse({
      cityCode: "hangzhou",
      expectedVersion: 3,
      serviceEnabled: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects version-only updates", () => {
    const result = cityConfigUpdateSchema.safeParse({
      cityCode: "hangzhou",
      expectedVersion: 3,
    });
    expect(result.success).toBe(false);
  });
});
