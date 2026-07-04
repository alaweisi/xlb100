import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const settlementBatchStatusSchema = z.enum(["prepared", "confirmed", "cancelled"]);
export const settlementItemStatusSchema = z.enum(["prepared", "confirmed", "cancelled"]);
const amountSchema = z.number().min(0);
const idSchema = z.string().min(1).max(64);

export const settlementBatchSchema = z.object({
  settlementBatchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  totalGrossAmount: amountSchema,
  totalPlatformFee: amountSchema,
  totalWorkerReceivable: amountSchema,
  itemCount: z.number().int().min(0),
  status: settlementBatchStatusSchema,
  preparedAt: z.string().min(1),
  confirmedAt: z.string().min(1).nullable(),
  confirmedBy: idSchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict().superRefine((value, context) => {
  const hasAudit = value.confirmedAt !== null && value.confirmedBy !== null;
  if ((value.status === "confirmed") !== hasAudit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "confirmed status and confirmation audit fields must agree",
    });
  }
});

export const confirmSettlementBatchRequestSchema = z.object({}).strict();

export const settlementConfirmedEventPayloadSchema = z.object({
  settlementBatchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  itemCount: z.number().int().min(1),
  totalGrossAmount: amountSchema,
  totalPlatformFee: amountSchema,
  totalWorkerReceivable: amountSchema,
  confirmedAt: z.string().min(1),
  confirmedBy: idSchema,
}).strict();

export const settlementConfirmationResponseSchema = z.object({
  ok: z.literal(true),
  batch: settlementBatchSchema,
  idempotent: z.boolean(),
}).strict();

export const settlementItemSchema = z.object({
  settlementItemId: idSchema,
  settlementBatchId: idSchema,
  cityCode: cityCodeSchema,
  accrualId: idSchema,
  fulfillmentId: idSchema,
  orderId: idSchema,
  paymentOrderId: idSchema,
  workerId: idSchema,
  customerId: idSchema,
  skuId: z.string().min(1).max(128),
  grossAmount: amountSchema,
  platformFee: amountSchema,
  workerReceivable: amountSchema,
  currency: z.literal("CNY"),
  status: settlementItemStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export type SettlementBatchInput = z.infer<typeof settlementBatchSchema>;
export type SettlementItemInput = z.infer<typeof settlementItemSchema>;
export type ConfirmSettlementBatchRequestInput = z.infer<typeof confirmSettlementBatchRequestSchema>;
export type SettlementConfirmedEventPayloadInput = z.infer<typeof settlementConfirmedEventPayloadSchema>;
export type SettlementConfirmationResponseInput = z.infer<typeof settlementConfirmationResponseSchema>;

export const settlementPayableStatusSchema = z.enum(["payable"]);

export const settlementPayableSchema = z.object({
  settlementPayableId: idSchema,
  cityCode: cityCodeSchema,
  settlementBatchId: idSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  status: settlementPayableStatusSchema,
  markedAt: z.string().min(1),
  markedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const markSettlementPayableRequestSchema = z.object({}).strict();

export const settlementPayableEventPayloadSchema = z.object({
  payableId: idSchema,
  batchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  markedAt: z.string().min(1),
  markedBy: idSchema,
}).strict();

export const settlementPayableResponseSchema = z.object({
  ok: z.literal(true),
  payable: settlementPayableSchema,
  idempotent: z.boolean(),
}).strict();

export type SettlementPayableInput = z.infer<typeof settlementPayableSchema>;
export type MarkSettlementPayableRequestInput = z.infer<typeof markSettlementPayableRequestSchema>;
export type SettlementPayableEventPayloadInput = z.infer<typeof settlementPayableEventPayloadSchema>;
export type SettlementPayableResponseInput = z.infer<typeof settlementPayableResponseSchema>;

export const settlementPayableQueueStatusSchema = z.enum(["queued"]);

export const settlementPayableQueueSchema = z.object({
  queueId: idSchema,
  cityCode: cityCodeSchema,
  settlementPayableId: idSchema,
  settlementBatchId: idSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  status: settlementPayableQueueStatusSchema,
  enqueuedAt: z.string().min(1),
  enqueuedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const enqueueSettlementPayableRequestSchema = z.object({}).strict();

export const settlementPayableQueuedEventPayloadSchema = z.object({
  queueId: idSchema,
  payableId: idSchema,
  batchId: idSchema,
  cityCode: cityCodeSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  enqueuedAt: z.string().min(1),
  enqueuedBy: idSchema,
}).strict();

export const settlementPayableQueueResponseSchema = z.object({
  ok: z.literal(true),
  queue: settlementPayableQueueSchema,
  idempotent: z.boolean(),
}).strict();

export type SettlementPayableQueueInput = z.infer<typeof settlementPayableQueueSchema>;
export type EnqueueSettlementPayableRequestInput = z.infer<typeof enqueueSettlementPayableRequestSchema>;
export type SettlementPayableQueuedEventPayloadInput = z.infer<typeof settlementPayableQueuedEventPayloadSchema>;
export type SettlementPayableQueueResponseInput = z.infer<typeof settlementPayableQueueResponseSchema>;

export const workerReceivableStatementStatusSchema = z.enum(["created"]);

export const workerReceivableStatementLineSchema = z.object({
  lineId: idSchema,
  statementId: idSchema,
  cityCode: cityCodeSchema,
  settlementItemId: idSchema,
  settlementBatchId: idSchema,
  workerId: idSchema,
  orderId: idSchema,
  fulfillmentId: idSchema,
  skuId: z.string().min(1).max(128),
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  createdAt: z.string().min(1),
}).strict();

export const workerReceivableStatementSchema = z.object({
  statementId: idSchema,
  cityCode: cityCodeSchema,
  queueId: idSchema,
  settlementPayableId: idSchema,
  settlementBatchId: idSchema,
  workerId: idSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  status: workerReceivableStatementStatusSchema,
  generatedAt: z.string().min(1),
  generatedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const generateWorkerReceivableStatementsRequestSchema = z.object({}).strict();

export const workerReceivableStatementCreatedEventPayloadSchema = z.object({
  statementId: idSchema,
  queueId: idSchema,
  payableId: idSchema,
  batchId: idSchema,
  cityCode: cityCodeSchema,
  workerId: idSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  generatedAt: z.string().min(1),
  generatedBy: idSchema,
}).strict();

export const generateWorkerReceivableStatementsResponseSchema = z.object({
  ok: z.literal(true),
  statements: z.array(workerReceivableStatementSchema),
  idempotent: z.boolean(),
}).strict();

export const listWorkerReceivableStatementsResponseSchema = z.object({
  ok: z.literal(true),
  statements: z.array(workerReceivableStatementSchema),
}).strict();

export const getWorkerReceivableStatementResponseSchema = z.object({
  ok: z.literal(true),
  statement: workerReceivableStatementSchema,
  lines: z.array(workerReceivableStatementLineSchema),
}).strict();

export const workerReceivableStatementReviewDecisionSchema = z.enum(["approved", "rejected"]);

export const reviewWorkerReceivableStatementRequestSchema = z.object({
  decision: workerReceivableStatementReviewDecisionSchema,
  reviewNote: z.string().max(512).optional(),
}).strict();

export const workerReceivableStatementReviewSchema = z.object({
  reviewId: idSchema,
  cityCode: cityCodeSchema,
  statementId: idSchema,
  queueId: idSchema,
  settlementPayableId: idSchema,
  settlementBatchId: idSchema,
  workerId: idSchema,
  decision: workerReceivableStatementReviewDecisionSchema,
  reviewNote: z.string().max(512).nullable(),
  reviewedAt: z.string().min(1),
  reviewedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const workerReceivableStatementReviewedEventPayloadSchema = z.object({
  reviewId: idSchema,
  statementId: idSchema,
  queueId: idSchema,
  payableId: idSchema,
  batchId: idSchema,
  cityCode: cityCodeSchema,
  workerId: idSchema,
  decision: workerReceivableStatementReviewDecisionSchema,
  reviewNote: z.string().max(512).nullable(),
  reviewedAt: z.string().min(1),
  reviewedBy: idSchema,
}).strict();

export const reviewWorkerReceivableStatementResponseSchema = z.object({
  ok: z.literal(true),
  review: workerReceivableStatementReviewSchema,
  idempotent: z.boolean(),
}).strict();

export const getWorkerReceivableStatementReviewResponseSchema = z.object({
  ok: z.literal(true),
  review: workerReceivableStatementReviewSchema,
}).strict();

export const workerReceivableStatementExportFormatSchema = z.literal("internal_v1");
export const workerReceivableStatementExportPayloadVersionSchema = z.literal("v1");

export const exportWorkerReceivableStatementRequestSchema = z.object({
  exportFormat: workerReceivableStatementExportFormatSchema.optional(),
}).strict();

export const workerReceivableStatementExportSchema = z.object({
  exportId: idSchema,
  cityCode: cityCodeSchema,
  statementId: idSchema,
  reviewId: idSchema,
  queueId: idSchema,
  settlementPayableId: idSchema,
  settlementBatchId: idSchema,
  workerId: idSchema,
  exportFormat: workerReceivableStatementExportFormatSchema,
  payloadVersion: workerReceivableStatementExportPayloadVersionSchema,
  contentHash: z.string().min(1).max(128),
  exportedAt: z.string().min(1),
  exportedBy: idSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export const workerReceivableStatementExportedEventPayloadSchema = z.object({
  exportId: idSchema,
  statementId: idSchema,
  reviewId: idSchema,
  queueId: idSchema,
  payableId: idSchema,
  batchId: idSchema,
  cityCode: cityCodeSchema,
  workerId: idSchema,
  exportFormat: workerReceivableStatementExportFormatSchema,
  payloadVersion: workerReceivableStatementExportPayloadVersionSchema,
  contentHash: z.string().min(1).max(128),
  exportedAt: z.string().min(1),
  exportedBy: idSchema,
}).strict();

export const exportWorkerReceivableStatementResponseSchema = z.object({
  ok: z.literal(true),
  export: workerReceivableStatementExportSchema,
  idempotent: z.boolean(),
}).strict();

export const getWorkerReceivableStatementExportResponseSchema = z.object({
  ok: z.literal(true),
  export: workerReceivableStatementExportSchema,
}).strict();

export type WorkerReceivableStatementInput = z.infer<typeof workerReceivableStatementSchema>;
export type WorkerReceivableStatementLineInput = z.infer<typeof workerReceivableStatementLineSchema>;
export type GenerateWorkerReceivableStatementsRequestInput = z.infer<typeof generateWorkerReceivableStatementsRequestSchema>;
export type WorkerReceivableStatementCreatedEventPayloadInput = z.infer<typeof workerReceivableStatementCreatedEventPayloadSchema>;
export type GenerateWorkerReceivableStatementsResponseInput = z.infer<typeof generateWorkerReceivableStatementsResponseSchema>;
export type ListWorkerReceivableStatementsResponseInput = z.infer<typeof listWorkerReceivableStatementsResponseSchema>;
export type GetWorkerReceivableStatementResponseInput = z.infer<typeof getWorkerReceivableStatementResponseSchema>;
export type WorkerReceivableStatementReviewDecisionInput = z.infer<typeof workerReceivableStatementReviewDecisionSchema>;
export type ReviewWorkerReceivableStatementRequestInput = z.infer<typeof reviewWorkerReceivableStatementRequestSchema>;
export type WorkerReceivableStatementReviewInput = z.infer<typeof workerReceivableStatementReviewSchema>;
export type WorkerReceivableStatementReviewedEventPayloadInput = z.infer<typeof workerReceivableStatementReviewedEventPayloadSchema>;
export type ReviewWorkerReceivableStatementResponseInput = z.infer<typeof reviewWorkerReceivableStatementResponseSchema>;
export type GetWorkerReceivableStatementReviewResponseInput = z.infer<typeof getWorkerReceivableStatementReviewResponseSchema>;
export type WorkerReceivableStatementExportFormatInput = z.infer<typeof workerReceivableStatementExportFormatSchema>;
export type ExportWorkerReceivableStatementRequestInput = z.infer<typeof exportWorkerReceivableStatementRequestSchema>;
export type WorkerReceivableStatementExportInput = z.infer<typeof workerReceivableStatementExportSchema>;
export type WorkerReceivableStatementExportedEventPayloadInput = z.infer<typeof workerReceivableStatementExportedEventPayloadSchema>;
export type ExportWorkerReceivableStatementResponseInput = z.infer<typeof exportWorkerReceivableStatementResponseSchema>;
export type GetWorkerReceivableStatementExportResponseInput = z.infer<typeof getWorkerReceivableStatementExportResponseSchema>;

// ── Phase 8I: Audit Query Schemas ──

export const statementAuditQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  workerId: idSchema.optional(),
  statementId: idSchema.optional(),
  reviewDecision: workerReceivableStatementReviewDecisionSchema.optional(),
  hasReview: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean()).optional(),
  hasExport: z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean()).optional(),
  exportFormat: workerReceivableStatementExportFormatSchema.optional(),
  statementCreatedFrom: z.string().min(1).optional(),
  statementCreatedTo: z.string().min(1).optional(),
  reviewedFrom: z.string().min(1).optional(),
  reviewedTo: z.string().min(1).optional(),
  exportedFrom: z.string().min(1).optional(),
  exportedTo: z.string().min(1).optional(),
  limit: z.preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200)).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

const statementAuditReviewSchema = z.object({
  reviewId: idSchema,
  decision: workerReceivableStatementReviewDecisionSchema,
  reviewNote: z.string().max(512).nullable(),
  reviewedAt: z.string().min(1),
  reviewedBy: idSchema,
}).strict();

const statementAuditExportSchema = z.object({
  exportId: idSchema,
  exportFormat: workerReceivableStatementExportFormatSchema,
  payloadVersion: workerReceivableStatementExportPayloadVersionSchema,
  contentHash: z.string().min(1).max(128),
  exportedAt: z.string().min(1),
  exportedBy: idSchema,
  outboxEventId: idSchema.nullable(),
}).strict();

export const statementAuditItemSchema = z.object({
  statementId: idSchema,
  cityCode: cityCodeSchema,
  workerId: idSchema,
  queueId: idSchema,
  settlementPayableId: idSchema,
  settlementBatchId: idSchema,
  currency: z.literal("CNY"),
  grossAmount: amountSchema,
  platformFeeAmount: amountSchema,
  workerReceivableAmount: amountSchema,
  itemCount: z.number().int().min(1),
  status: workerReceivableStatementStatusSchema,
  generatedAt: z.string().min(1),
  generatedBy: idSchema,
  review: statementAuditReviewSchema.nullable(),
  export: statementAuditExportSchema.nullable(),
}).strict();

export const statementAuditListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(statementAuditItemSchema),
  nextCursor: idSchema.nullable(),
}).strict();

const exportedOutboxEventSchema = z.object({
  eventId: idSchema,
  eventType: z.string().min(1),
  status: z.string().min(1),
  publishedAt: z.string().min(1).nullable(),
}).strict();

export const statementAuditDetailResponseSchema = z.object({
  ok: z.literal(true),
  statement: workerReceivableStatementSchema,
  review: workerReceivableStatementReviewSchema.nullable(),
  export: workerReceivableStatementExportSchema.nullable(),
  exportedOutboxEvent: exportedOutboxEventSchema.nullable(),
}).strict();

export const exportAuditQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  workerId: idSchema.optional(),
  statementId: idSchema.optional(),
  exportFormat: workerReceivableStatementExportFormatSchema.optional(),
  contentHash: z.string().min(1).max(128).optional(),
  exportedFrom: z.string().min(1).optional(),
  exportedTo: z.string().min(1).optional(),
  limit: z.preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200)).optional(),
  cursor: z.string().min(1).max(128).optional(),
}).strict();

export const exportAuditItemSchema = z.object({
  exportId: idSchema,
  cityCode: cityCodeSchema,
  statementId: idSchema,
  reviewId: idSchema,
  workerId: idSchema,
  exportFormat: workerReceivableStatementExportFormatSchema,
  payloadVersion: workerReceivableStatementExportPayloadVersionSchema,
  contentHash: z.string().min(1).max(128),
  exportedAt: z.string().min(1),
  exportedBy: idSchema,
  outboxEventId: idSchema.nullable(),
}).strict();

export const exportAuditListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(exportAuditItemSchema),
  nextCursor: idSchema.nullable(),
}).strict();

export type StatementAuditQueryInput = z.infer<typeof statementAuditQuerySchema>;
export type ExportAuditQueryInput = z.infer<typeof exportAuditQuerySchema>;

// ── Phase 8J: Review Summary / Batch Governance ──

export const workerStatementReviewGroupBySchema = z.enum(["none", "worker"]);

export const workerStatementReviewSummaryQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  groupBy: workerStatementReviewGroupBySchema.optional(),
}).strict();

const workerStatementReviewSummaryCountsSchema = z.object({
  totalStatements: z.number().int().min(0),
  reviewedStatements: z.number().int().min(0),
  approvedStatements: z.number().int().min(0),
  rejectedStatements: z.number().int().min(0),
  pendingReviewStatements: z.number().int().min(0),
  exportedStatements: z.number().int().min(0),
  pendingExportStatements: z.number().int().min(0),
  noExportStatements: z.number().int().min(0),
}).strict();

const workerStatementReviewSummaryGroupSchema = z.object({
  workerId: idSchema,
  counts: workerStatementReviewSummaryCountsSchema,
}).strict();

export const workerStatementReviewSummaryResponseSchema = z.object({
  ok: z.literal(true),
  cityCode: cityCodeSchema,
  dateFrom: z.string().min(1).nullable(),
  dateTo: z.string().min(1).nullable(),
  overall: workerStatementReviewSummaryCountsSchema,
  groups: z.array(workerStatementReviewSummaryGroupSchema).nullable(),
}).strict();

export type WorkerStatementReviewSummaryQueryInput = z.infer<typeof workerStatementReviewSummaryQuerySchema>;

// ── Phase 8K: Settlement Audit Summary ──

export const settlementAuditGroupBySchema = z.enum(["none", "status", "batch"]);

export const settlementAuditSummaryQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  status: settlementBatchStatusSchema.optional(),
  groupBy: settlementAuditGroupBySchema.optional(),
}).strict();

const settlementAuditCountsSchema = z.object({
  totalBatches: z.number().int().min(0),
  totalItems: z.number().int().min(0),
  totalPayables: z.number().int().min(0),
  totalQueueItems: z.number().int().min(0),
}).strict();

const settlementAuditStatusCountsSchema = z.object({
  status: z.string().min(1),
  count: z.number().int().min(0),
}).strict();

const settlementAuditAmountsSchema = z.object({
  itemsGrossAmount: z.number().min(0),
  itemsPlatformFee: z.number().min(0),
  itemsWorkerReceivable: z.number().min(0),
  payableGrossAmount: z.number().min(0),
  payablePlatformFee: z.number().min(0),
  payableWorkerReceivable: z.number().min(0),
  queueGrossAmount: z.number().min(0),
  queuePlatformFee: z.number().min(0),
  queueWorkerReceivable: z.number().min(0),
}).strict();

const settlementAuditBatchGroupSchema = z.object({
  settlementBatchId: idSchema,
  status: settlementBatchStatusSchema,
  itemCount: z.number().int().min(0),
  payableCount: z.number().int().min(0),
  queueCount: z.number().int().min(0),
}).strict();

export const settlementAuditSummaryResponseSchema = z.object({
  ok: z.literal(true),
  counts: settlementAuditCountsSchema,
  statusBreakdown: z.array(settlementAuditStatusCountsSchema),
  amounts: settlementAuditAmountsSchema,
  groups: z.array(settlementAuditBatchGroupSchema).nullable(),
}).strict();

export type SettlementAuditSummaryQueryInput = z.infer<typeof settlementAuditSummaryQuerySchema>;

// ── Phase 8L: Reconciliation Gap Scan ──

export const reconciliationGapTypeSchema = z.enum(["all", "batch-payable", "payable-queue", "queue-statement", "statement-review", "review-export", "export-integrity"]);

export const reconciliationGapScanQuerySchema = z.object({
  cityCode: cityCodeSchema.optional(),
  dateFrom: z.string().min(1).optional(),
  dateTo: z.string().min(1).optional(),
  gapType: reconciliationGapTypeSchema.optional(),
}).strict();

const reconciliationGapItemSchema = z.object({
  type: reconciliationGapTypeSchema,
  cityCode: cityCodeSchema,
  relatedId: idSchema,
  relatedType: z.string().min(1).max(64),
  severity: z.enum(["warning", "info"]),
  reason: z.string().min(1).max(512),
  detectedAt: z.string().min(1),
}).strict();

const reconciliationGapScanSummarySchema = z.object({
  totalGaps: z.number().int().min(0),
  gapsByType: z.record(z.number().int().min(0)),
}).strict();

export const reconciliationGapScanResponseSchema = z.object({
  ok: z.literal(true),
  summary: reconciliationGapScanSummarySchema,
  gaps: z.array(reconciliationGapItemSchema),
}).strict();

export type ReconciliationGapScanQueryInput = z.infer<typeof reconciliationGapScanQuerySchema>;