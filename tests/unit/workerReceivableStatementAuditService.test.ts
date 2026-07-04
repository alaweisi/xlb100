import type { RequestContext } from "@xlb/types";
import type {
  StatementAuditQuery,
  ExportAuditQuery,
} from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import {
  WorkerReceivableStatementAuditError,
  WorkerReceivableStatementAuditService,
} from "../../backend/src/settlement/workerReceivableStatementAuditService.js";

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
  listStatementAudit: vi.fn(),
  getStatementAuditDetail: vi.fn(),
  listExportAudit: vi.fn(),
};

describe("WorkerReceivableStatementAuditService", () => {
  it("rejects listStatementAudit when cityCode is missing", async () => {
    const service = new WorkerReceivableStatementAuditService();
    const noCity: RequestContext = { ...context, cityCode: undefined };
    await expect(
      service.listStatementAudit(noCity, {} as StatementAuditQuery),
    ).rejects.toThrow(WorkerReceivableStatementAuditError);
    await expect(
      service.listStatementAudit(noCity, {} as StatementAuditQuery),
    ).rejects.toThrow("cityCode is required for audit query");
  });

  it("rejects getStatementAuditDetail when cityCode is missing", async () => {
    const service = new WorkerReceivableStatementAuditService();
    const noCity: RequestContext = { ...context, cityCode: undefined };
    await expect(
      service.getStatementAuditDetail(noCity, "wrs-1"),
    ).rejects.toThrow(WorkerReceivableStatementAuditError);
    await expect(
      service.getStatementAuditDetail(noCity, "wrs-1"),
    ).rejects.toThrow("cityCode is required for audit detail");
  });

  it("rejects listExportAudit when cityCode is missing", async () => {
    const service = new WorkerReceivableStatementAuditService();
    const noCity: RequestContext = { ...context, cityCode: undefined };
    await expect(
      service.listExportAudit(noCity, {} as ExportAuditQuery),
    ).rejects.toThrow(WorkerReceivableStatementAuditError);
    await expect(
      service.listExportAudit(noCity, {} as ExportAuditQuery),
    ).rejects.toThrow("cityCode is required for export audit query");
  });

  it("delegates listStatementAudit to repository", async () => {
    const expected = { items: [], nextCursor: null };
    mockRepository.listStatementAudit.mockResolvedValue(expected);
    const service = new WorkerReceivableStatementAuditService();
    // Replace internal repository reference
    (service as any).constructor = undefined;
    Object.assign(service, { workerReceivableStatementAuditRepository: mockRepository as any });
    // The actual implementation imports the singleton, so we test the real class directly
    // by re-reading the real module — the service delegates to the real repository singleton.
    // For isolating the service we override module resolution.
    // For this unit test we verify the service behaves correctly with a mock injected via
    // prototype replacement.
    const listSpy = vi
      .spyOn(mockRepository, "listStatementAudit")
      .mockResolvedValue(expected);
    // Patch the module-level singleton
    const mod = await import("../../backend/src/settlement/workerReceivableStatementAuditRepository.js");
    const orig = mod.workerReceivableStatementAuditRepository;
    Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });
    try {
      const result = await service.listStatementAudit(context, {} as StatementAuditQuery);
      expect(listSpy).toHaveBeenCalledWith(context, {});
      expect(result).toEqual(expected);
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("delegates getStatementAuditDetail to repository", async () => {
    const expected = { statement: null as any, review: null, export: null, exportedOutboxEvent: null };
    mockRepository.getStatementAuditDetail.mockResolvedValue(expected);
    const service = new WorkerReceivableStatementAuditService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementAuditRepository.js");
    const orig = mod.workerReceivableStatementAuditRepository;
    Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });
    try {
      const result = await service.getStatementAuditDetail(context, "wrs-1");
      expect(mockRepository.getStatementAuditDetail).toHaveBeenCalledWith(context, "wrs-1");
      expect(result).toEqual(expected);
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("delegates listExportAudit to repository", async () => {
    const expected = { items: [], nextCursor: null };
    mockRepository.listExportAudit.mockResolvedValue(expected);
    const service = new WorkerReceivableStatementAuditService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementAuditRepository.js");
    const orig = mod.workerReceivableStatementAuditRepository;
    Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });
    try {
      const result = await service.listExportAudit(context, {} as ExportAuditQuery);
      expect(mockRepository.listExportAudit).toHaveBeenCalledWith(context, {});
      expect(result).toEqual(expected);
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("returns null from getStatementAuditDetail when repository returns null", async () => {
    mockRepository.getStatementAuditDetail.mockResolvedValue(null);
    const service = new WorkerReceivableStatementAuditService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementAuditRepository.js");
    const orig = mod.workerReceivableStatementAuditRepository;
    Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });
    try {
      const result = await service.getStatementAuditDetail(context, "wrs-missing");
      expect(result).toBeNull();
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it("propagates repository errors", async () => {
    mockRepository.listStatementAudit.mockRejectedValue(new Error("db error"));
    const service = new WorkerReceivableStatementAuditService();
    const mod = await import("../../backend/src/settlement/workerReceivableStatementAuditRepository.js");
    const orig = mod.workerReceivableStatementAuditRepository;
    Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
      value: mockRepository,
      writable: true,
      configurable: true,
    });
    try {
      await expect(
        service.listStatementAudit(context, {} as StatementAuditQuery),
      ).rejects.toThrow("db error");
    } finally {
      Object.defineProperty(mod, "workerReceivableStatementAuditRepository", {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });
});
