import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  type ApiClient,
  createApiClient,
  createAuthApi,
  customerApi,
} from "@xlb/api-client";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import { BottomNav, MobileShell } from "@xlb/ui";
import { CUSTOMER_API_BASE } from "../apiBase";
import {
  CUSTOMER_DEMO_SESSION_TTL_MS,
  IS_CUSTOMER_INVESTOR_DEMO,
} from "../investorDemo";

// Phase 14: removed hardcoded CUSTOMER_ID; replaced with loginCustomer().
// Legacy reference preserved for tests: "customer-demo-001" exists in customers table via seed 011.

/** @deprecated Use loginCustomer() + session.userId instead. Kept for backward compat. */
export const CUSTOMER_ID = "customer-demo-001";

export const DEFAULT_CITY: CityCode = "hangzhou";

const TOKEN_STORAGE_KEY = "xlb.customer.token";
const CUSTOMER_PHONE_KEY = "xlb.customer.phone";
const CUSTOMER_USER_ID_KEY = "xlb.customer.userId";
const CUSTOMER_SESSION_EXPIRES_AT_KEY = "xlb.customer.expiresAt";
export const CUSTOMER_SESSION_EXPIRED_EVENT = "xlb-customer-session-expired";

export interface CustomerSession {
  token: string;
  userId: string;
  expiresAt?: number;
}

function customerSessionStorage(): Storage {
  return IS_CUSTOMER_INVESTOR_DEMO
    ? window.sessionStorage
    : window.localStorage;
}

function removeKeys(storage: Storage, keys: readonly string[]): void {
  for (const key of keys) storage.removeItem(key);
}

export function readStoredSession(): CustomerSession | null {
  if (typeof window === "undefined") return null;
  const storage = customerSessionStorage();
  const token = storage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return null;
  const userId = storage.getItem(CUSTOMER_USER_ID_KEY) ?? "";
  const rawExpiresAt = storage.getItem(CUSTOMER_SESSION_EXPIRES_AT_KEY);
  const expiresAt = rawExpiresAt ? Number(rawExpiresAt) : undefined;
  if (
    IS_CUSTOMER_INVESTOR_DEMO
    && (!expiresAt || !Number.isFinite(expiresAt) || expiresAt <= Date.now())
  ) {
    clearCustomerSessionAndBusinessData();
    return null;
  }
  return { token, userId, ...(expiresAt ? { expiresAt } : {}) };
}

function storeSession(session: CustomerSession): void {
  if (typeof window === "undefined") return;
  const storage = customerSessionStorage();
  storage.setItem(TOKEN_STORAGE_KEY, session.token);
  storage.setItem(CUSTOMER_USER_ID_KEY, session.userId);
  if (session.expiresAt) {
    storage.setItem(CUSTOMER_SESSION_EXPIRES_AT_KEY, String(session.expiresAt));
  } else {
    storage.removeItem(CUSTOMER_SESSION_EXPIRES_AT_KEY);
  }
}

export function clearStoredCustomerSession(): void {
  if (typeof window === "undefined") return;
  const sessionKeys = [
    TOKEN_STORAGE_KEY,
    CUSTOMER_USER_ID_KEY,
    CUSTOMER_SESSION_EXPIRES_AT_KEY,
  ] as const;
  removeKeys(window.localStorage, sessionKeys);
  removeKeys(window.sessionStorage, sessionKeys);
}

export function clearCustomerSessionAndBusinessData(): void {
  if (typeof window === "undefined") return;
  const keys = [
    TOKEN_STORAGE_KEY,
    CUSTOMER_USER_ID_KEY,
    CUSTOMER_SESSION_EXPIRES_AT_KEY,
    CUSTOMER_PHONE_KEY,
    CITY_STORAGE_KEY,
    ORDER_HISTORY_KEY,
  ] as const;
  removeKeys(window.localStorage, keys);
  removeKeys(window.sessionStorage, keys);
}

export function readStoredCustomerPhone(): string {
  if (typeof window === "undefined") return "";
  return customerSessionStorage().getItem(CUSTOMER_PHONE_KEY) ?? "";
}

export function isCustomerSessionUnauthorized(error: unknown): boolean {
  return (
    (error instanceof ApiClientError && error.status === 401)
    || (
      error !== null
      && typeof error === "object"
      && "status" in error
      && Number(error.status) === 401
    )
    || (error instanceof Error && /\b401\b/u.test(error.message))
  );
}

export async function requestCustomerCode(phone: string) {
  const authApi = createAuthApi(
    createApiClient({ baseUrl: CUSTOMER_API_BASE }),
  );
  const codeRequest = await authApi.requestCustomerLoginCode(phone);
  if (!codeRequest.ok) {
    throw new Error(codeRequest.error);
  }
  if (typeof window !== "undefined") {
    customerSessionStorage().setItem(CUSTOMER_PHONE_KEY, phone);
  }
  return codeRequest;
}

export async function loginCustomer(phone: string, code: string): Promise<CustomerSession> {
  const authApi = createAuthApi(
    createApiClient({ baseUrl: CUSTOMER_API_BASE }),
  );
  const result = await authApi.customerLogin(phone, code);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const session: CustomerSession = {
    token: result.token,
    userId: result.userId,
    ...(IS_CUSTOMER_INVESTOR_DEMO
      ? { expiresAt: Date.now() + CUSTOMER_DEMO_SESSION_TTL_MS }
      : {}),
  };
  storeSession(session);
  return session;
}
export const CITY_OPTIONS: ReadonlyArray<CityCode> = ["hangzhou", "shanghai", "beijing"];
export const CITY_STORAGE_KEY = "xlb.customer.cityCode";
export const ORDER_HISTORY_KEY = "xlb.customer.orderIds";
export const MOBILE_SHELL_QUERY = "(max-width: 640px), (pointer: coarse)";

export type CustomerRoute = "home" | "services" | "createOrder" | "orders" | "aftersale" | "support" | "profile";
export type CustomerShellRoute = CustomerRoute | "notifications" | "coupons";

export type CustomerLoadable<T> =
  | { status: "pending" | "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string };

export function readCustomerCityFromSearch(): CityCode | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("cityCode") as CityCode | null;
  return fromQuery && CITY_OPTIONS.includes(fromQuery) ? fromQuery : null;
}

export const customerRouteConfig: Record<
  CustomerRoute,
  { label: string; href: string; title: string; icon: string; prominent?: boolean }
> = {
  home: { label: "首页", href: "/customer/", title: "喜乐帮到家", icon: "⌂" },
  services: { label: "服务", href: "/customer/services", title: "服务选择", icon: "⌕" },
  createOrder: { label: "下单", href: "/customer/order/create", title: "确认订单", icon: "+", prominent: true },
  orders: { label: "订单", href: "/customer/orders", title: "订单", icon: "▦" },
  aftersale: { label: "售后", href: "/customer/aftersale", title: "售后服务", icon: "A" },
  support: { label: "客服", href: "/customer/support", title: "客服工单", icon: "S" },
  profile: { label: "我的", href: "/customer/profile", title: "我的", icon: "👤" },
};

export function detectCustomerRoute(pathname = window.location.pathname): CustomerShellRoute {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed.endsWith("/customer/notifications")) return "notifications";
  if (trimmed.endsWith("/customer/coupons")) return "coupons";
  if (trimmed.endsWith("/customer/services")) return "services";
  if (trimmed.endsWith("/customer/order/create")) return "createOrder";
  if (trimmed.endsWith("/customer/orders")) return "orders";
  if (trimmed.endsWith("/customer/aftersale")) return "aftersale";
  if (trimmed.endsWith("/customer/support")) return "support";
  if (trimmed.endsWith("/customer/profile")) return "profile";
  return "home";
}

export function readCustomerCityCode(): CityCode {
  if (typeof window === "undefined") return DEFAULT_CITY;
  const fromQuery = readCustomerCityFromSearch();
  if (fromQuery) {
    window.localStorage.setItem(CITY_STORAGE_KEY, fromQuery);
    return fromQuery;
  }

  const stored = window.localStorage.getItem(CITY_STORAGE_KEY);
  const city = CITY_OPTIONS.includes(stored as CityCode) ? (stored as CityCode) : DEFAULT_CITY;
  if (!stored || city !== stored) {
    window.localStorage.setItem(CITY_STORAGE_KEY, city);
  }
  return city;
}

export function writeCustomerCityCode(cityCode: CityCode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CITY_STORAGE_KEY, cityCode);
}

export function useCustomerCityCode(): [CityCode, (next: CityCode) => void] {
  const [cityCode, setCityCode] = useState<CityCode>(() => readCustomerCityCode());

  const updateCityCode = useCallback((next: CityCode) => {
    setCityCode(next);
    writeCustomerCityCode(next);
  }, []);

  return [cityCode, updateCityCode];
}

export function readOrderIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ORDER_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function readRouteSearchParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

export function setRouteSearchParams(patches: Record<string, string | null>, keepPathname = true): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  Object.entries(patches).forEach(([key, value]) => {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  });
  const query = params.toString();
  const next = `${keepPathname ? window.location.pathname : ""}${query ? `?${query}` : ""}`;
  window.history.replaceState({}, "", next);
  window.dispatchEvent(new Event("customer-route-search-change"));
  return next;
}

export function appendOrderId(orderId: string): string[] {
  const next = [orderId, ...readOrderIds().filter((item) => item !== orderId)].slice(0, 8);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(next));
  }
  return next;
}

export type CustomerPageApi = ReturnType<typeof createCustomerApiClient>;

async function guardCustomerRequest<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (isCustomerSessionUnauthorized(error)) {
      clearCustomerSessionAndBusinessData();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(CUSTOMER_SESSION_EXPIRED_EVENT));
      }
    }
    throw error;
  }
}

function withCustomerSessionGuard(client: ApiClient): ApiClient {
  return {
    get: (path, options) => guardCustomerRequest(client.get(path, options)),
    post: (path, body, options) => guardCustomerRequest(client.post(path, body, options)),
    patch: (path, body, options) => guardCustomerRequest(client.patch(path, body, options)),
    delete: (path, body, options) => guardCustomerRequest(client.delete(path, body, options)),
    postBinary: (path, body, binaryOptions, options) =>
      guardCustomerRequest(client.postBinary(path, body, binaryOptions, options)),
  };
}

export function createCustomerApiClient(cityCode: CityCode, token?: string) {
  const headers: Record<string, string> = {
    [XLB_HEADERS.cityCode]: cityCode,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return customerApi.forClient(
    withCustomerSessionGuard(
      createApiClient({
        baseUrl: CUSTOMER_API_BASE,
        headers,
      }),
    ),
  );
}

function detectShellMode() {
  if (typeof window === "undefined") return "preview" as const;
  const mediaMatch = window.matchMedia(MOBILE_SHELL_QUERY).matches;
  const touchViewport = window.innerWidth <= 900 && window.navigator.maxTouchPoints > 0;
  return mediaMatch || touchViewport ? ("app" as const) : ("preview" as const);
}

export function useCustomerShellMode() {
  const [mode, setMode] = useState<"preview" | "app">(detectShellMode());

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_SHELL_QUERY);
    const syncMode = () => setMode(detectShellMode());

    syncMode();
    mediaQuery.addEventListener("change", syncMode);
    window.addEventListener("resize", syncMode);
    return () => {
      mediaQuery.removeEventListener("change", syncMode);
      window.removeEventListener("resize", syncMode);
    };
  }, []);

  return mode;
}

export function CustomerBottomNav({ currentRoute }: { currentRoute: CustomerShellRoute }) {
  const items = useMemo(
    () =>
      (Object.keys(customerRouteConfig) as CustomerRoute[]).map((route) => ({
        key: route,
        label: customerRouteConfig[route].label,
        active: route === currentRoute,
        href: customerRouteConfig[route].href,
        icon: customerRouteConfig[route].icon,
        prominent: customerRouteConfig[route].prominent,
      })),
    [currentRoute],
  );

  return <BottomNav items={items} placement="static" />;
}

type CustomerRouteShellProps = {
  currentRoute: CustomerShellRoute;
  topBar?: ReactNode;
  children: ReactNode;
  fixedBottomNav?: boolean;
};

export function CustomerRouteShell({ currentRoute, topBar, children, fixedBottomNav = false }: CustomerRouteShellProps) {
  const shellMode = useCustomerShellMode();
  const isAppMode = shellMode === "app";
  const bottomNav = <BottomNav items={Object.keys(customerRouteConfig).map((route) => {
    const key = route as CustomerRoute;
    return {
      key,
      label: customerRouteConfig[key].label,
      active: key === currentRoute,
      href: customerRouteConfig[key].href,
      icon: customerRouteConfig[key].icon,
      prominent: customerRouteConfig[key].prominent,
    };
  })} placement={fixedBottomNav || isAppMode ? "fixed" : "static"} />;

  return (
    <div className="customer-app-root" data-role="customer" data-shell-mode={isAppMode ? "app" : "preview"}>
      <div className="customer-device-preview">
        <div className="customer-device-frame">
          <MobileShell
            mode={isAppMode ? "app" : "preview"}
            topBar={topBar}
            bottomNav={bottomNav}
            contentStyle={{ paddingBottom: isAppMode ? "calc(104px + env(safe-area-inset-bottom))" : "8px" }}
            style={{ background: "#FFFAF0", minHeight: isAppMode ? "100dvh" : 824 }}
          >
            <div className="customer-content-stack">{children}</div>
          </MobileShell>
        </div>
      </div>
    </div>
  );
}

export function useSearchParamSku(): string | null {
  return useRouteSearchParams("skuId");
}

export function useCatalogSkus(catalogState: CustomerLoadable<CatalogSnapshot>): CatalogSnapshot["categories"] | null {
  return catalogState.status === "success" ? catalogState.data.categories : null;
}

export function useRouteSearchParams(key: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setValue(readRouteSearchParam(key));
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("customer-route-search-change", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("customer-route-search-change", sync);
    };
  }, [key]);
  return value;
}
