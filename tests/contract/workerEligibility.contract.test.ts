import { describe, it, expect } from "vitest";
import {
  workerDispatchEligibilitySchema,
  workerEligibilityResponseSchema,
} from "@xlb/validators";

describe("workerEligibility contract", () => {
  it("validates eligibility response", () => {
    const result = workerEligibilityResponseSchema.safeParse({
      ok: true,
      eligibility: {
        workerId: "worker-demo-hangzhou",
        cityCode: "hangzhou",
        skuId: "sku_home_daily_2h",
        isEligible: true,
        reasons: [],
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates ineligible with reasons", () => {
    const result = workerDispatchEligibilitySchema.safeParse({
      workerId: "worker-1",
      cityCode: "hangzhou",
      skuId: "sku_home_daily_2h",
      isEligible: false,
      reasons: ["Missing approved certification: home_service_basic"],
    });
    expect(result.success).toBe(true);
  });
});
