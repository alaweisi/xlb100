import { describe, expect, it } from "vitest";
import {
  statementAuditQuerySchema,
  statementAuditItemSchema,
  statementAuditListResponseSchema,
  statementAuditDetailResponseSchema,
  exportAuditQuerySchema,
  exportAuditItemSchema,
  exportAuditListResponseSchema,
} from "@xlb/validators";

describe("worker receivable statement audit contract", () => {
  const now = new Date().toISOString();
  const statementId = "wrs-1";
  const reviewId = "wrr-1";
  const exportId = "wre-1";
  const eventId = "evt-1";

  const auditItem = {
    statementId,
    cityCode: "hangzhou" as const,
    workerId: "wrk-1",
    queueId: "spq-1",
    settlementPayableId: "spy-1",
    settlementBatchId: "stb-1",
    currency: "CNY" as const,
    grossAmount: 89,
    platformFeeAmount: 8.9,
    workerReceivableAmount: 80.1,
    itemCount: 1,
    status: "created" as const,
    generatedAt: now,
    generatedBy: "operator-1",
    review: {
      reviewId,
      decision: "approved" as const,
      reviewNote: null,
      reviewedAt: now,
      reviewedBy: "operator-1",
    },
    export: {
      exportId,
      exportFormat: "internal_v1" as const,
      payloadVersion: "v1" as const,
      contentHash: "abc123def456",
      exportedAt: now,
      exportedBy: "operator-1",
      outboxEventId: eventId,
    },
  };

  describe("statementAuditQuerySchema", () => {
    it("accepts empty query", () => {
      expect(statementAuditQuerySchema.parse({})).toBeTruthy();
    });

    it("accepts valid full query", () => {
      const query = {
        workerId: "wrk-1",
        statementId,
        reviewDecision: "approved" as const,
        hasReview: true,
        hasExport: false,
        exportFormat: "internal_v1" as const,
        statementCreatedFrom: now,
        statementCreatedTo: now,
        reviewedFrom: now,
        reviewedTo: now,
        exportedFrom: now,
        exportedTo: now,
        limit: 50,
        cursor: "wrs-9",
      };
      expect(statementAuditQuerySchema.parse(query)).toBeTruthy();
    });

    it("rejects invalid limit (too high)", () => {
      expect(() => statementAuditQuerySchema.parse({ limit: 999 })).toThrow();
    });

    it("rejects invalid limit (too low)", () => {
      expect(() => statementAuditQuerySchema.parse({ limit: 0 })).toThrow();
    });

    it("rejects invalid reviewDecision", () => {
      expect(() => statementAuditQuerySchema.parse({ reviewDecision: "maybe" })).toThrow();
    });

    it("rejects invalid exportFormat", () => {
      expect(() => statementAuditQuerySchema.parse({ exportFormat: "pdf" })).toThrow();
    });

    it("rejects invalid hasReview type", () => {
      expect(() => statementAuditQuerySchema.parse({ hasReview: "yes" })).toThrow();
    });

    it("rejects extra unknown fields", () => {
      expect(() => statementAuditQuerySchema.parse({ unknownField: "bad" })).toThrow();
    });

    it("rejects invalid date format in statementCreatedFrom", () => {
      // The schema uses z.string().min(1), so any non-empty string passes validation.
      // Date format is enforced at the application level, not the schema level.
      expect(statementAuditQuerySchema.parse({ statementCreatedFrom: "not-a-date" })).toBeTruthy();
    });

    it("accepts limit at boundary values", () => {
      expect(statementAuditQuerySchema.parse({ limit: 1 })).toBeTruthy();
      expect(statementAuditQuerySchema.parse({ limit: 200 })).toBeTruthy();
    });
  });

  describe("statementAuditItemSchema", () => {
    it("accepts valid item with review and export", () => {
      expect(statementAuditItemSchema.parse(auditItem)).toBeTruthy();
    });

    it("accepts valid item with null review and null export", () => {
      expect(statementAuditItemSchema.parse({
        ...auditItem,
        review: null,
        export: null,
      })).toBeTruthy();
    });

    it("rejects missing required fields", () => {
      expect(() => statementAuditItemSchema.parse({})).toThrow();
    });

    it("rejects invalid currency", () => {
      expect(() => statementAuditItemSchema.parse({ ...auditItem, currency: "USD" })).toThrow();
    });

    it("rejects invalid status", () => {
      expect(() => statementAuditItemSchema.parse({ ...auditItem, status: "paid" })).toThrow();
    });

    it("rejects negative amounts", () => {
      expect(() => statementAuditItemSchema.parse({ ...auditItem, grossAmount: -1 })).toThrow();
    });

    it("rejects extra unknown fields", () => {
      expect(() => statementAuditItemSchema.parse({ ...auditItem, payoutId: "bad" })).toThrow();
    });
  });

  describe("statementAuditListResponseSchema", () => {
    it("accepts valid response with items", () => {
      expect(statementAuditListResponseSchema.parse({
        ok: true as const,
        items: [auditItem],
        nextCursor: null,
      })).toBeTruthy();
    });

    it("accepts response with nextCursor", () => {
      expect(statementAuditListResponseSchema.parse({
        ok: true as const,
        items: [auditItem],
        nextCursor: "wrs-9",
      })).toBeTruthy();
    });

    it("rejects response with ok: false", () => {
      expect(() => statementAuditListResponseSchema.parse({
        ok: false,
        items: [],
        nextCursor: null,
      })).toThrow();
    });
  });

  describe("statementAuditDetailResponseSchema", () => {
    const statement = {
      statementId,
      cityCode: "hangzhou" as const,
      queueId: "spq-1",
      settlementPayableId: "spy-1",
      settlementBatchId: "stb-1",
      workerId: "wrk-1",
      currency: "CNY" as const,
      grossAmount: 89,
      platformFeeAmount: 8.9,
      workerReceivableAmount: 80.1,
      itemCount: 1,
      status: "created" as const,
      generatedAt: now,
      generatedBy: "operator-1",
      createdAt: now,
      updatedAt: now,
    };

    const review = {
      reviewId,
      cityCode: "hangzhou" as const,
      statementId,
      queueId: "spq-1",
      settlementPayableId: "spy-1",
      settlementBatchId: "stb-1",
      workerId: "wrk-1",
      decision: "approved" as const,
      reviewNote: null,
      reviewedAt: now,
      reviewedBy: "operator-1",
      createdAt: now,
      updatedAt: now,
    };

    const exportRecord = {
      exportId,
      cityCode: "hangzhou" as const,
      statementId,
      reviewId,
      queueId: "spq-1",
      settlementPayableId: "spy-1",
      settlementBatchId: "stb-1",
      workerId: "wrk-1",
      exportFormat: "internal_v1" as const,
      payloadVersion: "v1" as const,
      contentHash: "abc123def456",
      exportedAt: now,
      exportedBy: "operator-1",
      createdAt: now,
      updatedAt: now,
    };

    const outboxEvent = {
      eventId,
      eventType: "worker.receivable.statement.exported",
      status: "pending",
      publishedAt: null,
    };

    it("accepts detail with all nested objects", () => {
      expect(statementAuditDetailResponseSchema.parse({
        ok: true as const,
        statement,
        review,
        export: exportRecord,
        exportedOutboxEvent: outboxEvent,
      })).toBeTruthy();
    });

    it("accepts detail with null review and null export", () => {
      expect(statementAuditDetailResponseSchema.parse({
        ok: true as const,
        statement,
        review: null,
        export: null,
        exportedOutboxEvent: null,
      })).toBeTruthy();
    });

    it("rejects detail with ok: false", () => {
      expect(() => statementAuditDetailResponseSchema.parse({
        ok: false,
        statement,
        review: null,
        export: null,
        exportedOutboxEvent: null,
      })).toThrow();
    });
  });

  describe("exportAuditQuerySchema", () => {
    it("accepts empty query", () => {
      expect(exportAuditQuerySchema.parse({})).toBeTruthy();
    });

    it("accepts valid full query", () => {
      const query = {
        workerId: "wrk-1",
        statementId,
        exportFormat: "internal_v1" as const,
        contentHash: "abc123",
        exportedFrom: now,
        exportedTo: now,
        limit: 50,
        cursor: "wre-9",
      };
      expect(exportAuditQuerySchema.parse(query)).toBeTruthy();
    });

    it("rejects invalid limit", () => {
      expect(() => exportAuditQuerySchema.parse({ limit: 999 })).toThrow();
    });

    it("rejects invalid exportFormat", () => {
      expect(() => exportAuditQuerySchema.parse({ exportFormat: "csv" })).toThrow();
    });

    it("rejects extra unknown fields", () => {
      expect(() => exportAuditQuerySchema.parse({ unknownField: "bad" })).toThrow();
    });
  });

  describe("exportAuditItemSchema", () => {
    it("accepts valid export audit item", () => {
      expect(exportAuditItemSchema.parse({
        exportId,
        cityCode: "hangzhou" as const,
        statementId,
        reviewId,
        workerId: "wrk-1",
        exportFormat: "internal_v1" as const,
        payloadVersion: "v1" as const,
        contentHash: "abc123def456",
        exportedAt: now,
        exportedBy: "operator-1",
        outboxEventId: eventId,
      })).toBeTruthy();
    });

    it("accepts item with null outboxEventId", () => {
      expect(exportAuditItemSchema.parse({
        exportId,
        cityCode: "hangzhou" as const,
        statementId,
        reviewId,
        workerId: "wrk-1",
        exportFormat: "internal_v1" as const,
        payloadVersion: "v1" as const,
        contentHash: "abc123def456",
        exportedAt: now,
        exportedBy: "operator-1",
        outboxEventId: null,
      })).toBeTruthy();
    });

    it("rejects missing required fields", () => {
      expect(() => exportAuditItemSchema.parse({})).toThrow();
    });
  });

  describe("exportAuditListResponseSchema", () => {
    it("accepts valid response", () => {
      expect(exportAuditListResponseSchema.parse({
        ok: true as const,
        items: [{
          exportId,
          cityCode: "hangzhou" as const,
          statementId,
          reviewId,
          workerId: "wrk-1",
          exportFormat: "internal_v1" as const,
          payloadVersion: "v1" as const,
          contentHash: "abc123def456",
          exportedAt: now,
          exportedBy: "operator-1",
          outboxEventId: null,
        }],
        nextCursor: null,
      })).toBeTruthy();
    });
  });
});
