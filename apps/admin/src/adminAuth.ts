import {
  adminApi,
  type ApiClient,
  createApiClient,
  createAuthApi,
  createOaApi,
  governancePlannerApi,
  settlementApi,
} from "@xlb/api-client";
import type { OaPermissionKey, OaPrincipal } from "@xlb/types";
import { API_BASE } from "./apiBase";
import {
  ADMIN_INVESTOR_DEMO_CITY_CODE,
  ADMIN_DEMO_SESSION_TTL_MS,
  IS_ADMIN_INVESTOR_DEMO,
} from "./investorDemo";

const TOKEN_STORAGE_KEY = "xlb.admin.token";
const ADMIN_ID_STORAGE_KEY = "xlb.admin.userId";
const ADMIN_ROLE_STORAGE_KEY = "xlb.admin.role";
const ADMIN_USERNAME_STORAGE_KEY = "xlb.admin.username";
const ADMIN_EXPIRES_AT_STORAGE_KEY = "xlb.admin.expiresAt";
const OA_SESSION_STORAGE_KEY = "xlb.oa.session";
export const ADMIN_SESSION_EXPIRED_EVENT = "xlb-admin-session-expired";
const adminViteEnv = (import.meta as ImportMeta & {
  env?: { VITE_OA_ORIGIN?: string };
}).env;

export interface AdminSession {
  token: string;
  userId: string;
  role: string;
  username: string;
  identity: "admin" | "oa";
  expiresAt?: number;
  permissions?: OaPermissionKey[];
  permissionCityCodes?: OaPrincipal["permissionCityCodes"];
}

function adminStorage(): Storage {
  return IS_ADMIN_INVESTOR_DEMO ? window.sessionStorage : window.localStorage;
}

function clearAdminStorageKeys(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key))
    .filter((key) => key.startsWith("xlb.admin."));
  for (const key of keys) storage.removeItem(key);
}

export function adminVisibleError(error: unknown, fallback: string): string {
  const status = error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : undefined;
  const message = error instanceof Error ? error.message : "";
  if (status === 401 || /\b401\b/u.test(message)) return "演示登录已过期，请重新登录。";
  if (status === 403 || /\b403\b/u.test(message)) return "当前演示账号没有执行此操作的权限。";
  if (status === 404 || /\b404\b/u.test(message)) return "演示服务正在同步，请稍后重试。";
  if (status === 409 || /\b409\b/u.test(message)) return "数据状态已更新，请刷新后再试。";
  if (/network|fetch|timeout|offline|连接|网络/iu.test(message)) {
    return "网络连接不稳定，请检查网络后重试。";
  }
  return fallback;
}

export function isOaBridgeMode(): boolean {
  if (typeof window === "undefined") return false;
  if (IS_ADMIN_INVESTOR_DEMO) return false;
  const hash = window.location.hash || "";
  const queryStart = hash.indexOf("?");
  const requested = queryStart !== -1
    && new URLSearchParams(hash.slice(queryStart + 1)).get("identity") === "oa";
  return requested || window.sessionStorage.getItem(OA_SESSION_STORAGE_KEY) !== null;
}

export function readOaHandoffTicket(): string | null {
  if (typeof window === "undefined") return null;
  if (IS_ADMIN_INVESTOR_DEMO) return null;
  const queryStart = window.location.hash.indexOf("?");
  if (queryStart === -1) return null;
  return new URLSearchParams(window.location.hash.slice(queryStart + 1)).get("handoff");
}

function removeOaHandoffTicket(): void {
  const hash = window.location.hash;
  const queryStart = hash.indexOf("?");
  if (queryStart === -1) return;
  const route = hash.slice(0, queryStart);
  const params = new URLSearchParams(hash.slice(queryStart + 1));
  params.delete("handoff");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${route}${query ? `?${query}` : ""}`);
}

let pendingOaHandoff: { ticket: string; promise: Promise<AdminSession> } | null = null;

export function exchangeOaHandoff(ticket: string): Promise<AdminSession> {
  if (pendingOaHandoff?.ticket === ticket) return pendingOaHandoff.promise;
  const promise = (async () => {
    const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
    const result = await auth.exchangeOaAdminHandoff(ticket);
    if (!result.ok) throw new Error(result.error);
    window.sessionStorage.setItem(OA_SESSION_STORAGE_KEY, JSON.stringify(result));
    removeOaHandoffTicket();
    return {
      token: result.token,
      userId: result.userId,
      role: result.role,
      username: result.username,
      identity: "oa" as const,
    };
  })();
  pendingOaHandoff = { ticket, promise };
  return promise;
}

export function readStoredAdminSession(): AdminSession | null {
  if (typeof window === "undefined") return null;
  if (isOaBridgeMode()) {
    const raw = window.sessionStorage.getItem(OA_SESSION_STORAGE_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as Partial<AdminSession>;
      if (!session.token || !session.userId || !session.role) return null;
      return {
        token: session.token,
        userId: session.userId,
        role: session.role,
        username: session.username ?? "oa",
        identity: "oa",
      };
    } catch {
      return null;
    }
  }
  const storage = adminStorage();
  const token = storage.getItem(TOKEN_STORAGE_KEY);
  const userId = storage.getItem(ADMIN_ID_STORAGE_KEY);
  const role = storage.getItem(ADMIN_ROLE_STORAGE_KEY);
  const username = storage.getItem(ADMIN_USERNAME_STORAGE_KEY) ?? "admin_hz";
  const expiresAt = IS_ADMIN_INVESTOR_DEMO
    ? Number(storage.getItem(ADMIN_EXPIRES_AT_STORAGE_KEY))
    : undefined;
  if (!token || !userId || !role) return null;
  if (
    IS_ADMIN_INVESTOR_DEMO
    && (!expiresAt || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
  ) {
    clearAdminSession();
    return null;
  }
  return {
    token,
    userId,
    role,
    username,
    identity: "admin",
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function storeAdminSession(session: AdminSession): void {
  if (typeof window === "undefined") return;
  const storage = adminStorage();
  storage.setItem(TOKEN_STORAGE_KEY, session.token);
  storage.setItem(ADMIN_ID_STORAGE_KEY, session.userId);
  storage.setItem(ADMIN_ROLE_STORAGE_KEY, session.role);
  storage.setItem(ADMIN_USERNAME_STORAGE_KEY, session.username);
  if (session.expiresAt) {
    storage.setItem(ADMIN_EXPIRES_AT_STORAGE_KEY, String(session.expiresAt));
  }
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  clearAdminStorageKeys(window.localStorage);
  clearAdminStorageKeys(window.sessionStorage);
  window.sessionStorage.removeItem(OA_SESSION_STORAGE_KEY);
  pendingOaHandoff = null;
}

export function oaReturnUrl(): string {
  if (typeof window === "undefined") return "/oa/#/capabilities";
  const configured = adminViteEnv?.VITE_OA_ORIGIN?.trim().replace(/\/+$/u, "");
  if (configured) return `${configured}/oa/#/capabilities`;
  const url = new URL(window.location.href);
  if (url.hostname.startsWith("admin.")) {
    url.hostname = `oa.${url.hostname.slice(6)}`;
  }
  url.pathname = "/oa/";
  url.search = "";
  url.hash = "/capabilities";
  return url.toString();
}

export async function requestAdminLoginCode(username = "admin_hz") {
  const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
  const result = await auth.requestAdminLoginCode(username);
  if (!result.ok) throw new Error(result.error);
  if (typeof window !== "undefined") {
    adminStorage().setItem(ADMIN_USERNAME_STORAGE_KEY, username);
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
    identity: "admin",
    ...(IS_ADMIN_INVESTOR_DEMO
      ? { expiresAt: Date.now() + ADMIN_DEMO_SESSION_TTL_MS }
      : {}),
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
  if (IS_ADMIN_INVESTOR_DEMO) return ADMIN_INVESTOR_DEMO_CITY_CODE;
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

function domainPath(path: string): string {
  return isOaBridgeMode() ? `/api/oa/domains${path.startsWith("/") ? path : `/${path}`}` : path;
}

async function guardAdminRequest<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : undefined;
    if (status === 401 || (error instanceof Error && /\b401\b/u.test(error.message))) {
      clearAdminSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(ADMIN_SESSION_EXPIRED_EVENT));
      }
    }
    throw error;
  }
}

function withDomainBridge(client: ApiClient): ApiClient {
  return {
    get: (path, options) => guardAdminRequest(client.get(domainPath(path), options)),
    post: (path, body, options) =>
      guardAdminRequest(client.post(domainPath(path), body, options)),
    patch: (path, body, options) =>
      guardAdminRequest(client.patch(domainPath(path), body, options)),
    delete: (path, body, options) =>
      guardAdminRequest(client.delete(domainPath(path), body, options)),
    postBinary: (path, body, binaryOptions, options) =>
      guardAdminRequest(
        client.postBinary(domainPath(path), body, binaryOptions, options),
      ),
  };
}

export function createAdminHttpClient() {
  return withDomainBridge(createApiClient({
    baseUrl: API_BASE,
    headers: (path) => adminHeaders(path),
  }));
}

export async function hydrateOaBridgeSession(session: AdminSession): Promise<AdminSession> {
  if (session.identity !== "oa") return session;
  const client = createApiClient({
    baseUrl: API_BASE,
    headers: { Authorization: `Bearer ${session.token}` },
  });
  const result = await createOaApi(client).getMe();
  return {
    ...session,
    role: result.principal.legacyRole,
    username: result.principal.username,
    permissions: result.principal.permissions,
    permissionCityCodes: result.principal.permissionCityCodes,
  };
}

export const adminSettlementApi = settlementApi.create(createAdminHttpClient());
export const adminPlannerApi = governancePlannerApi.create(createAdminHttpClient());
export const adminOpsApi = adminApi.create(createAdminHttpClient());
export const adminOrderTraceApi = adminOpsApi;
