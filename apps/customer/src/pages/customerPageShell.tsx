import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient, createAuthApi, customerApi } from "@xlb/api-client";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import { BottomNav, MobileShell } from "@xlb/ui";

// Phase 14: removed hardcoded CUSTOMER_ID; replaced with loginCustomer().
// Legacy reference preserved for tests: "customer-demo-001" exists in customers table via seed 011.

/** @deprecated Use loginCustomer() + session.userId instead. Kept for backward compat. */
export const CUSTOMER_ID = "customer-demo-001";

export const DEFAULT_CITY: CityCode = "hangzhou";

const TOKEN_STORAGE_KEY = "xlb.customer.token";
const CUSTOMER_PHONE_KEY = "xlb.customer.phone";

export interface CustomerSession {
  token: string;
  userId: string;
}

export function readStoredSession(): CustomerSession | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return null;
  // We don't verify the token here; the backend will reject expired/invalid tokens.
  // userId is extracted from token on the backend side; we store it for UI display only.
  const userId = window.localStorage.getItem("xlb.customer.userId") ?? "";
  return { token, userId };
}

function storeSession(session: CustomerSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, session.token);
  window.localStorage.setItem("xlb.customer.userId", session.userId);
}

/**
 * Login (or auto-register) using the non-production debug OTP readback.
 * Real SMS delivery remains a backend TODO after investor approval.
 */
export async function loginCustomer(phone = "13800000001"): Promise<CustomerSession> {
  const authApi = createAuthApi(
    createApiClient({ baseUrl: "" }),
  );
  const codeRequest = await authApi.requestCustomerLoginCode(phone);
  if (!codeRequest.ok) {
    throw new Error(`Login code request failed: ${codeRequest.error}`);
  }
  const debugCode = await authApi.getCustomerDebugCode(phone);
  if (!debugCode.ok) {
    throw new Error(`Login debug code unavailable: ${debugCode.error}`);
  }
  const result = await authApi.customerLogin(phone, debugCode.code);
  if (!result.ok) {
    throw new Error(`Login failed: ${result.error}`);
  }
  const session: CustomerSession = { token: result.token, userId: result.userId };
  storeSession(session);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CUSTOMER_PHONE_KEY, phone);
  }
  return session;
}
export const CITY_OPTIONS: ReadonlyArray<CityCode> = ["hangzhou", "shanghai", "beijing"];
export const CITY_STORAGE_KEY = "xlb.customer.cityCode";
export const ORDER_HISTORY_KEY = "xlb.customer.orderIds";
export const MOBILE_SHELL_QUERY = "(max-width: 640px), (pointer: coarse)";

export type CustomerRoute = "home" | "services" | "createOrder" | "orders" | "aftersale" | "support" | "profile";
export type CustomerShellRoute = CustomerRoute | "notifications";

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

export function createCustomerApiClient(cityCode: CityCode, token?: string) {
  const headers: Record<string, string> = {
    [XLB_HEADERS.cityCode]: cityCode,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return customerApi.forClient(
    createApiClient({
      baseUrl: "",
      headers,
    }),
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
