export type WorkerSupportUiState = { busy: string | null; error: string | null; notice: string | null };
export type WorkerSupportUiAction = { type: "started"; operation: string } | { type: "failed"; message: string } | { type: "succeeded"; message?: string };
export const initialWorkerSupportUiState: WorkerSupportUiState = { busy: null, error: null, notice: null };
export function workerSupportUiReducer(state: WorkerSupportUiState, action: WorkerSupportUiAction): WorkerSupportUiState {
  if (action.type === "started") return { busy: action.operation, error: null, notice: null };
  if (action.type === "failed") return { busy: null, error: action.message, notice: null };
  return { ...state, busy: null, error: null, notice: action.message ?? null };
}
