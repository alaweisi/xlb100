import { describe, it, expect } from "vitest";
import { cityCodeSchema } from "@xlb/validators";

describe("cityCodeSchema", () => {
  it("accepts valid business city codes", () => {
    expect(cityCodeSchema.safeParse("hangzhou").success).toBe(true);
    expect(cityCodeSchema.safeParse("shanghai").success).toBe(true);
  });

  it("rejects __global__ as business city code", () => {
    const result = cityCodeSchema.safeParse("__global__");
    expect(result.success).toBe(false);
  });
});
