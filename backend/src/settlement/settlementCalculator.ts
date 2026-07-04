import type { LedgerAccrual } from "@xlb/types";

export type SettlementTotals = {
  totalGrossAmount: number;
  totalPlatformFee: number;
  totalWorkerReceivable: number;
  itemCount: number;
  currency: "CNY";
};

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateSettlementTotals(
  accruals: Pick<LedgerAccrual, "grossAmount" | "platformFee" | "workerReceivable">[],
): SettlementTotals {
  return {
    totalGrossAmount: roundMoney(accruals.reduce((sum, row) => sum + row.grossAmount, 0)),
    totalPlatformFee: roundMoney(accruals.reduce((sum, row) => sum + row.platformFee, 0)),
    totalWorkerReceivable: roundMoney(accruals.reduce((sum, row) => sum + row.workerReceivable, 0)),
    itemCount: accruals.length,
    currency: "CNY",
  };
}
