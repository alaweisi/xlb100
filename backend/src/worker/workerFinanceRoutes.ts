import type { FastifyInstance, FastifyReply } from "fastify";
import type { WorkerWithdrawalRequest } from "@xlb/types";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  workerFinanceService,
  WorkerFinanceConflictError,
  WorkerFinanceForbiddenError,
  WorkerFinanceNotFoundError,
  WorkerFinanceValidationError,
} from "./workerFinanceService.js";

const withdrawalStatuses: WorkerWithdrawalRequest["status"][] = [
  "requested",
  "approved",
  "rejected",
  "marked_paid",
  "cancelled",
];

function sendWorkerFinanceError(error: unknown, reply: FastifyReply) {
  if (
    error instanceof WorkerFinanceValidationError ||
    error instanceof WorkerFinanceForbiddenError ||
    error instanceof WorkerFinanceNotFoundError ||
    error instanceof WorkerFinanceConflictError
  ) {
    return reply.status(error.statusCode).send({ ok: false, error: error.message });
  }
  throw error;
}

function parseWithdrawalQuery(query: unknown): {
  workerId?: string;
  status?: WorkerWithdrawalRequest["status"];
  limit?: number;
} {
  const value = (query ?? {}) as {
    workerId?: string;
    status?: string;
    limit?: string | number;
  };
  const parsed: {
    workerId?: string;
    status?: WorkerWithdrawalRequest["status"];
    limit?: number;
  } = {};
  if (value.workerId?.trim()) {
    parsed.workerId = value.workerId.trim();
  }
  if (value.status?.trim()) {
    if (!withdrawalStatuses.includes(value.status.trim() as WorkerWithdrawalRequest["status"])) {
      throw new WorkerFinanceValidationError("invalid worker withdrawal status");
    }
    parsed.status = value.status.trim() as WorkerWithdrawalRequest["status"];
  }
  if (value.limit !== undefined) {
    const limit = Number(value.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new WorkerFinanceValidationError("invalid worker withdrawal limit");
    }
    parsed.limit = limit;
  }
  return parsed;
}

export async function registerWorkerFinanceRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });

  app.get("/api/worker/finance/balance", { preHandler }, async (request, reply) => {
    try {
      const balance = await workerFinanceService.getMyBalance(getRequestContext(request));
      return { ok: true, balance };
    } catch (error) {
      return sendWorkerFinanceError(error, reply);
    }
  });

  app.post("/api/worker/bank-accounts", { preHandler }, async (request, reply) => {
    try {
      const bankAccount = await workerFinanceService.createBankAccount(
        getRequestContext(request),
        request.body,
      );
      return { ok: true, bankAccount };
    } catch (error) {
      return sendWorkerFinanceError(error, reply);
    }
  });

  app.get("/api/worker/bank-accounts", { preHandler }, async (request, reply) => {
    try {
      const bankAccounts = await workerFinanceService.listMyBankAccounts(
        getRequestContext(request),
      );
      return { ok: true, bankAccounts };
    } catch (error) {
      return sendWorkerFinanceError(error, reply);
    }
  });

  app.post("/api/worker/withdrawal-requests", { preHandler }, async (request, reply) => {
    try {
      const result = await workerFinanceService.createWithdrawalRequest(
        getRequestContext(request),
        request.body,
      );
      return { ok: true, ...result };
    } catch (error) {
      return sendWorkerFinanceError(error, reply);
    }
  });

  app.get("/api/worker/withdrawal-requests", { preHandler }, async (request, reply) => {
    try {
      const withdrawals = await workerFinanceService.listMyWithdrawalRequests(
        getRequestContext(request),
      );
      return { ok: true, withdrawals };
    } catch (error) {
      return sendWorkerFinanceError(error, reply);
    }
  });

  app.get("/api/internal/worker-withdrawals", { preHandler }, async (request, reply) => {
    try {
      const withdrawals = await workerFinanceService.listWithdrawalRequests(
        getRequestContext(request),
        parseWithdrawalQuery(request.query),
      );
      return { ok: true, withdrawals };
    } catch (error) {
      return sendWorkerFinanceError(error, reply);
    }
  });

  app.post<{ Params: { withdrawalId: string } }>(
    "/api/internal/worker-withdrawals/:withdrawalId/review",
    { preHandler },
    async (request, reply) => {
      try {
        const result = await workerFinanceService.reviewWithdrawalRequest(
          getRequestContext(request),
          request.params.withdrawalId,
          request.body,
        );
        return { ok: true, ...result };
      } catch (error) {
        return sendWorkerFinanceError(error, reply);
      }
    },
  );

  app.post<{ Params: { withdrawalId: string } }>(
    "/api/internal/worker-withdrawals/:withdrawalId/mark-paid",
    { preHandler },
    async (request, reply) => {
      try {
        const result = await workerFinanceService.markWithdrawalRequestPaid(
          getRequestContext(request),
          request.params.withdrawalId,
          request.body,
        );
        return { ok: true, ...result };
      } catch (error) {
        return sendWorkerFinanceError(error, reply);
      }
    },
  );
}
