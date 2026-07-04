import type { RequestContext } from "@xlb/types";
import type {
  SettlementAuditSummaryQuery,
  SettlementAuditSummaryResponse,
} from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import {
  SettlementAuditSummaryError,
  SettlementAuditSummaryService,
} from "../../backend/src/settlement/settlementAuditSummaryService.js";

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
  getAuditSummary: vi.fn(),
};

describe("SettlementAuditSummaryService", () => {
  it("rejects getAuditSummary when cityCode is missing", async () => {
    const service = new SettlementAuditSummaryService();
    const noCity: RequestContext = { ...context, cityCode: undefined };
    await expect(
      service.getAuditSummary(noCity, {} as SettlementAuditSummaryQuery),
    ).rejects.toThrow(SettlementAuditSummaryError);
    await expect(
      service.getAuditSummary(noCity, {} as SettlementAuditSummaryQuery),
    ).rejects.toThrow("cityCode is required");
  });

  it("delegates getAuditSummary to repository and returns shaped response", async () => {
    const expectedCounts = {
      totalBatches: 3,
      totalItems: 25,
      totalPayables: 18,
      totalQueueItems: 10,
    };

    const expectedStatusBreakdown = [
      { status: "prepared", count: 1 },
      { status: "confirmed", count: 1 },
      { status: "payable", count: 1 },
    ];

    const expectedAmounts = {
      itemsGrossAmount: 89000,
      itemsPlatformFee: 8900,
      itemsWorkerReceivable: 80100,
      payableGrossAmount: 89000,
      payablePlatformFee: 8900,
      payableWorkerReceivable: 80100,
      queueGrossAmount: 45000,
      queuePlatformFee: 4500,
      queueWorkerReceivable: 40500,
    };

    const expectedGroups = [
      {
        settlementBatchId: "stb-3",
        status: "payable",
        itemCount: 10,
        payableCount: 8,
        queueCount: 5,
      },
      {
        settlementBatchId: "stb-2",
        status: "confirmed",
        itemCount: 8,
        payableCount: 5,
        queueCount: 3,
      },
      {
        settlementBatchId: "stb-1",
        status: "prepared",
        itemCount: 7,
        payableCount: 5,
        queueCount: 2,
      },
    ];

    mockRepository.getAuditSummary.mockResolvedValue({
      counts: expectedCounts,
      statusBreakdown: expectedStatusBreakdown,
      amounts: expectedAmounts,
      groups: expectedGroups,
    });

    const service = new SettlementAuditSummaryService();
    const mod = await import(
      "../../backend/src/settlement/settlementAuditSummaryRepository.js"
    );
    const orig = mod.settlementAuditSummaryRepository;
    Object.defineProperty(mod, "settlementAuditSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      const query: SettlementAuditSummaryQuery = { groupBy: "batch" };
      const result = await service.getAuditSummary(context, query);

      expect(mockRepository.getAuditSummary).toHaveBeenCalledWith(
        context,
        query,
      );
      expect(result).toEqual({
        counts: expectedCounts,
        statusBreakdown: expectedStatusBreakdown,
        amounts: expectedAmounts,
        groups: expectedGroups,
      } satisfies SettlementAuditSummaryResponse);
    } finally {
      Object.defineProperty(mod, "settlementAuditSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("delegates with dateFrom/dateTo query params", async () => {
    const expectedCounts = {
      totalBatches: 2,
      totalItems: 15,
      totalPayables: 10,
      totalQueueItems: 6,
    };

    const expectedStatusBreakdown = [
      { status: "confirmed", count: 1 },
      { status: "payable", count: 1 },
    ];

    const expectedAmounts = {
      itemsGrossAmount: 50000,
      itemsPlatformFee: 5000,
      itemsWorkerReceivable: 45000,
      payableGrossAmount: 50000,
      payablePlatformFee: 5000,
      payableWorkerReceivable: 45000,
      queueGrossAmount: 25000,
      queuePlatformFee: 2500,
      queueWorkerReceivable: 22500,
    };

    mockRepository.getAuditSummary.mockResolvedValue({
      counts: expectedCounts,
      statusBreakdown: expectedStatusBreakdown,
      amounts: expectedAmounts,
      groups: null,
    });

    const service = new SettlementAuditSummaryService();
    const mod = await import(
      "../../backend/src/settlement/settlementAuditSummaryRepository.js"
    );
    const orig = mod.settlementAuditSummaryRepository;
    Object.defineProperty(mod, "settlementAuditSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      const query: SettlementAuditSummaryQuery = {
        dateFrom: "2026-01-01",
        dateTo: "2026-06-30",
      };
      const result = await service.getAuditSummary(context, query);

      expect(mockRepository.getAuditSummary).toHaveBeenCalledWith(
        context,
        query,
      );
      expect(result).toMatchObject({
        counts: expectedCounts,
        statusBreakdown: expectedStatusBreakdown,
        amounts: expectedAmounts,
        groups: null,
      });
    } finally {
      Object.defineProperty(mod, "settlementAuditSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("delegates with groupBy=status query param", async () => {
    const expectedCounts = {
      totalBatches: 3,
      totalItems: 25,
      totalPayables: 18,
      totalQueueItems: 10,
    };

    const expectedStatusBreakdown = [
      { status: "prepared", count: 1 },
      { status: "confirmed", count: 1 },
      { status: "payable", count: 1 },
    ];

    const expectedAmounts = {
      itemsGrossAmount: 89000,
      itemsPlatformFee: 8900,
      itemsWorkerReceivable: 80100,
      payableGrossAmount: 89000,
      payablePlatformFee: 8900,
      payableWorkerReceivable: 80100,
      queueGrossAmount: 45000,
      queuePlatformFee: 4500,
      queueWorkerReceivable: 40500,
    };

    mockRepository.getAuditSummary.mockResolvedValue({
      counts: expectedCounts,
      statusBreakdown: expectedStatusBreakdown,
      amounts: expectedAmounts,
      groups: null,
    });

    const service = new SettlementAuditSummaryService();
    const mod = await import(
      "../../backend/src/settlement/settlementAuditSummaryRepository.js"
    );
    const orig = mod.settlementAuditSummaryRepository;
    Object.defineProperty(mod, "settlementAuditSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      const query: SettlementAuditSummaryQuery = { groupBy: "status" };
      const result = await service.getAuditSummary(context, query);

      expect(mockRepository.getAuditSummary).toHaveBeenCalledWith(
        context,
        query,
      );
      expect(result.statusBreakdown).toHaveLength(3);
      expect(result.groups).toBeNull();
    } finally {
      Object.defineProperty(mod, "settlementAuditSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("propagates repository errors", async () => {
    mockRepository.getAuditSummary.mockRejectedValue(new Error("db error"));
    const service = new SettlementAuditSummaryService();
    const mod = await import(
      "../../backend/src/settlement/settlementAuditSummaryRepository.js"
    );
    const orig = mod.settlementAuditSummaryRepository;
    Object.defineProperty(mod, "settlementAuditSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      await expect(
        service.getAuditSummary(context, {} as SettlementAuditSummaryQuery),
      ).rejects.toThrow("db error");
    } finally {
      Object.defineProperty(mod, "settlementAuditSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("returns null groups when repository returns null groups", async () => {
    const expectedCounts = {
      totalBatches: 2,
      totalItems: 10,
      totalPayables: 8,
      totalQueueItems: 4,
    };

    const expectedStatusBreakdown = [
      { status: "prepared", count: 1 },
      { status: "confirmed", count: 1 },
    ];

    const expectedAmounts = {
      itemsGrossAmount: 30000,
      itemsPlatformFee: 3000,
      itemsWorkerReceivable: 27000,
      payableGrossAmount: 30000,
      payablePlatformFee: 3000,
      payableWorkerReceivable: 27000,
      queueGrossAmount: 15000,
      queuePlatformFee: 1500,
      queueWorkerReceivable: 13500,
    };

    mockRepository.getAuditSummary.mockResolvedValue({
      counts: expectedCounts,
      statusBreakdown: expectedStatusBreakdown,
      amounts: expectedAmounts,
      groups: null,
    });

    const service = new SettlementAuditSummaryService();
    const mod = await import(
      "../../backend/src/settlement/settlementAuditSummaryRepository.js"
    );
    const orig = mod.settlementAuditSummaryRepository;
    Object.defineProperty(mod, "settlementAuditSummaryRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });

    try {
      const query: SettlementAuditSummaryQuery = {};
      const result = await service.getAuditSummary(context, query);

      expect(mockRepository.getAuditSummary).toHaveBeenCalledWith(
        context,
        query,
      );
      expect(result.counts).toEqual(expectedCounts);
      expect(result.groups).toBeNull();
    } finally {
      Object.defineProperty(mod, "settlementAuditSummaryRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });
});
