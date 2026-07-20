import {
  ApiClientError,
  createApiClient,
  createAuthApi,
  type LoginCodeResponse,
} from "@xlb/api-client";

export const CUSTOMER_TOKEN_STORAGE_KEY = "xlb.customer.token";
export const CUSTOMER_USER_ID_STORAGE_KEY = "xlb.customer.userId";
export const CUSTOMER_PHONE_STORAGE_KEY = "xlb.customer.phone";
export const CUSTOMER_ORDER_HISTORY_KEY = "xlb.customer.orderIds";

export interface CustomerSession {
  token: string;
  userId: string;
}

export interface CustomerOtpRequestResult extends LoginCodeResponse {
  debugCode?: string;
}

const CLOUD_TEST_MODE = (
  import.meta as ImportMeta & { env?: { VITE_XLB_CLOUD_TEST_MODE?: string } }
).env?.VITE_XLB_CLOUD_TEST_MODE === "true";

function normalizeApiBase(value: string | undefined): string {
  const raw = (value ?? "").trim().replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw.slice(0, -4) : raw;
}

export function getCustomerApiBase(): string {
  return normalizeApiBase(
    (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE,
  );
}

function createCustomerAuthClient() {
  return createAuthApi(createApiClient({ baseUrl: getCustomerApiBase(), maxRetries: 0 }));
}

function assertOk<T extends { ok: true } | { ok: false; error: string }>(
  result: T,
  fallback: string,
): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(result.error || fallback);
  return result as Extract<T, { ok: true }>;
}

export function isValidCustomerPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/u.test(phone.trim());
}

export function readStoredCustomerSession(): CustomerSession | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(CUSTOMER_TOKEN_STORAGE_KEY)?.trim() ?? "";
  const userId = window.localStorage.getItem(CUSTOMER_USER_ID_STORAGE_KEY)?.trim() ?? "";
  if (!token || !userId) {
    clearCustomerSession(false);
    return null;
  }
  return { token, userId };
}

export function storeCustomerSession(session: CustomerSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOMER_TOKEN_STORAGE_KEY, session.token);
  window.localStorage.setItem(CUSTOMER_USER_ID_STORAGE_KEY, session.userId);
}

export function clearCustomerSession(clearAccountHistory = true): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CUSTOMER_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(CUSTOMER_USER_ID_STORAGE_KEY);
  window.localStorage.removeItem(CUSTOMER_PHONE_STORAGE_KEY);
  if (clearAccountHistory) window.localStorage.removeItem(CUSTOMER_ORDER_HISTORY_KEY);
}

export async function requestCustomerOtp(phone: string): Promise<CustomerOtpRequestResult> {
  const normalizedPhone = phone.trim();
  if (!isValidCustomerPhone(normalizedPhone)) throw new Error("请输入正确的 11 位中国大陆手机号。");
  const auth = createCustomerAuthClient();
  const requested = assertOk(
    await auth.requestCustomerLoginCode(normalizedPhone),
    "验证码发送失败，请稍后重试。",
  );
  if (!CLOUD_TEST_MODE) return requested;
  const debug = assertOk(
    await auth.getCustomerDebugCode(normalizedPhone),
    "云测验证码读取失败，请重新获取。",
  );
  return { ...requested, debugCode: debug.code };
}

export async function loginCustomerWithOtp(phone: string, code: string): Promise<CustomerSession> {
  const normalizedPhone = phone.trim();
  const normalizedCode = code.trim();
  if (!isValidCustomerPhone(normalizedPhone)) throw new Error("请输入正确的 11 位中国大陆手机号。");
  if (!/^\d{6}$/u.test(normalizedCode)) throw new Error("请输入 6 位短信验证码。");
  const result = assertOk(
    await createCustomerAuthClient().customerLogin(normalizedPhone, normalizedCode),
    "登录失败，请稍后重试。",
  );
  if (result.role !== "customer") throw new Error("该账号无权登录顾客端。");
  const session = { token: result.token, userId: result.userId };
  storeCustomerSession(session);
  return session;
}

export async function logoutCustomer(session: CustomerSession): Promise<void> {
  const auth = createAuthApi(createApiClient({
    baseUrl: getCustomerApiBase(),
    headers: { Authorization: `Bearer ${session.token}` },
    maxRetries: 0,
  }));
  await auth.customerLogout();
}

export function customerAuthErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiClientError)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }
  if (error.kind === "network") return "网络不可用，请检查连接后重试。";
  if (error.kind === "timeout") return "请求超时，请稍后重试。";
  if (error.status === 400) return "请检查手机号或验证码后重试。";
  if (error.status === 401) return "验证码错误或已过期，请重新获取。";
  if (error.status === 429) {
    const seconds = error.retryAfterMs ? Math.max(1, Math.ceil(error.retryAfterMs / 1_000)) : null;
    return seconds ? `操作过于频繁，请在 ${seconds} 秒后重试。` : "操作过于频繁，请稍后重试。";
  }
  return fallback;
}
