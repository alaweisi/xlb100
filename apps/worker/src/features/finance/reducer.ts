import type { WorkerBankAccountResponse, WorkerReceivableBalanceResponse, WorkerWithdrawalResponse } from "@xlb/api-client";

export type FinanceState = {
  balance: WorkerReceivableBalanceResponse | null;
  bankAccounts: WorkerBankAccountResponse[];
  withdrawals: WorkerWithdrawalResponse[];
  busy: boolean;
  error: string | null;
};
export type FinanceAction =
  | { type: "loading" }
  | { type: "loaded"; balance: WorkerReceivableBalanceResponse; bankAccounts: WorkerBankAccountResponse[]; withdrawals: WorkerWithdrawalResponse[] }
  | { type: "failed"; error: string }
  | { type: "cleared" };
export const initialFinanceState: FinanceState = { balance: null, bankAccounts: [], withdrawals: [], busy: false, error: null };

export function financeReducer(state: FinanceState, action: FinanceAction): FinanceState {
  if (action.type === "loading") return { ...state, busy: true, error: null };
  if (action.type === "loaded") return { balance: action.balance, bankAccounts: action.bankAccounts, withdrawals: action.withdrawals, busy: false, error: null };
  if (action.type === "failed") return { ...state, busy: false, error: action.error };
  return initialFinanceState;
}
