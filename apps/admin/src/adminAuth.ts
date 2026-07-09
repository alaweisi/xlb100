import {
  adminApi,
  createApiClient,
  createAuthApi,
  governancePlannerApi,
  settlementApi,
} from "@xlb/api-client";
import { API_BASE } from "./apiBase";

const TOKEN_STORAGE_KEY = "xlb.admin.token";
const ADMIN_ID_STORAGE_KEY = "xlb.admin.userId";
const ADMIN_ROLE_STORAGE_KEY = "xlb.admin.role";
const ADMIN_USERNAME_STORAGE_KEY = "xlb.admin.username";

export interface AdminSession {
  token: string;
  userId: string;
  role: string;
  username: string;
}

export function readStoredAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  const userId = window.localStorage.getItem(ADMIN_ID_STORAGE_KEY);
  const role = window.localStorage.getItem(ADMIN_ROLE_STORAGE_KEY);
  const username = window.localStorage.getItem(ADMIN_USERNAME_STORAGE_KEY) ?? "admin_hz";
  if (!token || !userId || !role) return null;
  return { token, userId, role, username };
}

function storeAdminSession(session: AdminSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
  window.localStorage.setItem(ADMIN_ID_STORAGE_KEY, session.userId);
  window.localStorage.setItem(ADMIN_ROLE_STORAGE_KEY, session.role);
  window.localStorage.setItem(ADMIN_USERNAME_STORAGE_KEY, session.username);
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_ID_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_ROLE_STORAGE_KEY);
}

export async function requestAdminLoginCode(username = "admin_hz") {
  const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
  const result = await auth.requestAdminLoginCode(username);
  if (!result.ok) throw new Error(result.error);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ADMIN_USERNAME_STORAGE_KEY, username);
  }
  return result;
}

export async function loginAdminWithCode(username: string, code: string): Promise<AdminSession> {
  const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
  const result = await auth.adminLogin(username, code);
  if (!result.ok) throw new Error(result.error);
  const session: AdminSession = {
    token: result.token,
    userId: result.userId,
    role: result.role,
    username,
  };
  storeAdminSession(session);
  return session;
}

export async function loginAdmin(username = "admin_hz"): Promise<AdminSession> {
  const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
  const codeRequest = await auth.requestAdminLoginCode(username);
  if (!codeRequest.ok) throw new Error(codeRequest.error);

  const debugCode = await auth.getAdminDebugCode(username);
  if (!debugCode.ok) {
    throw new Error(debugCode.error);
  }

  return loginAdminWithCode(username, debugCode.code);
}

function readCityCodeFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash || "";
  const queryStart = hash.indexOf("?");
  if (queryStart === -1) return null;
  return new URLSearchParams(hash.slice(queryStart + 1)).get("cityCode");
}

function cityCodeForPath(path: string): string {
  try {
    const url = new URL(path, "http://xlb.local");
    return url.searchParams.get("cityCode") || readCityCodeFromHash() || "hangzhou";
  } catch {
    return readCityCodeFromHash() || "hangzhou";
  }
}

function adminHeaders(path: string): Record<string, string> {
  const session = readStoredAdminSession();
  const headers: Record<string, string> = {
    "x-xlb-city-code": cityCodeForPath(path),
  };
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  return headers;
}

export function createAdminHttpClient() {
  return createApiClient({
    baseUrl: API_BASE,
    headers: (path) => adminHeaders(path),
  });
}

export const adminSettlementApi = settlementApi.create(createAdminHttpClient());
export const adminPlannerApi = governancePlannerApi.create(createAdminHttpClient());
export const adminOpsApi = adminApi.create(createAdminHttpClient());
export const adminOrderTraceApi = adminOpsApi;
