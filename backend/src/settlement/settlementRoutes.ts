import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { canAccessAdminOperation } from "../auth/operationsAuthorization.js";
import { settlementPreparationService } from "./settlementPreparationService.js";
import {
  confirmSettlementBatchRequestSchema,
  enqueueSettlementPayableRequestSchema,
  markSettlementPayableRequestSchema,
  generateWorkerReceivableStatementsRequestSchema,
  settlementConfirmationResponseSchema,
  settlementPayableQueueResponseSchema,
  settlementPayableResponseSchema,
  generateWorkerReceivableStatementsResponseSchema,
  listWorkerReceivableStatementsResponseSchema,
  getWorkerReceivableStatementResponseSchema,
  reviewWorkerReceivableStatementRequestSchema,
  reviewWorkerReceivableStatementResponseSchema,
  getWorkerReceivableStatementReviewResponseSchema,
  exportWorkerReceivableStatementRequestSchema,
  exportWorkerReceivableStatementResponseSchema,
  getWorkerReceivableStatementExportResponseSchema,
} from "@xlb/validators";
import {
  settlementConfirmationService,
  SettlementBatchNotFoundError,
  SettlementConfirmationError,
} from "./settlementConfirmationService.js";
import {
  settlementPayableService,
  SettlementPayableError,
} from "./settlementPayableService.js";
import {
  settlementPayableQueueService,
  SettlementPayableNotFoundError,
  SettlementPayableQueueError,
} from "./settlementPayableQueueService.js";
import {
  workerReceivableStatementService,
  WorkerReceivableStatementNotFoundError,
  WorkerReceivableStatementError,
} from "./workerReceivableStatementService.js";
import {
  workerReceivableStatementReviewService,
  WorkerReceivableStatementReviewNotFoundError,
  WorkerReceivableStatementReviewError,
} from "./workerReceivableStatementReviewService.js";

import {
  workerReceivableStatementExportService,
  WorkerReceivableStatementExportNotFoundError,
  WorkerReceivableStatementExportError,
} from "./workerReceivableStatementExportService.js";

import {
  workerReceivableStatementAuditService,
  WorkerReceivableStatementAuditError,
} from "./workerReceivableStatementAuditService.js";
import {
  statementAuditQuerySchema,
  exportAuditQuerySchema,
  workerStatementReviewSummaryQuerySchema,
  settlementAuditSummaryQuerySchema,
  reconciliationGapScanQuerySchema,
} from "@xlb/validators";
import {
  workerReceivableStatementReviewSummaryService,
  WorkerStatementReviewSummaryError,
} from "./workerReceivableStatementReviewSummaryService.js";
import {
  settlementAuditSummaryService,
  SettlementAuditSummaryError,
} from "./settlementAuditSummaryService.js";
import {
  reconciliationGapScanService,
  ReconciliationGapScanError,
} from "./reconciliationGapScanService.js";

async function requireSettlementOperator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const context = getRequestContext(request);
  if (!canAccessAdminOperation(context, ["operator"])) {
    await reply.status(403).send({ ok: false, error: "settlement preparation requires admin operator" });
  }
}

export async function registerSettlementRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [
    createRequestContextMiddleware({ requireCityCode: true }),
    requireSettlementOperator,
  ];

  app.post("/api/internal/settlement/prepare-once", { preHandler }, async (request) => {
    const result = await settlementPreparationService.prepareOnce(getRequestContext(request));
    return { ok: true, processed: result.processed, batch: result.batch };
  });

  app.get("/api/internal/settlement/batches", { preHandler }, async (request) => ({
    ok: true,
    batches: await settlementPreparationService.listBatches(getRequestContext(request)),
  }));

  app.get<{ Params: { batchId: string } }>(
    "/api/internal/settlement/batches/:batchId/items",
    { preHandler },
    async (request, reply) => {
      const items = await settlementPreparationService.listBatchItems(
        getRequestContext(request), request.params.batchId,
      );
      if (items === null) return reply.status(404).send({ ok: false, error: "settlement batch not found in city scope" });
      return { ok: true, items };
    },
  );

  app.post<{ Params: { batchId: string } }>(
    "/api/internal/settlement/batches/:batchId/confirm",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      if (!context.userId) {
        return reply.status(403).send({ ok: false, error: "settlement confirmation requires operator userId" });
      }
      if (!confirmSettlementBatchRequestSchema.safeParse(request.body ?? {}).success) {
        return reply.status(400).send({ ok: false, error: "invalid settlement confirmation body" });
      }
      try {
        const result = await settlementConfirmationService.confirmBatch(context, request.params.batchId);
        return settlementConfirmationResponseSchema.parse({ ok: true, ...result });
      } catch (error) {
        if (error instanceof SettlementBatchNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof SettlementConfirmationError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { batchId: string } }>(
    "/api/internal/settlement/batches/:batchId/mark-payable",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      if (!context.userId) {
        return reply.status(403).send({ ok: false, error: "settlement payable readiness requires operator userId" });
      }
      if (!markSettlementPayableRequestSchema.safeParse(request.body ?? {}).success) {
        return reply.status(400).send({ ok: false, error: "invalid settlement payable readiness body" });
      }
      try {
        const result = await settlementPayableService.markSettlementPayable(context, request.params.batchId);
        return settlementPayableResponseSchema.parse({ ok: true, ...result });
      } catch (error) {
        if (error instanceof SettlementBatchNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof SettlementPayableError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { batchId: string } }>(
    "/api/internal/settlement/batches/:batchId/payable",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const payable = await settlementPayableService.getPayableByBatch(context, request.params.batchId);
      if (payable === null) {
        return reply.status(404).send({ ok: false, error: "settlement payable not found in city scope" });
      }
      return { ok: true, payable };
    },
  );

  app.post<{ Params: { payableId: string } }>(
    "/api/internal/settlement/payables/:payableId/enqueue-once",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      if (!context.userId) {
        return reply.status(403).send({ ok: false, error: "settlement payable queue requires operator userId" });
      }
      if (!enqueueSettlementPayableRequestSchema.safeParse(request.body ?? {}).success) {
        return reply.status(400).send({ ok: false, error: "invalid settlement payable queue body" });
      }
      try {
        const result = await settlementPayableQueueService.enqueueSettlementPayable(context, request.params.payableId);
        return settlementPayableQueueResponseSchema.parse({ ok: true, ...result });
      } catch (error) {
        if (error instanceof SettlementPayableNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof SettlementPayableQueueError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { payableId: string } }>(
    "/api/internal/settlement/payables/:payableId/queue",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const queue = await settlementPayableQueueService.getQueueByPayable(context, request.params.payableId);
      if (queue === null) {
        return reply.status(404).send({ ok: false, error: "settlement payable queue not found in city scope" });
      }
      return { ok: true, queue };
    },
  );

  app.post<{ Params: { payableId: string } }>(
    "/api/internal/settlement/payables/:payableId/generate-worker-statements-once",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      if (!context.userId) {
        return reply.status(403).send({ ok: false, error: "worker receivable statement generation requires operator userId" });
      }
      if (!generateWorkerReceivableStatementsRequestSchema.safeParse(request.body ?? {}).success) {
        return reply.status(400).send({ ok: false, error: "invalid worker receivable statement generation body" });
      }
      try {
        const result = await workerReceivableStatementService.generateWorkerReceivableStatements(
          context,
          request.params.payableId,
        );
        return generateWorkerReceivableStatementsResponseSchema.parse({ ok: true, ...result });
      } catch (error) {
        if (error instanceof WorkerReceivableStatementNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof WorkerReceivableStatementError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { payableId: string } }>(
    "/api/internal/settlement/payables/:payableId/worker-statements",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const statements = await workerReceivableStatementService.listWorkerReceivableStatementsByPayable(
        context,
        request.params.payableId,
      );
      if (statements === null) {
        return reply.status(404).send({ ok: false, error: "settlement payable not found in city scope" });
      }
      return listWorkerReceivableStatementsResponseSchema.parse({ ok: true, statements });
    },
  );

  app.get<{ Params: { statementId: string } }>(
    "/api/internal/settlement/worker-statements/:statementId",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const result = await workerReceivableStatementService.getWorkerReceivableStatement(
        context,
        request.params.statementId,
      );
      if (result === null) {
        return reply.status(404).send({ ok: false, error: "worker receivable statement not found in city scope" });
      }
      return getWorkerReceivableStatementResponseSchema.parse({ ok: true, ...result });
    },
  );

  app.post<{ Params: { statementId: string } }>(
    "/api/internal/settlement/worker-statements/:statementId/review-once",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      if (!context.userId) {
        return reply.status(403).send({ ok: false, error: "worker receivable statement review requires operator userId" });
      }
      const parsed = reviewWorkerReceivableStatementRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid worker receivable statement review body" });
      }
      try {
        const result = await workerReceivableStatementReviewService.reviewWorkerReceivableStatementOnce(
          context,
          request.params.statementId,
          parsed.data,
        );
        return reviewWorkerReceivableStatementResponseSchema.parse({ ok: true, ...result });
      } catch (error) {
        if (error instanceof WorkerReceivableStatementReviewNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof WorkerReceivableStatementReviewError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { statementId: string } }>(
    "/api/internal/settlement/worker-statements/:statementId/review",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const review = await workerReceivableStatementReviewService.getWorkerReceivableStatementReview(
        context,
        request.params.statementId,
      );
      if (review === null) {
        return reply.status(404).send({ ok: false, error: "worker receivable statement review not found in city scope" });
      }
      return getWorkerReceivableStatementReviewResponseSchema.parse({ ok: true, review });
    },
  );

  app.post<{ Params: { statementId: string } }>(
    "/api/internal/settlement/worker-statements/:statementId/export-once",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      if (!context.userId) {
        return reply.status(403).send({ ok: false, error: "worker receivable statement export requires operator userId" });
      }
      const parsed = exportWorkerReceivableStatementRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid worker receivable statement export body" });
      }
      try {
        const result = await workerReceivableStatementExportService.exportWorkerReceivableStatementOnce(
          context,
          request.params.statementId,
          parsed.data,
        );
        return exportWorkerReceivableStatementResponseSchema.parse({ ok: true, ...result });
      } catch (error) {
        if (error instanceof WorkerReceivableStatementExportNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        if (error instanceof WorkerReceivableStatementExportError) {
          return reply.status(409).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { statementId: string } }>(
    "/api/internal/settlement/worker-statements/:statementId/export",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const exportRecord = await workerReceivableStatementExportService.getWorkerReceivableStatementExport(
        context,
        request.params.statementId,
      );
      if (exportRecord === null) {
        return reply.status(404).send({ ok: false, error: "worker receivable statement export not found in city scope" });
      }
      return getWorkerReceivableStatementExportResponseSchema.parse({ ok: true, export: exportRecord });
    },
  );

  // ── Phase 8I: Audit Query Routes ──

  // Fixed path first — registered before parameterised route to avoid ambiguity
  app.get(
    "/api/internal/settlement/worker-statement-audit",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = statementAuditQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid audit query parameters" });
      }
      try {
        const result = await workerReceivableStatementAuditService.listStatementAudit(context, parsed.data);
        return { ok: true, items: result.items, nextCursor: result.nextCursor };
      } catch (error) {
        if (error instanceof WorkerReceivableStatementAuditError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { statementId: string } }>(
    "/api/internal/settlement/worker-statement-audit/:statementId",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      try {
        const detail = await workerReceivableStatementAuditService.getStatementAuditDetail(
          context,
          request.params.statementId,
        );
        if (detail === null) {
          return reply.status(404).send({ ok: false, error: "worker receivable statement audit not found in city scope" });
        }
        return { ok: true, ...detail };
      } catch (error) {
        if (error instanceof WorkerReceivableStatementAuditError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  app.get(
    "/api/internal/settlement/worker-statement-export-audit",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = exportAuditQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid export audit query parameters" });
      }
      try {
        const result = await workerReceivableStatementAuditService.listExportAudit(context, parsed.data);
        return { ok: true, items: result.items, nextCursor: result.nextCursor };
      } catch (error) {
        if (error instanceof WorkerReceivableStatementAuditError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  // ── Phase 8J: Review Summary ──
  app.get(
    "/api/internal/settlement/worker-statement-review-summary",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = workerStatementReviewSummaryQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: "invalid review summary query" });
      }
      try {
        const result = await workerReceivableStatementReviewSummaryService.getReviewSummary(context, parsed.data);
        return { ok: true, ...result };
      } catch (error) {
        if (error instanceof WorkerStatementReviewSummaryError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );

  // ── Phase 8K: Settlement Audit Summary ──
  app.get(
    "/api/internal/settlement/settlement-audit-summary",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = settlementAuditSummaryQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid audit summary query" });
      try {
        const result = await settlementAuditSummaryService.getAuditSummary(context, parsed.data);
        return { ok: true, ...result };
      } catch (error) {
        if (error instanceof SettlementAuditSummaryError) return reply.status(400).send({ ok: false, error: error.message });
        throw error;
      }
    },
  );

  // ── Phase 8L: Reconciliation Gap Scan ──
  app.get(
    "/api/internal/settlement/reconciliation-gap-scan",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const parsed = reconciliationGapScanQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) return reply.status(400).send({ ok: false, error: "invalid gap scan query" });
      try {
        const result = await reconciliationGapScanService.scanGaps(context, parsed.data);
        return { ok: true, ...result };
      } catch (error) {
        if (error instanceof ReconciliationGapScanError) return reply.status(400).send({ ok: false, error: error.message });
        throw error;
      }
    },
  );
}
