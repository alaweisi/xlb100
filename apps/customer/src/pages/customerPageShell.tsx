import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, createApiClient, customerApi } from "@xlb/api-client";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import { BottomNav, MobileShell } from "@xlb/ui";
import {
  BellSimple,
  ChatCircleDots,
  ClipboardText,
  House,
  Plus,
  UserCircle,
} from "@phosphor-icons/react";
import { getCustomerApiBase } from "../features/auth/customerAuth";

// Phase 14: removed hardcoded CUSTOMER_ID; replaced with authenticated customer sessions.
// Legacy reference preserved for tests: "customer-demo-001" exists in customers table via seed 011.

/** @deprecated Use an authenticated CustomerSession instead. Kept for backward compatibility. */
export const CUSTOMER_ID = "customer-demo-001";

export const DEFAULT_CITY: CityCode = "hangzhou";

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
  { label: string; href: string; title: string; icon: ReactNode; prominent?: boolean }
> = {
  home: { label: "首页", href: "/customer/", title: "喜乐帮到家", icon: <House size={24} weight="regular" /> },
  services: { label: "服务", href: "/customer/services", title: "服务选择", icon: <House size={24} weight="regular" /> },
  createOrder: { label: "下单", href: "/customer/order/create", title: "确认订单", icon: <ClipboardText size={24} weight="regular" /> },
  orders: { label: "订单", href: "/customer/orders", title: "订单", icon: <ClipboardText size={24} weight="regular" /> },
  aftersale: { label: "售后", href: "/customer/aftersale", title: "售后服务", icon: <ClipboardText size={24} weight="regular" /> },
  support: { label: "客服", href: "/customer/support", title: "客服工单", icon: <ChatCircleDots size={24} weight="regular" /> },
  profile: { label: "我的", href: "/customer/profile", title: "我的", icon: <UserCircle size={24} weight="regular" /> },
};

export const customerPrimaryNavConfig = [
  { label: "首页", href: "/customer/", icon: <House size={25} weight="regular" /> },
  { label: "订单", href: "/customer/orders", icon: <ClipboardText size={25} weight="regular" /> },
  { label: "新报修", href: "/customer/order/create", icon: <Plus size={24} weight="bold" />, prominent: true },
  { label: "消息", href: "/customer/notifications", icon: <BellSimple size={25} weight="regular" /> },
  { label: "我的", href: "/customer/profile", icon: <UserCircle size={25} weight="regular" /> },
] as const;

const customerPrimaryNavHrefByRoute: Readonly<Record<CustomerShellRoute, string>> = {
  home: "/customer/",
  services: "/customer/",
  createOrder: "/customer/order/create",
  orders: "/customer/orders",
  aftersale: "/customer/orders",
  support: "/customer/notifications",
  notifications: "/customer/notifications",
  profile: "/customer/profile",
  coupons: "/customer/profile",
};

export function resolveCustomerPrimaryNavHref(route: CustomerShellRoute): string {
  return customerPrimaryNavHrefByRoute[route];
}

function customerPrimaryNavItems(currentRoute: CustomerShellRoute) {
  const activeHref = resolveCustomerPrimaryNavHref(currentRoute);
  return customerPrimaryNavConfig.map((item) => ({
    ...item,
    key: item.href,
    active: item.href === activeHref,
  }));
}

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

export function createCustomerApiClient(
  cityCode: CityCode,
  token?: string,
  onUnauthorized?: (error: ApiClientError) => void,
) {
  const headers: Record<string, string> = {
    [XLB_HEADERS.cityCode]: cityCode,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return customerApi.forClient(
    createApiClient({
      baseUrl: getCustomerApiBase(),
      headers,
      onUnauthorized,
    }),
  );
}

function detectShellMode() {
  if (typeof window === "undefined") return "preview" as const;
  const mediaMatch = typeof window.matchMedia === "function" && window.matchMedia(MOBILE_SHELL_QUERY).matches;
  const touchViewport = window.innerWidth <= 900 && window.navigator.maxTouchPoints > 0;
  return mediaMatch || touchViewport ? ("app" as const) : ("preview" as const);
}

export function useCustomerShellMode() {
  const [mode, setMode] = useState<"preview" | "app">(detectShellMode());

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setMode(detectShellMode());
      return;
    }
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
  const items = useMemo(() => customerPrimaryNavItems(currentRoute), [currentRoute]);

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
  const bottomNav = <BottomNav items={customerPrimaryNavItems(currentRoute)} placement={fixedBottomNav || isAppMode ? "fixed" : "static"} />;

  return (
    <div className="customer-app-root" data-role="customer" data-shell-mode={isAppMode ? "app" : "preview"}>
      <div className="customer-device-preview">
        <div className="customer-device-frame">
          <MobileShell
            mode={isAppMode ? "app" : "preview"}
            topBar={topBar}
            bottomNav={bottomNav}
            contentStyle={{ paddingBottom: isAppMode ? "calc(76px + env(safe-area-inset-bottom))" : "8px" }}
            style={{ background: "transparent", minHeight: isAppMode ? "100dvh" : 824 }}
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
