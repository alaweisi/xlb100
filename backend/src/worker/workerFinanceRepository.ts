import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  LedgerAccrual,
  RequestContext,
  WorkerBankAccount,
  WorkerReceivableAdjustment,
  WorkerReceivableBalance,
  WorkerWithdrawalRequest,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type BalanceRow = RowDataPacket & {
  city_code: string;
  worker_id: string;
  currency: "CNY";
  accrued_amount: string;
  adjusted_amount: string;
  requested_withdrawal_amount: string;
  marked_paid_amount: string;
  available_amount: string;
  created_at: Date;
  updated_at: Date;
};

type AdjustmentRow = RowDataPacket & {
  adjustment_id: string;
  city_code: string;
  refund_id: string;
  source_event_id: string;
  accrual_id: string;
  fulfillment_id: string;
  order_id: string;
  payment_order_id: string;
  worker_id: string;
  customer_id: string;
  gross_adjustment: string;
  platform_fee_adjustment: string;
  worker_receivable_adjustment: string;
  currency: "CNY";
  reason: "refund.approved";
  status: "applied";
  applied_at: Date;
  created_at: Date;
};

type BankAccountRow = RowDataPacket & {
  bank_account_id: string;
  city_code: string;
  worker_id: string;
  account_holder: string;
  bank_name: string;
  bank_branch: string | null;
  bank_card_masked: string;
  bank_card_last4: string;
  status: "active" | "inactive";
  created_at: Date;
  updated_at: Date;
};

type WithdrawalRow = RowDataPacket & {
  withdrawal_id: string;
  city_code: string;
  worker_id: string;
  bank_account_id: string;
  amount: string;
  currency: "CNY";
  status: WorkerWithdrawalRequest["status"];
  request_note: string | null;
  review_note: string | null;
  marked_paid_note: string | null;
  requested_at: Date;
  reviewed_at: Date | null;
  reviewed_by_admin_id: string | null;
  marked_paid_at: Date | null;
  marked_paid_by_admin_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ApplyRefundReceivableAdjustmentInput = {
  adjustmentId: string;
  cityCode: CityCode;
  refundId: string;
  sourceEventId: string;
  accrualId: string;
  fulfillmentId: string;
  orderId: string;
  paymentOrderId: string;
  workerId: string;
  customerId: string;
  grossAdjustment: number;
  platformFeeAdjustment: number;
  workerReceivableAdjustment: number;
};

export type UpsertWorkerBankAccountInput = {
  bankAccountId: string;
  cityCode: CityCode;
  workerId: string;
  accountHolder: string;
  bankName: string;
  bankBranch: string | null;
  bankCardMasked: string;
  bankCardLast4: string;
  bankCardHash: string;
};

export type InsertWorkerWithdrawalInput = {
  withdrawalId: string;
  cityCode: CityCode;
  workerId: string;
  bankAccountId: string;
  amount: number;
  requestNote: string | null;
};

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapBalance(row: BalanceRow): WorkerReceivableBalance {
  return {
    cityCode: row.city_code as CityCode,
    workerId: row.worker_id,
    currency: row.currency,
    accruedAmount: Number(row.accrued_amount),
    adjustedAmount: Number(row.adjusted_amount),
    requestedWithdrawalAmount: Number(row.requested_withdrawal_amount),
    markedPaidAmount: Number(row.marked_paid_amount),
    availableAmount: Number(row.available_amount),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapAdjustment(row: AdjustmentRow): WorkerReceivableAdjustment {
  return {
    adjustmentId: row.adjustment_id,
    cityCode: row.city_code as CityCode,
    refundId: row.refund_id,
    sourceEventId: row.source_event_id,
    accrualId: row.accrual_id,
    fulfillmentId: row.fulfillment_id,
    orderId: row.order_id,
    paymentOrderId: row.payment_order_id,
    workerId: row.worker_id,
    customerId: row.customer_id,
    grossAdjustment: Number(row.gross_adjustment),
    platformFeeAdjustment: Number(row.platform_fee_adjustment),
    workerReceivableAdjustment: Number(row.worker_receivable_adjustment),
    currency: row.currency,
    reason: row.reason,
    status: row.status,
    appliedAt: row.applied_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function mapBankAccount(row: BankAccountRow): WorkerBankAccount {
  return {
    bankAccountId: row.bank_account_id,
    cityCode: row.city_code as CityCode,
    workerId: row.worker_id,
    accountHolder: row.account_holder,
    bankName: row.bank_name,
    bankBranch: row.bank_branch,
    bankCardMasked: row.bank_card_masked,
    bankCardLast4: row.bank_card_last4,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapWithdrawal(row: WithdrawalRow): WorkerWithdrawalRequest {
  return {
    withdrawalId: row.withdrawal_id,
    cityCode: row.city_code as CityCode,
    workerId: row.worker_id,
    bankAccountId: row.bank_account_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    requestNote: row.request_note,
    reviewNote: row.review_note,
    markedPaidNote: row.marked_paid_note,
    requestedAt: row.requested_at.toISOString(),
    reviewedAt: toIso(row.reviewed_at),
    reviewedByAdminId: row.reviewed_by_admin_id,
    markedPaidAt: toIso(row.marked_paid_at),
    markedPaidByAdminId: row.marked_paid_by_admin_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class WorkerFinanceRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async recomputeBalance(
    connection: PoolConnection,
    cityCode: CityCode,
    workerId: string,
  ): Promise<WorkerReceivableBalance> {
    await connection.query(
      `INSERT INTO worker_receivable_balances (
         city_code, worker_id, currency, accrued_amount, adjusted_amount,
         requested_withdrawal_amount, marked_paid_amount, available_amount
       )
       SELECT ?, ?, 'CNY',
              COALESCE((SELECT SUM(worker_receivable)
                          FROM ledger_accruals
                         WHERE city_code = ? AND worker_id = ?), 0.00),
              COALESCE((SELECT SUM(worker_receivable_adjustment)
                          FROM worker_receivable_adjustments
                         WHERE city_code = ? AND worker_id = ?), 0.00),
              COALESCE((SELECT SUM(amount)
                          FROM worker_withdrawal_requests
                         WHERE city_code = ? AND worker_id = ?
                           AND status IN ('requested', 'approved')), 0.00),
              COALESCE((SELECT SUM(amount)
                          FROM worker_withdrawal_requests
                         WHERE city_code = ? AND worker_id = ?
                           AND status = 'marked_paid'), 0.00),
              COALESCE((SELECT SUM(worker_receivable)
                          FROM ledger_accruals
                         WHERE city_code = ? AND worker_id = ?), 0.00)
              + COALESCE((SELECT SUM(worker_receivable_adjustment)
                            FROM worker_receivable_adjustments
                           WHERE city_code = ? AND worker_id = ?), 0.00)
              - COALESCE((SELECT SUM(amount)
                            FROM worker_withdrawal_requests
                           WHERE city_code = ? AND worker_id = ?
                             AND status IN ('requested', 'approved')), 0.00)
              - COALESCE((SELECT SUM(amount)
                            FROM worker_withdrawal_requests
                           WHERE city_code = ? AND worker_id = ?
                             AND status = 'marked_paid'), 0.00)
       ON DUPLICATE KEY UPDATE
         accrued_amount = VALUES(accrued_amount),
         adjusted_amount = VALUES(adjusted_amount),
         requested_withdrawal_amount = VALUES(requested_withdrawal_amount),
         marked_paid_amount = VALUES(marked_paid_amount),
         available_amount = VALUES(available_amount)`,
      [
        cityCode,
        workerId,
        cityCode,
        workerId,
        cityCode,
        workerId,
        cityCode,
        workerId,
        cityCode,
        workerId,
        cityCode,
        workerId,
        cityCode,
        workerId,
        cityCode,
        workerId,
        cityCode,
        workerId,
      ],
    );
    const balance = await this.findBalanceForUpdate(connection, cityCode, workerId);
    if (!balance) {
      throw new Error("failed to recompute worker receivable balance");
    }
    return balance;
  }

  async applyAccrual(
    connection: PoolConnection,
    accrual: LedgerAccrual,
  ): Promise<WorkerReceivableBalance> {
    return this.recomputeBalance(connection, accrual.cityCode, accrual.workerId);
  }

  async applyRefundAdjustment(
    connection: PoolConnection,
    input: ApplyRefundReceivableAdjustmentInput,
  ): Promise<{ adjustment: WorkerReceivableAdjustment; idempotent: boolean; balance: WorkerReceivableBalance }> {
    const existing = await this.findAdjustmentByRefundForUpdate(
      connection,
      input.cityCode,
      input.refundId,
    );
    if (existing) {
      await this.markAccrualVoided(connection, input.cityCode, input.accrualId);
      const balance = await this.recomputeBalance(connection, input.cityCode, input.workerId);
      return { adjustment: existing, idempotent: true, balance };
    }

    await connection.query(
      `INSERT INTO worker_receivable_adjustments (
         adjustment_id, city_code, refund_id, source_event_id, accrual_id,
         fulfillment_id, order_id, payment_order_id, worker_id, customer_id,
         gross_adjustment, platform_fee_adjustment, worker_receivable_adjustment,
         currency, reason, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', 'refund.approved', 'applied')`,
      [
        input.adjustmentId,
        input.cityCode,
        input.refundId,
        input.sourceEventId,
        input.accrualId,
        input.fulfillmentId,
        input.orderId,
        input.paymentOrderId,
        input.workerId,
        input.customerId,
        input.grossAdjustment,
        input.platformFeeAdjustment,
        input.workerReceivableAdjustment,
      ],
    );
    await this.markAccrualVoided(connection, input.cityCode, input.accrualId);
    const adjustment = await this.findAdjustmentByRefundForUpdate(
      connection,
      input.cityCode,
      input.refundId,
    );
    if (!adjustment) {
      throw new Error("failed to load worker receivable adjustment");
    }
    const balance = await this.recomputeBalance(connection, input.cityCode, input.workerId);
    return { adjustment, idempotent: false, balance };
  }

  async findBalance(
    context: RequestContext,
    cityCode: CityCode,
    workerId: string,
  ): Promise<WorkerReceivableBalance | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker finance query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<BalanceRow[]>(
      `SELECT * FROM worker_receivable_balances
        WHERE ${where.clause} AND worker_id = ?
        LIMIT 1`,
      [...where.params, workerId],
    );
    return rows[0] ? mapBalance(rows[0]) : null;
  }

  async findBalanceForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    workerId: string,
  ): Promise<WorkerReceivableBalance | null> {
    const [rows] = await connection.query<BalanceRow[]>(
      `SELECT * FROM worker_receivable_balances
        WHERE city_code = ? AND worker_id = ?
        LIMIT 1 FOR UPDATE`,
      [cityCode, workerId],
    );
    return rows[0] ? mapBalance(rows[0]) : null;
  }

  async upsertBankAccount(
    connection: PoolConnection,
    input: UpsertWorkerBankAccountInput,
  ): Promise<WorkerBankAccount> {
    await connection.query(
      `INSERT INTO worker_bank_accounts (
         bank_account_id, city_code, worker_id, account_holder, bank_name,
         bank_branch, bank_card_masked, bank_card_last4, bank_card_hash, status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         account_holder = VALUES(account_holder),
         bank_name = VALUES(bank_name),
         bank_branch = VALUES(bank_branch),
         bank_card_masked = VALUES(bank_card_masked),
         bank_card_last4 = VALUES(bank_card_last4),
         status = 'active'`,
      [
        input.bankAccountId,
        input.cityCode,
        input.workerId,
        input.accountHolder,
        input.bankName,
        input.bankBranch,
        input.bankCardMasked,
        input.bankCardLast4,
        input.bankCardHash,
      ],
    );
    const [rows] = await connection.query<BankAccountRow[]>(
      `SELECT bank_account_id, city_code, worker_id, account_holder, bank_name,
              bank_branch, bank_card_masked, bank_card_last4, status,
              created_at, updated_at
         FROM worker_bank_accounts
        WHERE city_code = ? AND worker_id = ? AND bank_card_hash = ?
        LIMIT 1`,
      [input.cityCode, input.workerId, input.bankCardHash],
    );
    if (!rows[0]) {
      throw new Error("failed to load worker bank account");
    }
    return mapBankAccount(rows[0]);
  }

  async listBankAccounts(
    context: RequestContext,
    cityCode: CityCode,
    workerId: string,
  ): Promise<WorkerBankAccount[]> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker bank account query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<BankAccountRow[]>(
      `SELECT bank_account_id, city_code, worker_id, account_holder, bank_name,
              bank_branch, bank_card_masked, bank_card_last4, status,
              created_at, updated_at
         FROM worker_bank_accounts
        WHERE ${where.clause} AND worker_id = ?
        ORDER BY created_at DESC, bank_account_id DESC`,
      [...where.params, workerId],
    );
    return rows.map(mapBankAccount);
  }

  async findActiveBankAccountForWorker(
    connection: PoolConnection,
    cityCode: CityCode,
    workerId: string,
    bankAccountId: string,
  ): Promise<WorkerBankAccount | null> {
    const [rows] = await connection.query<BankAccountRow[]>(
      `SELECT bank_account_id, city_code, worker_id, account_holder, bank_name,
              bank_branch, bank_card_masked, bank_card_last4, status,
              created_at, updated_at
         FROM worker_bank_accounts
        WHERE city_code = ? AND worker_id = ? AND bank_account_id = ?
          AND status = 'active'
        LIMIT 1 FOR UPDATE`,
      [cityCode, workerId, bankAccountId],
    );
    return rows[0] ? mapBankAccount(rows[0]) : null;
  }

  async insertWithdrawal(
    connection: PoolConnection,
    input: InsertWorkerWithdrawalInput,
  ): Promise<WorkerWithdrawalRequest> {
    await connection.query(
      `INSERT INTO worker_withdrawal_requests (
         withdrawal_id, city_code, worker_id, bank_account_id,
         amount, currency, status, request_note
       )
       VALUES (?, ?, ?, ?, ?, 'CNY', 'requested', ?)`,
      [
        input.withdrawalId,
        input.cityCode,
        input.workerId,
        input.bankAccountId,
        input.amount,
        input.requestNote,
      ],
    );
    const withdrawal = await this.findWithdrawalForUpdate(
      connection,
      input.cityCode,
      input.withdrawalId,
    );
    if (!withdrawal) {
      throw new Error("failed to load worker withdrawal request");
    }
    return withdrawal;
  }

  async findWithdrawalForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    withdrawalId: string,
  ): Promise<WorkerWithdrawalRequest | null> {
    const [rows] = await connection.query<WithdrawalRow[]>(
      `SELECT * FROM worker_withdrawal_requests
        WHERE city_code = ? AND withdrawal_id = ?
        LIMIT 1 FOR UPDATE`,
      [cityCode, withdrawalId],
    );
    return rows[0] ? mapWithdrawal(rows[0]) : null;
  }

  async updateWithdrawalReviewed(
    connection: PoolConnection,
    cityCode: CityCode,
    withdrawalId: string,
    decision: "approved" | "rejected",
    reviewedByAdminId: string,
    reviewNote: string | null,
  ): Promise<WorkerWithdrawalRequest> {
    await connection.query(
      `UPDATE worker_withdrawal_requests
          SET status = ?, reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by_admin_id = ?, review_note = ?
        WHERE city_code = ? AND withdrawal_id = ? AND status = 'requested'`,
      [decision, reviewedByAdminId, reviewNote, cityCode, withdrawalId],
    );
    const updated = await this.findWithdrawalForUpdate(connection, cityCode, withdrawalId);
    if (!updated) {
      throw new Error("failed to load reviewed worker withdrawal request");
    }
    return updated;
  }

  async updateWithdrawalMarkedPaid(
    connection: PoolConnection,
    cityCode: CityCode,
    withdrawalId: string,
    markedByAdminId: string,
    markedPaidNote: string | null,
  ): Promise<WorkerWithdrawalRequest> {
    await connection.query(
      `UPDATE worker_withdrawal_requests
          SET status = 'marked_paid', marked_paid_at = CURRENT_TIMESTAMP,
              marked_paid_by_admin_id = ?, marked_paid_note = ?
        WHERE city_code = ? AND withdrawal_id = ? AND status = 'approved'`,
      [markedByAdminId, markedPaidNote, cityCode, withdrawalId],
    );
    const updated = await this.findWithdrawalForUpdate(connection, cityCode, withdrawalId);
    if (!updated) {
      throw new Error("failed to load marked worker withdrawal request");
    }
    return updated;
  }

  async listWithdrawals(
    context: RequestContext,
    cityCode: CityCode,
    query: { workerId?: string; status?: WorkerWithdrawalRequest["status"]; limit?: number } = {},
  ): Promise<WorkerWithdrawalRequest[]> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker withdrawal query");
    }
    const where = buildCityScopedWhere(cityCode);
    const clauses = [where.clause];
    const params: unknown[] = [...where.params];
    if (query.workerId) {
      clauses.push("worker_id = ?");
      params.push(query.workerId);
    }
    if (query.status) {
      clauses.push("status = ?");
      params.push(query.status);
    }
    params.push(Math.min(Math.max(query.limit ?? 100, 1), 200));
    const [rows] = await this.pool.query<WithdrawalRow[]>(
      `SELECT * FROM worker_withdrawal_requests
        WHERE ${clauses.join(" AND ")}
        ORDER BY requested_at DESC, withdrawal_id DESC
        LIMIT ?`,
      params,
    );
    return rows.map(mapWithdrawal);
  }

  private async findAdjustmentByRefundForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    refundId: string,
  ): Promise<WorkerReceivableAdjustment | null> {
    const [rows] = await connection.query<AdjustmentRow[]>(
      `SELECT * FROM worker_receivable_adjustments
        WHERE city_code = ? AND refund_id = ?
        LIMIT 1 FOR UPDATE`,
      [cityCode, refundId],
    );
    return rows[0] ? mapAdjustment(rows[0]) : null;
  }

  private async markAccrualVoided(
    connection: PoolConnection,
    cityCode: CityCode,
    accrualId: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE ledger_accruals
          SET status = 'voided'
        WHERE city_code = ? AND accrual_id = ? AND status = 'accrued'`,
      [cityCode, accrualId],
    );
  }
}

export const workerFinanceRepository = new WorkerFinanceRepository();
