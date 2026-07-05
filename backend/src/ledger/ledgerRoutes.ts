import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { ledgerService } from "./ledgerService.js";

async function requireLedgerOperator(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const context = getRequestContext(request);
  if (context.appType !== "admin" || context.role !== "operator") {
    await reply.status(403).send({
      ok: false,
      error: "ledger requires admin operator",
    });
  }
}

export async function registerLedgerRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = [
    createRequestContextMiddleware({ requireCityCode: true }),
    requireLedgerOperator,
  ];

  app.post(
    "/api/internal/ledger/run-once",
    { preHandler },
    async (request) => ({
      ok: true,
      ...(await ledgerService.runOnce(getRequestContext(request))),
    }),
  );

  app.post(
    "/api/internal/ledger/reverse",
    { preHandler },
    async (request) => ({
      ok: true,
      ...(await ledgerService.runReversalsOnce(getRequestContext(request))),
    }),
  );

  app.get(
    "/api/internal/ledger/accruals",
    { preHandler },
    async (request) => ({
      ok: true,
      accruals: await ledgerService.listAccruals(getRequestContext(request)),
    }),
  );
}
