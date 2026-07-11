import type { WorkerTaskPoolItem } from "@xlb/types";

export type TasksState = { items: WorkerTaskPoolItem[]; loading: boolean; error: string | null };
export type TasksAction =
  | { type: "loading" }
  | { type: "loaded"; items: WorkerTaskPoolItem[] }
  | { type: "failed"; error: string }
  | { type: "cleared" };
export const initialTasksState: TasksState = { items: [], loading: false, error: null };

export function tasksReducer(state: TasksState, action: TasksAction): TasksState {
  if (action.type === "loading") return { ...state, loading: true, error: null };
  if (action.type === "loaded") return { items: action.items, loading: false, error: null };
  if (action.type === "failed") return { ...state, loading: false, error: action.error };
  return initialTasksState;
}
