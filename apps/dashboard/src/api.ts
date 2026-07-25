import {
  createApiClient,
  createAuthApi,
  createDashboardApi,
  type LoginResponse,
} from "@xlb/api-client";

const SESSION_KEY = "xlb.dashboard.session";

function normalizeApiBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

const viteEnv = (import.meta as ImportMeta & {
  env?: { VITE_API_BASE?: string };
}).env;
const apiBase = normalizeApiBase(viteEnv?.VITE_API_BASE);

export interface DashboardSession extends LoginResponse {
  username: string;
}

export function readDashboardSession(): DashboardSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as Partial<DashboardSession>;
    return session.token && session.userId && session.username
      ? session as DashboardSession
      : null;
  } catch {
    return null;
  }
}

export function clearDashboardSession(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
}

const authenticatedClient = createApiClient({
  baseUrl: apiBase,
  timeoutMs: 8_000,
  headers: () => {
    const session = readDashboardSession();
    const headers: Record<string, string> = {};
    if (session?.token) headers.Authorization = `Bearer ${session.token}`;
    return headers;
  },
});

export const dashboardApi = createDashboardApi(authenticatedClient);

function authApi() {
  return createAuthApi(createApiClient({ baseUrl: apiBase, timeoutMs: 8_000 }));
}

export async function requestDashboardCode(username: string) {
  const result = await authApi().requestDashboardLoginCode(username);
  if (!result.ok) throw new Error(result.error);
  return result;
}

export async function readDashboardDebugCode(username: string): Promise<string | null> {
  try {
    const result = await authApi().getDashboardDebugCode(username);
    return result.ok ? result.code : null;
  } catch {
    return null;
  }
}

export async function loginDashboard(
  username: string,
  code: string,
): Promise<DashboardSession> {
  const result = await authApi().dashboardLogin(username, code);
  if (!result.ok) throw new Error(result.error);
  const session = { ...result, username };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
