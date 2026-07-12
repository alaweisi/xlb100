export type SupportUiState = { busy: string | null; error: string | null; notice: string | null };
export type SupportUiAction =
  | { type: "started"; operation: string }
  | { type: "failed"; message: string }
  | { type: "succeeded"; message?: string }
  | { type: "clearNotice" };
export const initialSupportUiState: SupportUiState = { busy: null, error: null, notice: null };
export function supportUiReducer(state: SupportUiState, action: SupportUiAction): SupportUiState {
  if (action.type === "started") return { busy: action.operation, error: null, notice: null };
  if (action.type === "failed") return { busy: null, error: action.message, notice: null };
  if (action.type === "succeeded") return { busy: null, error: null, notice: action.message ?? null };
  return { ...state, notice: null };
}
