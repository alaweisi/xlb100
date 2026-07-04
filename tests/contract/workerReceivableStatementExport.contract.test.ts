import { describe, expect, it } from "vitest";
import {
  exportWorkerReceivableStatementResponseSchema,
  getWorkerReceivableStatementExportResponseSchema,
  workerReceivableStatementExportSchema,
  workerReceivableStatementExportedEventPayloadSchema,
} from "@xlb/validators";

describe("worker receivable statement export contract", () => {
  const now = new Date().toISOString();
  const exportRecord = {
    exportId: "wre-1",
    cityCode: "hangzhou",
    statementId: "wrs-1",
    reviewId: "wrr-1",
    queueId: "spq-1",
    settlementPayableId: "spy-1",
    settlementBatchId: "stb-1",
    workerId: "wrk-1",
    exportFormat: "internal_v1" as const,
    payloadVersion: "v1" as const,
    contentHash: "a".repeat(64),
    exportedAt: now,
    exportedBy: "operator-1",
    createdAt: now,
    updatedAt: now,
  };

  it("accepts export-once response", () => {
    expect(exportWorkerReceivableStatementResponseSchema.parse({ ok: true, export: exportRecord, idempotent: false })).toBeTruthy();
    expect(exportWorkerReceivableStatementResponseSchema.parse({ ok: true, export: exportRecord, idempotent: true })).toBeTruthy();
  });

  it("accepts get export response", () => {
    expect(getWorkerReceivableStatementExportResponseSchema.parse({ ok: true, export: exportRecord })).toBeTruthy();
  });

  it("rejects payout-like fields on export schema", () => {
    expect(() => workerReceivableStatementExportSchema.parse({ ...exportRecord, payoutId: "bad" })).toThrow();
    expect(() => workerReceivableStatementExportSchema.parse({ ...exportRecord, paidAt: now })).toThrow();
  });
});

describe("worker.receivable.statement.exported event contract", () => {
  it("accepts valid payload without payout fields", () => {
    const payload = workerReceivableStatementExportedEventPayloadSchema.parse({
      exportId: "wre-1",
      statementId: "wrs-1",
      reviewId: "wrr-1",
      queueId: "spq-1",
      payableId: "spy-1",
      batchId: "stb-1",
      cityCode: "hangzhou",
      workerId: "wrk-1",
      exportFormat: "internal_v1",
      payloadVersion: "v1",
      contentHash: "b".repeat(64),
      exportedAt: new Date().toISOString(),
      exportedBy: "operator-1",
    });
    expect(payload).not.toHaveProperty("payoutId");
    expect(payload).not.toHaveProperty("provider");
  });
});
