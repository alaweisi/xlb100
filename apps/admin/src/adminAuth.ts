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

const TOKEN_STORAGE_KEY = "xlb.admin.token";
const ADMIN_ID_STORAGE_KEY = "xlb.admin.userId";
const ADMIN_ROLE_STORAGE_KEY = "xlb.admin.role";
const ADMIN_USERNAME_STORAGE_KEY = "xlb.admin.username";
const OA_SESSION_STORAGE_KEY = "xlb.oa.session";
const adminViteEnv = (import.meta as ImportMeta & {
  env?: { VITE_OA_ORIGIN?: string };
}).env;

export interface AdminSession {
  token: string;
  userId: string;
  role: string;
  username: string;
  identity: "admin" | "oa";
  permissions?: OaPermissionKey[];
  permissionCityCodes?: OaPrincipal["permissionCityCodes"];
}

export function isOaBridgeMode(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash || "";
  const queryStart = hash.indexOf("?");
  const requested = queryStart !== -1
    && new URLSearchParams(hash.slice(queryStart + 1)).get("identity") === "oa";
  return requested || window.sessionStorage.getItem(OA_SESSION_STORAGE_KEY) !== null;
}

export function readOaHandoffTicket(): string | null {
  if (typeof window === "undefined") return null;
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
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  const userId = window.localStorage.getItem(ADMIN_ID_STORAGE_KEY);
  const role = window.localStorage.getItem(ADMIN_ROLE_STORAGE_KEY);
  const username = window.localStorage.getItem(ADMIN_USERNAME_STORAGE_KEY) ?? "admin_hz";
  if (!token || !userId || !role) return null;
  return { token, userId, role, username, identity: "admin" };
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
  if (isOaBridgeMode()) {
    window.sessionStorage.removeItem(OA_SESSION_STORAGE_KEY);
    pendingOaHandoff = null;
    return;
  }
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_ID_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_ROLE_STORAGE_KEY);
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
    identity: "admin",
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

function domainPath(path: string): string {
  return isOaBridgeMode() ? `/api/oa/domains${path.startsWith("/") ? path : `/${path}`}` : path;
}

function withDomainBridge(client: ApiClient): ApiClient {
  return {
    get: (path, options) => client.get(domainPath(path), options),
    post: (path, body, options) => client.post(domainPath(path), body, options),
    patch: (path, body, options) => client.patch(domainPath(path), body, options),
    delete: (path, body, options) => client.delete(domainPath(path), body, options),
    postBinary: (path, body, binaryOptions, options) =>
      client.postBinary(domainPath(path), body, binaryOptions, options),
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
