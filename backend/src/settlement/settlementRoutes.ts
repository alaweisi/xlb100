import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { settlementPreparationService } from "./settlementPreparationService.js";
import {
  confirmSettlementBatchRequestSchema,
  markSettlementPayableRequestSchema,
  settlementConfirmationResponseSchema,
  settlementPayableResponseSchema,
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

async function requireSettlementOperator(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const context = getRequestContext(request);
  if (context.appType !== "admin" || context.role !== "operator") {
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
}
