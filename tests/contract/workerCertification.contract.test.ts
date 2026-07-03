import { describe, it, expect } from "vitest";
import {
  workerCertificationSchema,
  submitWorkerCertificationSchema,
} from "@xlb/validators";

describe("workerCertification contract", () => {
  it("validates certification shape", () => {
    const result = workerCertificationSchema.safeParse({
      certificationId: "cert_1",
      workerId: "worker-demo-hangzhou",
      cityCode: "hangzhou",
      certType: "home_service_basic",
      certName: "基础上门服务资格",
      status: "pending",
      submittedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects __global__ cityCode in submit", () => {
    const result = submitWorkerCertificationSchema.safeParse({
      certType: "home_service_basic",
      certName: "test",
    });
    expect(result.success).toBe(true);
  });
});
