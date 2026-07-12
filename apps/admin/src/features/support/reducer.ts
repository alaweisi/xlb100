export type AdminSupportUiState = { busy: string | null; error: string | null; notice: string | null };
export type AdminSupportUiAction = { type: "started"; operation: string } | { type: "failed"; message: string } | { type: "succeeded"; message?: string };
export const initialAdminSupportUiState: AdminSupportUiState = { busy: null, error: null, notice: null };
export function adminSupportUiReducer(state: AdminSupportUiState, action: AdminSupportUiAction): AdminSupportUiState {
  if (action.type === "started") return { busy: action.operation, error: null, notice: null };
  if (action.type === "failed") return { busy: null, error: action.message, notice: null };
  return { ...state, busy: null, error: null, notice: action.message ?? null };
}
