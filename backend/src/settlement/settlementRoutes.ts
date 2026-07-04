import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { settlementPreparationService } from "./settlementPreparationService.js";

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
}
