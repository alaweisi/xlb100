import { describe, it, expect } from "vitest";
import { workerProfileSchema, workerCityBindingSchema } from "@xlb/validators";

describe("workerSchema", () => {
  it("accepts valid worker profile", () => {
    const profile = {
      workerId: "worker-demo-hangzhou",
      displayName: "杭州演示师傅",
      phoneMasked: "138****0001",
      status: "active" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(workerProfileSchema.parse(profile)).toEqual(profile);
  });

  it("rejects __global__ city binding", () => {
    expect(() =>
      workerCityBindingSchema.parse({
        workerId: "w1",
        cityCode: "__global__",
        isEnabled: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
