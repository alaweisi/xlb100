import { describe, it, expect } from "vitest";
import { WorkerDispatchEligibilityService } from "../../backend/src/compliance/certMatcher/workerDispatchEligibility.js";
import type { WorkerQualification } from "@xlb/types";

describe("workerDispatchEligibility", () => {
  it("returns stored qualification when present", async () => {
    const stored: WorkerQualification = {
      workerId: "worker-demo-hangzhou",
      cityCode: "hangzhou",
      skuId: "sku_home_daily_2h",
      isEligible: true,
      sourceCertificationId: "cert-demo-hangzhou-basic",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const service = new WorkerDispatchEligibilityService(
      {} as never,
      {
        findQualification: async () => stored,
        listEnabledRulesForSku: async () => [],
      } as never,
    );

    const result = await service.computeEligibility(
      "worker-demo-hangzhou",
      "hangzhou",
      "sku_home_daily_2h",
    );
    expect(result.isEligible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("computes from certs when no stored qualification", async () => {
    const service = new WorkerDispatchEligibilityService(
      {
        listApprovedByWorker: async () => [
          {
            certificationId: "cert_1",
            workerId: "w1",
            cityCode: "hangzhou",
            certType: "home_service_basic",
            certName: "基础",
            status: "approved",
            submittedAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      } as never,
      {
        findQualification: async () => null,
        listEnabledRulesForSku: async () => [
          {
            ruleId: "r1",
            cityCode: "hangzhou",
            skuId: "sku_home_daily_2h",
            requiredCertType: "home_service_basic",
            isRequired: true,
            isEnabled: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      } as never,
    );

    const result = await service.computeEligibility("w1", "hangzhou", "sku_home_daily_2h");
    expect(result.isEligible).toBe(true);
  });
});
