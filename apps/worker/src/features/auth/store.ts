import { useCallback, useReducer } from "react";
import { readStoredWorkerSession, type WorkerSession } from "../../app/workerAuth";

export type AuthState = { cityCode: string; session: WorkerSession | null };
export type AuthAction =
  | { type: "cityChanged"; cityCode: string }
  | { type: "sessionChanged"; session: WorkerSession | null };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  if (action.type === "cityChanged") return { ...state, cityCode: action.cityCode };
  return { ...state, session: action.session };
}

export function useWorkerAuthStore(initialCityCode: string) {
  const [state, dispatch] = useReducer(authReducer, { cityCode: initialCityCode, session: readStoredWorkerSession() });
  const setCityCode = useCallback((cityCode: string) => dispatch({ type: "cityChanged", cityCode }), []);
  const setSession = useCallback((session: WorkerSession | null) => dispatch({ type: "sessionChanged", session }), []);
  return { ...state, setCityCode, setSession };
}
