import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ClipboardText, Headset, House, Plus, UserCircle } from "@phosphor-icons/react";
import { ApiClientError, createApiClient, customerApi } from "@xlb/api-client";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import { BottomNav, MobileShell } from "@xlb/ui";
import { getCustomerApiBase } from "../features/auth/customerAuth";

export const DEFAULT_CITY: CityCode = "hangzhou";
export const CITY_OPTIONS: ReadonlyArray<CityCode> = ["hangzhou", "shanghai", "beijing"];
export const CITY_STORAGE_KEY = "xlb.customer.cityCode";
export const ORDER_HISTORY_KEY = "xlb.customer.orderIds";
export const MOBILE_SHELL_QUERY = "(max-width: 640px), (pointer: coarse)";

export type CustomerAppFailureKind =
  | "offline"
  | "unavailable"
  | "expired"
  | "permission"
  | "conflict"
  | "duplicate"
  | "unknown";

export interface CustomerAppFailure {
  kind: CustomerAppFailureKind;
  title: string;
  description: string;
  retryLabel: string;
}

export function describeCustomerAppError(error: unknown): CustomerAppFailure {
  const status = error instanceof ApiClientError ? error.status : undefined;

  if (status === 401) {
    return {
      kind: "expired",
      title: "登录已失效",
      description: "为了保护账号安全，请重新验证身份后继续。",
      retryLabel: "重新验证",
    };
  }
  if (status === 403) {
    return {
      kind: "permission",
      title: "当前账号无法进入顾客端",
      description: "请重新验证顾客身份；如果问题仍存在，请联系喜乐帮客服。",
      retryLabel: "重新验证",
    };
  }
  if (status === 409) {
    const responseBody = error instanceof ApiClientError ? error.responseBody ?? "" : "";
    const duplicate = /duplicate|idempot/i.test(responseBody);
    return {
      kind: duplicate ? "duplicate" : "conflict",
      title: duplicate ? "请勿重复提交" : "信息已发生变化",
      description: duplicate
        ? "服务端已收到相同请求，请先查看最新结果。"
        : "请刷新当前状态后再继续，页面不会覆盖服务端结果。",
      retryLabel: "查看最新状态",
    };
  }

  const browserOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (browserOffline || (error instanceof ApiClientError && error.kind === "network")) {
    return {
      kind: "offline",
      title: "网络连接不可用",
      description: "已保留当前页面信息，请恢复网络后重试。",
      retryLabel: "重新连接",
    };
  }
  if (error instanceof ApiClientError && error.kind === "timeout") {
    return {
      kind: "unavailable",
      title: "服务响应较慢",
      description: "本次结果尚未确认，请稍后重试，不要重复提交。",
      retryLabel: "稍后重试",
    };
  }
  return {
    kind: "unknown",
    title: "暂时无法完成请求",
    description: "没有收到可确认的服务结果，请重试或联系喜乐帮客服。",
    retryLabel: "重试",
  };
}

export type CustomerPrimaryRoute = "home" | "support" | "createOrder" | "orders" | "profile";
export type CustomerRoute = CustomerPrimaryRoute;
export type CustomerShellRoute =
  | CustomerPrimaryRoute
  | "services"
  | "aftersale"
  | "notifications"
  | "coupons";

export type CustomerLoadable<T> =
  | { status: "pending" | "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string };

export interface CustomerCityResolution {
  cityCode: CityCode;
  issue: "invalid-query" | "invalid-stored" | null;
  requestedCityCode?: string;
}

export function resolveCustomerCityCode(
  queryValue: string | null,
  storedValue: string | null,
): CustomerCityResolution {
  if (queryValue) {
    if (CITY_OPTIONS.includes(queryValue as CityCode)) {
      return { cityCode: queryValue as CityCode, issue: null };
    }
    const storedCity = CITY_OPTIONS.includes(storedValue as CityCode)
      ? storedValue as CityCode
      : DEFAULT_CITY;
    return { cityCode: storedCity, issue: "invalid-query", requestedCityCode: queryValue };
  }
  if (storedValue && !CITY_OPTIONS.includes(storedValue as CityCode)) {
    return { cityCode: DEFAULT_CITY, issue: "invalid-stored", requestedCityCode: storedValue };
  }
  return { cityCode: (storedValue as CityCode | null) ?? DEFAULT_CITY, issue: null };
}

export function readCustomerCityFromSearch(): CityCode | null {
  if (typeof window === "undefined") return null;
  const fromQuery = new URLSearchParams(window.location.search).get("cityCode");
  return fromQuery && CITY_OPTIONS.includes(fromQuery as CityCode) ? fromQuery as CityCode : null;
}

export function readCustomerCityResolution(): CustomerCityResolution {
  if (typeof window === "undefined") return { cityCode: DEFAULT_CITY, issue: null };
  const queryValue = new URLSearchParams(window.location.search).get("cityCode");
  const storedValue = window.localStorage.getItem(CITY_STORAGE_KEY);
  return resolveCustomerCityCode(queryValue, storedValue);
}

export const customerRouteConfig: Record<
  CustomerPrimaryRoute,
  { label: string; href: string; title: string; prominent?: boolean }
> = {
  home: { label: "首页", href: "/customer/", title: "喜乐帮到家" },
  support: { label: "客服", href: "/customer/support", title: "客服" },
  createOrder: { label: "新报修", href: "/customer/order/create", title: "新报修", prominent: true },
  orders: { label: "订单", href: "/customer/orders", title: "订单" },
  profile: { label: "我的", href: "/customer/profile", title: "我的" },
};

export const customerPrimaryNavRoutes = Object.freeze([
  "home",
  "support",
  "createOrder",
  "orders",
  "profile",
] as const);

export function resolveCustomerPrimaryRoute(route: CustomerShellRoute): CustomerPrimaryRoute {
  if (route === "services" || route === "notifications") return "home";
  if (route === "aftersale") return "orders";
  if (route === "coupons") return "profile";
  return route;
}

export function detectCustomerRoute(
  pathname = typeof window === "undefined" ? "/customer/" : window.location.pathname,
): CustomerShellRoute {
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
  const resolution = readCustomerCityResolution();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CITY_STORAGE_KEY, resolution.cityCode);
  }
  return resolution.cityCode;
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
  const value = new URLSearchParams(window.location.search).get(key)?.trim() ?? "";
  return value || null;
}

export interface CustomerDeepLinkContext {
  skuId: string | null;
  orderId: string | null;
  couponGrantId: string | null;
}

export function readCustomerDeepLinkContext(): CustomerDeepLinkContext {
  return {
    skuId: readRouteSearchParam("skuId"),
    orderId: readRouteSearchParam("orderId"),
    couponGrantId: readRouteSearchParam("couponGrantId"),
  };
}

export function describeCustomerDeepLink(
  route: CustomerShellRoute,
  context: CustomerDeepLinkContext,
): string | null {
  if (route === "orders" && context.orderId) {
    return "正在恢复链接中的订单，当前状态以服务端返回为准。";
  }
  if (route === "createOrder" && (context.skuId || context.couponGrantId)) {
    return "已读取链接中的服务或优惠参数，最终可用项和价格以服务端返回为准。";
  }
  return null;
}

export function setRouteSearchParams(patches: Record<string, string | null>, keepPathname = true): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  Object.entries(patches).forEach(([key, value]) => {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
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
  const headers: Record<string, string> = { [XLB_HEADERS.cityCode]: cityCode };
  if (token) headers.Authorization = `Bearer ${token}`;
  return customerApi.forClient(createApiClient({
    baseUrl: getCustomerApiBase(),
    headers,
    onUnauthorized,
  }));
}

function detectShellMode() {
  if (typeof window === "undefined") return "preview" as const;
  const mediaMatch = typeof window.matchMedia === "function" && window.matchMedia(MOBILE_SHELL_QUERY).matches;
  const touchViewport = window.innerWidth <= 900 && window.navigator.maxTouchPoints > 0;
  return mediaMatch || touchViewport ? "app" as const : "preview" as const;
}

export function useCustomerShellMode() {
  const [mode, setMode] = useState<"preview" | "app">(detectShellMode());
  useEffect(() => {
    const mediaQuery = typeof window.matchMedia === "function"
      ? window.matchMedia(MOBILE_SHELL_QUERY)
      : null;
    const syncMode = () => setMode(detectShellMode());
    syncMode();
    mediaQuery?.addEventListener("change", syncMode);
    window.addEventListener("resize", syncMode);
    return () => {
      mediaQuery?.removeEventListener("change", syncMode);
      window.removeEventListener("resize", syncMode);
    };
  }, []);
  return mode;
}

export function useCustomerNetworkStatus(): "online" | "offline" {
  const [status, setStatus] = useState<"online" | "offline">(() =>
    typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "online"
  );
  useEffect(() => {
    const setOnline = () => setStatus("online");
    const setOffline = () => setStatus("offline");
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);
  return status;
}

function CustomerNavIcon({ route, active }: { route: CustomerPrimaryRoute; active: boolean }) {
  const common = { "aria-hidden": true, size: route === "createOrder" ? 34 : 25, weight: active ? "fill" as const : "regular" as const };
  if (route === "home") return <House {...common} />;
  if (route === "support") return <Headset {...common} />;
  if (route === "createOrder") return <Plus {...common} weight="bold" />;
  if (route === "orders") return <ClipboardText {...common} />;
  return <UserCircle {...common} />;
}

export function CustomerBottomNav({
  currentRoute,
  placement = "static",
}: {
  currentRoute: CustomerShellRoute;
  placement?: "static" | "fixed";
}) {
  const activeRoute = resolveCustomerPrimaryRoute(currentRoute);
  const items = useMemo(() => customerPrimaryNavRoutes.map((route) => ({
    key: route,
    label: customerRouteConfig[route].label,
    active: route === activeRoute,
    href: customerRouteConfig[route].href,
    icon: <CustomerNavIcon active={route === activeRoute} route={route} />,
    prominent: customerRouteConfig[route].prominent,
  })), [activeRoute]);

  return (
    <BottomNav
      ariaLabel="顾客端主导航"
      className="customer-bottom-nav"
      items={items}
      placement={placement}
    />
  );
}

const CustomerShellContext = createContext(false);

type CustomerRouteShellProps = {
  currentRoute: CustomerShellRoute;
  topBar?: ReactNode;
  children: ReactNode;
  fixedBottomNav?: boolean;
  showBottomNav?: boolean;
};

export function CustomerRouteShell({
  currentRoute,
  topBar,
  children,
  fixedBottomNav = false,
  showBottomNav = true,
}: CustomerRouteShellProps) {
  const isNested = useContext(CustomerShellContext);
  const shellMode = useCustomerShellMode();
  const networkStatus = useCustomerNetworkStatus();
  const cityQuery = useRouteSearchParams("cityCode");
  const skuId = useRouteSearchParams("skuId");
  const orderId = useRouteSearchParams("orderId");
  const couponGrantId = useRouteSearchParams("couponGrantId");
  const isAppMode = shellMode === "app";
  const cityResolution = useMemo(() => resolveCustomerCityCode(
    cityQuery,
    typeof window === "undefined" ? null : window.localStorage.getItem(CITY_STORAGE_KEY),
  ), [cityQuery]);
  const deepLinkMessage = describeCustomerDeepLink(currentRoute, { skuId, orderId, couponGrantId });
  const placement = fixedBottomNav || isAppMode ? "fixed" : "static";
  const bottomNav = showBottomNav
    ? <CustomerBottomNav currentRoute={currentRoute} placement={placement} />
    : undefined;

  if (isNested) {
    return (
      <>
        {topBar ? <div className="customer-nested-shell-topbar">{topBar}</div> : null}
        {children}
      </>
    );
  }

  return (
    <CustomerShellContext.Provider value>
      <div
        className="customer-app-root"
        data-bottom-nav={bottomNav ? placement : "none"}
        data-role="customer"
        data-shell-mode={isAppMode ? "app" : "preview"}
      >
        <div className="customer-device-preview">
          <div className="customer-device-frame">
            <MobileShell
              bottomNav={bottomNav}
              contentStyle={{
                padding: 0,
                paddingBottom: bottomNav && placement === "fixed"
                  ? "calc(var(--xlb-size-bottom-navigation) + env(safe-area-inset-bottom))"
                  : 0,
              }}
              mode={isAppMode ? "app" : "preview"}
              style={{
                background: "var(--xlb-role-customer-cream)",
                minHeight: isAppMode ? "100dvh" : 844,
              }}
              topBar={topBar}
            >
              <div className="customer-shell-notices">
                {networkStatus === "offline" ? (
                  <p className="customer-shell-banner customer-shell-banner-warning" role="status">
                    当前处于离线状态。已保留页面信息，恢复网络后可继续。
                  </p>
                ) : null}
                {cityResolution.issue === "invalid-query" ? (
                  <div className="customer-shell-banner" role="status">
                    <span>链接中的城市暂不可用，已安全切换到当前服务城市。</span>
                    <button
                      onClick={() => setRouteSearchParams({ cityCode: cityResolution.cityCode })}
                      type="button"
                    >
                      使用当前城市
                    </button>
                  </div>
                ) : null}
                {deepLinkMessage ? (
                  <p className="customer-shell-banner" role="status">{deepLinkMessage}</p>
                ) : null}
              </div>
              <div className="customer-content-stack">{children}</div>
            </MobileShell>
          </div>
        </div>
      </div>
    </CustomerShellContext.Provider>
  );
}

export function useSearchParamSku(): string | null {
  return useRouteSearchParams("skuId");
}

export function useCatalogSkus(catalogState: CustomerLoadable<CatalogSnapshot>): CatalogSnapshot["categories"] | null {
  return catalogState.status === "success" ? catalogState.data.categories : null;
}

export function useRouteSearchParams(key: string): string | null {
  const [value, setValue] = useState<string | null>(() => readRouteSearchParam(key));
  useEffect(() => {
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
