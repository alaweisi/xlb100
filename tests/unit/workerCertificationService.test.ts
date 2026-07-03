import { describe, it, expect } from "vitest";
import { WorkerCertificationService } from "../../backend/src/compliance/workerCertification/workerCertificationService.js";
import type { WorkerCertification } from "@xlb/types";

describe("workerCertificationService", () => {
  it("creates pending certification on submit", async () => {
    const inserted: WorkerCertification = {
      certificationId: "cert_test",
      workerId: "worker-demo-hangzhou",
      cityCode: "hangzhou",
      certType: "home_service_basic",
      certName: "基础上门服务资格",
      status: "pending",
      submittedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const service = new WorkerCertificationService({
      insert: async () => inserted,
      findById: async () => inserted,
      updateStatus: async () => inserted,
      listApprovedByWorker: async () => [],
    } as never);

    const { workerService } = await import("../../backend/src/worker/workerService.js");
    const original = workerService.assertWorkerBoundToCity.bind(workerService);
    workerService.assertWorkerBoundToCity = async () => {};

    try {
      const result = await service.submitCertification(
        {
          appType: "worker",
          role: "worker",
          cityCode: "hangzhou",
          userId: "worker-demo-hangzhou",
          traceId: "t",
          requestStartedAt: "2026-01-01T00:00:00.000Z",
          requestId: "r",
          correlationId: "c",
        },
        { certType: "home_service_basic", certName: "基础上门服务资格" },
      );
      expect(result.status).toBe("pending");
    } finally {
      workerService.assertWorkerBoundToCity = original;
    }
  });
});
