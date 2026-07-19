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

export async function requestCustomerOtp(phone: string): Promise<LoginCodeResponse> {
  const normalizedPhone = phone.trim();
  if (!isValidCustomerPhone(normalizedPhone)) throw new Error("Enter a valid 11-digit mobile number.");
  return assertOk(
    await createCustomerAuthClient().requestCustomerLoginCode(normalizedPhone),
    "Unable to send the verification code.",
  );
}

export async function loginCustomerWithOtp(phone: string, code: string): Promise<CustomerSession> {
  const normalizedPhone = phone.trim();
  const normalizedCode = code.trim();
  if (!isValidCustomerPhone(normalizedPhone)) throw new Error("Enter a valid 11-digit mobile number.");
  if (!/^\d{6}$/u.test(normalizedCode)) throw new Error("Enter the 6-digit verification code.");
  const result = assertOk(
    await createCustomerAuthClient().customerLogin(normalizedPhone, normalizedCode),
    "Unable to sign in.",
  );
  if (result.role !== "customer") throw new Error("The account is not authorized for the Customer app.");
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
  if (error.kind === "network") return "Network unavailable. Check your connection and try again.";
  if (error.kind === "timeout") return "The request timed out. Please try again.";
  if (error.status === 400) return "Check the phone number or verification code and try again.";
  if (error.status === 401) return "The verification code is incorrect or has expired.";
  if (error.status === 429) {
    const seconds = error.retryAfterMs ? Math.max(1, Math.ceil(error.retryAfterMs / 1_000)) : null;
    return seconds ? `Too many attempts. Try again in ${seconds} seconds.` : "Too many attempts. Please try again later.";
  }
  return fallback;
}
