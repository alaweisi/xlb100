export type LedgerAmounts = {
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  currency: "CNY";
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLedgerAccrual(grossAmount: number): LedgerAmounts {
  const gross = roundMoney(grossAmount);
  const platformFee = roundMoney(gross * 0.1);
  return {
    grossAmount: gross,
    platformFee,
    workerReceivable: roundMoney(gross - platformFee),
    currency: "CNY",
  };
}
