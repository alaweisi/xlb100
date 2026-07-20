import {
  adminApi,
  createApiClient,
  createAuthApi,
  governancePlannerApi,
  settlementApi,
  type LoginCodeResponse,
} from "@xlb/api-client";
import { API_BASE } from "./apiBase";

export type OperationsSurface = "admin" | "oa";
const CLOUD_TEST_MODE = (
  import.meta as ImportMeta & { env?: { VITE_XLB_CLOUD_TEST_MODE?: string } }
).env?.VITE_XLB_CLOUD_TEST_MODE === "true";

interface AdminLoginCodeResult extends LoginCodeResponse {
  debugCode?: string;
}

function resolveOperationsSurface(surface?: OperationsSurface): OperationsSurface {
  if (surface) return surface;
  if (typeof document !== "undefined" && document.documentElement.dataset.xlbSurface === "oa") return "oa";
  return "admin";
}

function storageKey(surface: OperationsSurface, field: "token" | "userId" | "role" | "username"): string {
  return `xlb.${surface}.${field}`;
}

export interface AdminSession {
  token: string;
  userId: string;
  role: string;
  username: string;
}

export function readStoredAdminSession(surface?: OperationsSurface): AdminSession | null {
  if (typeof window === "undefined") return null;
  const resolvedSurface = resolveOperationsSurface(surface);
  const token = window.localStorage.getItem(storageKey(resolvedSurface, "token"));
  const userId = window.localStorage.getItem(storageKey(resolvedSurface, "userId"));
  const role = window.localStorage.getItem(storageKey(resolvedSurface, "role"));
  const username = window.localStorage.getItem(storageKey(resolvedSurface, "username")) ?? (resolvedSurface === "oa" ? "oa_global" : "admin_hz");
  if (!token || !userId || !role) return null;
  return { token, userId, role, username };
}

function storeAdminSession(session: AdminSession, surface: OperationsSurface): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(surface, "token"), session.token);
  window.localStorage.setItem(storageKey(surface, "userId"), session.userId);
  window.localStorage.setItem(storageKey(surface, "role"), session.role);
  window.localStorage.setItem(storageKey(surface, "username"), session.username);
}

export function clearAdminSession(surface?: OperationsSurface): void {
  if (typeof window === "undefined") return;
  const resolvedSurface = resolveOperationsSurface(surface);
  window.localStorage.removeItem(storageKey(resolvedSurface, "token"));
  window.localStorage.removeItem(storageKey(resolvedSurface, "userId"));
  window.localStorage.removeItem(storageKey(resolvedSurface, "role"));
}

export async function requestAdminLoginCode(
  username = "admin_hz",
  surface: OperationsSurface = "admin",
): Promise<AdminLoginCodeResult> {
  const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
  const result = surface === "oa"
    ? await auth.requestOaLoginCode(username)
    : await auth.requestAdminLoginCode(username);
  if (!result.ok) throw new Error(adminAuthErrorMessage(result.error, "验证码发送失败，请稍后重试"));
  if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey(surface, "username"), username);
  }
  if (!CLOUD_TEST_MODE) return result;
  const debug = surface === "oa"
    ? await auth.getOaDebugCode(username)
    : await auth.getAdminDebugCode(username);
  if (!debug.ok) throw new Error(adminAuthErrorMessage(debug.error, "云测验证码读取失败，请重新获取"));
  return { ...result, debugCode: debug.code };
}

export async function loginAdminWithCode(username: string, code: string, surface: OperationsSurface = "admin"): Promise<AdminSession> {
  const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
  const result = surface === "oa"
    ? await auth.oaLogin(username, code)
    : await auth.adminLogin(username, code);
  if (!result.ok) {
    const fallback = surface === "oa"
      ? "OA 总后台登录失败，请核对验证码"
      : "运营应用登录失败，请核对验证码";
    throw new Error(adminAuthErrorMessage(result.error, fallback));
  }
  const session: AdminSession = {
    token: result.token,
    userId: result.userId,
    role: result.role,
    username,
  };
  storeAdminSession(session, surface);
  return session;
}

function adminAuthErrorMessage(error: string, fallback: string): string {
  if (/invalid username/i.test(error)) return "请输入正确的运营账号";
  if (/not found/i.test(error)) return "运营账号不存在或无权登录";
  if (/too recently|cooldown/i.test(error)) return "验证码发送过于频繁，请稍后再试";
  if (/invalid|expired|verification code|otp/i.test(error)) return "验证码无效或已过期，请重新获取";
  return fallback;
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
