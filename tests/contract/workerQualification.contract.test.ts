import { describe, it, expect } from "vitest";
import { workerQualificationSchema, serviceQualificationRuleSchema } from "@xlb/validators";

describe("workerQualification contract", () => {
  it("validates worker qualification", () => {
    const result = workerQualificationSchema.safeParse({
      workerId: "worker-demo-hangzhou",
      cityCode: "hangzhou",
      skuId: "sku_home_daily_2h",
      isEligible: true,
      sourceCertificationId: "cert-demo-hangzhou-basic",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("validates service qualification rule", () => {
    const result = serviceQualificationRuleSchema.safeParse({
      ruleId: "rule_1",
      cityCode: "hangzhou",
      skuId: "sku_home_daily_2h",
      requiredCertType: "home_service_basic",
      isRequired: true,
      isEnabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
