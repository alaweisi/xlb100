import type { RequestContext } from "@xlb/types";
import type {
  WorkerStatementReviewSummaryQuery,
  WorkerStatementReviewSummaryResponse,
} from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import {
  WorkerStatementReviewSummaryError,
  WorkerReceivableStatementReviewSummaryService,
} from "../../backend/src/settlement/workerReceivableStatementReviewSummaryService.js";

const now = new Date().toISOString();
const context: RequestContext = {
  traceId: "trace",
  appType: "admin",
  role: "operator",
  cityCode: "hangzhou",
  userId: "operator-1",
  requestStartedAt: now,
};

const mockRepository = {
  getReviewSummary: vi.fn(),
};

describe("WorkerReceivableStatementReviewSummaryService", () => {
  it("rejects getReviewSummary when cityCode is missing", async () => {
    const service = new WorkerReceivableStatementReviewSummaryService();
    const noCity: RequestContext = { ...context, cityCode: undefined };
    await expect(
      service.getReviewSummary(noCity, {} as WorkerStatementReviewSummaryQuery),
    ).rejects.toThrow(WorkerStatementReviewSummaryError);
    await expect(
      service.getReviewSummary(noCity, {} as WorkerStatementReviewSummaryQuery),
    ).rejects.toThrow("cityCode is required");
  });

  it("delegates getReviewSummary to repository and shapes response", async () => {
    const expectedOverall = {
      totalStatements: 5,
      reviewedStatements: 3,
      approvedStatements: 2,
      rejectedStatements: 1,
      pendingReviewStatements: 2,
      exportedStatements: 1,
      pendingExportStatements: 1,
      noExportStatements: 1,
    };

    const expectedGroups = [
      {
        workerId: "wrk-1",
        counts: {
          totalStatements: 3,
          reviewedStatements: 2,
          approvedStatements: 1,
          rejectedStatements: 1,
          pendingReviewStatements: 1,
          exportedStatements: 1,
          pendingExportStatements: 0,
          noExportStatements: 0,
        },
      },
      {
        workerId: "wrk-2",
        counts: {
          totalStatements: 2,
          reviewedStatements: 1,
          approvedStatements: 1,
          rejectedStatements: 0,
          pendingReviewStatements: 1,
          exportedStatements: 0,
          pendingExportStatements: 1,
          noExportStatements: 1,
        },
      },
    ];

    mockRepository.getReviewSummary.mockResolvedValue({
      overall: expectedOverall,
      groups: expectedGroups,
    });

    const service = new WorkerReceivableStatementReviewSummaryService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementReviewSummaryRepository.js");
    const orig = mod.workerReceivableStatementReviewSummaryRepository;
    Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      const query: WorkerStatementReviewSummaryQuery = { groupBy: "worker" };
      const result = await service.getReviewSummary(context, query);

      expect(mockRepository.getReviewSummary).toHaveBeenCalledWith(context, query);
      expect(result).toEqual({
        cityCode: "hangzhou",
        dateFrom: null,
        dateTo: null,
        overall: expectedOverall,
        groups: expectedGroups,
      } satisfies WorkerStatementReviewSummaryResponse);
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("delegates with dateFrom/dateTo query params", async () => {
    const expectedOverall = {
      totalStatements: 2,
      reviewedStatements: 1,
      approvedStatements: 1,
      rejectedStatements: 0,
      pendingReviewStatements: 1,
      exportedStatements: 0,
      pendingExportStatements: 1,
      noExportStatements: 1,
    };

    mockRepository.getReviewSummary.mockResolvedValue({
      overall: expectedOverall,
      groups: null,
    });

    const service = new WorkerReceivableStatementReviewSummaryService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementReviewSummaryRepository.js");
    const orig = mod.workerReceivableStatementReviewSummaryRepository;
    Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      const query: WorkerStatementReviewSummaryQuery = {
        dateFrom: "2026-01-01",
        dateTo: "2026-06-30",
      };
      const result = await service.getReviewSummary(context, query);

      expect(mockRepository.getReviewSummary).toHaveBeenCalledWith(context, query);
      expect(result).toMatchObject({
        cityCode: "hangzhou",
        dateFrom: "2026-01-01",
        dateTo: "2026-06-30",
        overall: expectedOverall,
        groups: null,
      });
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("propagates repository errors", async () => {
    mockRepository.getReviewSummary.mockRejectedValue(new Error("db error"));
    const service = new WorkerReceivableStatementReviewSummaryService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementReviewSummaryRepository.js");
    const orig = mod.workerReceivableStatementReviewSummaryRepository;
    Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      await expect(
        service.getReviewSummary(context, {} as WorkerStatementReviewSummaryQuery),
      ).rejects.toThrow("db error");
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("returns null groups when repository returns null groups", async () => {
    const expectedOverall = {
      totalStatements: 3,
      reviewedStatements: 2,
      approvedStatements: 1,
      rejectedStatements: 1,
      pendingReviewStatements: 1,
      exportedStatements: 0,
      pendingExportStatements: 1,
      noExportStatements: 1,
    };

    mockRepository.getReviewSummary.mockResolvedValue({
      overall: expectedOverall,
      groups: null,
    });

    const service = new WorkerReceivableStatementReviewSummaryService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementReviewSummaryRepository.js");
    const orig = mod.workerReceivableStatementReviewSummaryRepository;
    Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      const result = await service.getReviewSummary(context, {} as WorkerStatementReviewSummaryQuery);
      expect(result.groups).toBeNull();
      expect(result.overall).toEqual(expectedOverall);
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementReviewSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });
});
