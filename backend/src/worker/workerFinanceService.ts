import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type {
  RequestContext,
  WorkerBankAccount,
  WorkerReceivableBalance,
  WorkerWithdrawalRequest,
} from "@xlb/types";
import {
  createWorkerBankAccountRequestSchema,
  createWorkerWithdrawalRequestSchema,
  markWorkerWithdrawalPaidRequestSchema,
  reviewWorkerWithdrawalRequestSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import {
  generateWorkerBankAccountId,
  generateWorkerWithdrawalId,
} from "../events/eventIds.js";
import { workerService } from "./workerService.js";
import {
  workerFinanceRepository,
  WorkerFinanceRepository,
} from "./workerFinanceRepository.js";

export class WorkerFinanceValidationError extends Error {
  readonly statusCode = 400;
}

export class WorkerFinanceForbiddenError extends Error {
  readonly statusCode = 403;
}

export class WorkerFinanceNotFoundError extends Error {
  readonly statusCode = 404;
}

export class WorkerFinanceConflictError extends Error {
  readonly statusCode = 409;
}

type TransactionRunner = <T>(
  callback: (connection: PoolConnection) => Promise<T>,
) => Promise<T>;

type WorkerFinanceContext = {
  cityCode: ReturnType<typeof assertCityScopedContext>;
  workerId: string;
};

type AdminFinanceContext = {
  cityCode: ReturnType<typeof assertCityScopedContext>;
  adminId: string | null;
};

function money(input: number): number {
  return Number(input.toFixed(2));
}

function normalizeCardNumber(cardNumber: string): string {
  return cardNumber.replace(/\s+/g, "");
}

function maskCardNumber(cardNumber: string): { masked: string; last4: string } {
  const normalized = normalizeCardNumber(cardNumber);
  const last4 = normalized.slice(-4);
  return {
    last4,
    masked: `**** **** **** ${last4}`,
  };
}

function hashCardNumber(cityCode: string, workerId: string, cardNumber: string): string {
  return createHash("sha256")
    .update(`${cityCode}:${workerId}:${normalizeCardNumber(cardNumber)}`)
    .digest("hex");
}

export class WorkerFinanceService {
  constructor(
    private readonly repository: WorkerFinanceRepository = workerFinanceRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  async getMyBalance(context: RequestContext): Promise<WorkerReceivableBalance> {
    const { cityCode, workerId } = await this.requireWorkerContext(context);
    return this.transactionRunner((connection) =>
      this.repository.recomputeBalance(connection, cityCode, workerId),
    );
  }

  async createBankAccount(
    context: RequestContext,
    body: unknown,
  ): Promise<WorkerBankAccount> {
    const parsed = createWorkerBankAccountRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new WorkerFinanceValidationError(parsed.error.message);
    }
    const { cityCode, workerId } = await this.requireWorkerContext(context);
    const { masked, last4 } = maskCardNumber(parsed.data.bankCardNumber);
    return this.transactionRunner((connection) =>
      this.repository.upsertBankAccount(connection, {
        bankAccountId: generateWorkerBankAccountId(),
        cityCode,
        workerId,
        accountHolder: parsed.data.accountHolder,
        bankName: parsed.data.bankName,
        bankBranch: parsed.data.bankBranch ?? null,
        bankCardMasked: masked,
        bankCardLast4: last4,
        bankCardHash: hashCardNumber(cityCode, workerId, parsed.data.bankCardNumber),
      }),
    );
  }

  async listMyBankAccounts(context: RequestContext): Promise<WorkerBankAccount[]> {
    const { cityCode, workerId } = await this.requireWorkerContext(context);
    return this.repository.listBankAccounts(context, cityCode, workerId);
  }

  async createWithdrawalRequest(
    context: RequestContext,
    body: unknown,
  ): Promise<{
    withdrawal: WorkerWithdrawalRequest;
    balance: WorkerReceivableBalance;
  }> {
    const parsed = createWorkerWithdrawalRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new WorkerFinanceValidationError(parsed.error.message);
    }
    const { cityCode, workerId } = await this.requireWorkerContext(context);
    const amount = money(parsed.data.amount);
    return this.transactionRunner(async (connection) => {
      const bankAccount = await this.repository.findActiveBankAccountForWorker(
        connection,
        cityCode,
        workerId,
        parsed.data.bankAccountId,
      );
      if (!bankAccount) {
        throw new WorkerFinanceNotFoundError("active worker bank account not found");
      }

      const balance = await this.repository.recomputeBalance(connection, cityCode, workerId);
      if (balance.availableAmount < amount) {
        throw new WorkerFinanceConflictError("insufficient worker receivable balance");
      }

      const withdrawal = await this.repository.insertWithdrawal(connection, {
        withdrawalId: generateWorkerWithdrawalId(),
        cityCode,
        workerId,
        bankAccountId: parsed.data.bankAccountId,
        amount,
        requestNote: parsed.data.requestNote ?? null,
      });
      const updatedBalance = await this.repository.recomputeBalance(connection, cityCode, workerId);
      return { withdrawal, balance: updatedBalance };
    });
  }

  async listMyWithdrawalRequests(context: RequestContext): Promise<WorkerWithdrawalRequest[]> {
    const { cityCode, workerId } = await this.requireWorkerContext(context);
    return this.repository.listWithdrawals(context, cityCode, { workerId });
  }

  async listWithdrawalRequests(
    context: RequestContext,
    query: { workerId?: string; status?: WorkerWithdrawalRequest["status"]; limit?: number } = {},
  ): Promise<WorkerWithdrawalRequest[]> {
    const { cityCode } = this.requireAdminContext(context, false);
    return this.repository.listWithdrawals(context, cityCode, query);
  }

  async reviewWithdrawalRequest(
    context: RequestContext,
    withdrawalId: string,
    body: unknown,
  ): Promise<{
    withdrawal: WorkerWithdrawalRequest;
    balance: WorkerReceivableBalance;
    idempotent: boolean;
  }> {
    const parsed = reviewWorkerWithdrawalRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new WorkerFinanceValidationError(parsed.error.message);
    }
    const { cityCode, adminId } = this.requireAdminContext(context, true);
    return this.transactionRunner(async (connection) => {
      const withdrawal = await this.repository.findWithdrawalForUpdate(
        connection,
        cityCode,
        withdrawalId,
      );
      if (!withdrawal) {
        throw new WorkerFinanceNotFoundError("worker withdrawal request not found");
      }

      if (
        withdrawal.status === parsed.data.decision ||
        (withdrawal.status === "marked_paid" && parsed.data.decision === "approved")
      ) {
        const balance = await this.repository.recomputeBalance(
          connection,
          cityCode,
          withdrawal.workerId,
        );
        return { withdrawal, balance, idempotent: true };
      }

      if (withdrawal.status !== "requested") {
        throw new WorkerFinanceConflictError(
          `worker withdrawal request cannot be reviewed from status ${withdrawal.status}`,
        );
      }

      const reviewed = await this.repository.updateWithdrawalReviewed(
        connection,
        cityCode,
        withdrawalId,
        parsed.data.decision,
        adminId!,
        parsed.data.reviewNote ?? null,
      );
      const balance = await this.repository.recomputeBalance(
        connection,
        cityCode,
        reviewed.workerId,
      );
      return { withdrawal: reviewed, balance, idempotent: false };
    });
  }

  async markWithdrawalRequestPaid(
    context: RequestContext,
    withdrawalId: string,
    body: unknown,
  ): Promise<{
    withdrawal: WorkerWithdrawalRequest;
    balance: WorkerReceivableBalance;
    idempotent: boolean;
  }> {
    const parsed = markWorkerWithdrawalPaidRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new WorkerFinanceValidationError(parsed.error.message);
    }
    const { cityCode, adminId } = this.requireAdminContext(context, true);
    return this.transactionRunner(async (connection) => {
      const withdrawal = await this.repository.findWithdrawalForUpdate(
        connection,
        cityCode,
        withdrawalId,
      );
      if (!withdrawal) {
        throw new WorkerFinanceNotFoundError("worker withdrawal request not found");
      }
      if (withdrawal.status === "marked_paid") {
        const balance = await this.repository.recomputeBalance(
          connection,
          cityCode,
          withdrawal.workerId,
        );
        return { withdrawal, balance, idempotent: true };
      }
      if (withdrawal.status !== "approved") {
        throw new WorkerFinanceConflictError(
          `worker withdrawal request cannot be marked paid from status ${withdrawal.status}`,
        );
      }
      const marked = await this.repository.updateWithdrawalMarkedPaid(
        connection,
        cityCode,
        withdrawalId,
        adminId!,
        parsed.data.markedPaidNote ?? null,
      );
      const balance = await this.repository.recomputeBalance(
        connection,
        cityCode,
        marked.workerId,
      );
      return { withdrawal: marked, balance, idempotent: false };
    });
  }

  private async requireWorkerContext(context: RequestContext): Promise<WorkerFinanceContext> {
    const cityCode = assertCityScopedContext(context);
    if (context.appType !== "worker" || context.role !== "worker" || !context.userId) {
      throw new WorkerFinanceForbiddenError("worker finance requires worker identity");
    }
    try {
      await workerService.assertWorkerBoundToCity(context.userId, cityCode);
    } catch (error) {
      throw new WorkerFinanceForbiddenError(
        error instanceof Error ? error.message : "worker is not bound to city",
      );
    }
    return { cityCode, workerId: context.userId };
  }

  private requireAdminContext(
    context: RequestContext,
    requireUserId: boolean,
  ): AdminFinanceContext {
    const cityCode = assertCityScopedContext(context);
    if (context.appType !== "admin" || context.role !== "operator") {
      throw new WorkerFinanceForbiddenError("worker finance admin actions require operator identity");
    }
    if (requireUserId && !context.userId) {
      throw new WorkerFinanceForbiddenError("worker finance admin action requires operator userId");
    }
    return { cityCode, adminId: context.userId ?? null };
  }
}

export const workerFinanceService = new WorkerFinanceService();
