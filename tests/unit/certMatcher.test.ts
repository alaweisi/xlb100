import { describe, it, expect } from "vitest";
import { matchWorkerToSkuRules } from "../../backend/src/compliance/certMatcher/serviceQualificationMatcher.js";
import type { ServiceQualificationRule, WorkerCertification } from "@xlb/types";

const baseCert: WorkerCertification = {
  certificationId: "cert_1",
  workerId: "worker-1",
  cityCode: "hangzhou",
  certType: "home_service_basic",
  certName: "基础",
  status: "approved",
  submittedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const rule: ServiceQualificationRule = {
  ruleId: "rule_1",
  cityCode: "hangzhou",
  skuId: "sku_home_daily_2h",
  requiredCertType: "home_service_basic",
  isRequired: true,
  isEnabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("certMatcher / serviceQualificationMatcher", () => {
  it("returns eligible when required cert is approved", () => {
    const result = matchWorkerToSkuRules([baseCert], [rule]);
    expect(result.isEligible).toBe(true);
    expect(result.missingCertTypes).toEqual([]);
    expect(result.sourceCertificationId).toBe("cert_1");
  });

  it("returns not eligible when cert is pending", () => {
    const pending = { ...baseCert, status: "pending" as const };
    const result = matchWorkerToSkuRules([pending], [rule]);
    expect(result.isEligible).toBe(false);
    expect(result.missingCertTypes).toContain("home_service_basic");
  });

  it("returns eligible when no required rules", () => {
    const optionalRule = { ...rule, isRequired: false };
    const result = matchWorkerToSkuRules([], [optionalRule]);
    expect(result.isEligible).toBe(true);
  });
});
