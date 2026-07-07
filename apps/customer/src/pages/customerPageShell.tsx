import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient, customerApi } from "../../../../packages/api-client/src/index.js";
import type { CatalogSnapshot, CityCode, WorkflowUiBinding } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import { BottomNav, MobileShell } from "@xlb/ui";

export const CUSTOMER_ID = "customer-demo-001";
export const DEFAULT_CITY: CityCode = "hangzhou";
export const CITY_OPTIONS: ReadonlyArray<CityCode> = ["hangzhou", "shanghai", "beijing"];
export const CITY_STORAGE_KEY = "xlb.customer.cityCode";
export const ORDER_HISTORY_KEY = "xlb.customer.orderIds";
export const MOBILE_SHELL_QUERY = "(max-width: 640px), (pointer: coarse)";

export type CustomerRoute = "home" | "services" | "createOrder" | "orders" | "profile";

export type CustomerLoadable<T> =
  | { status: "pending" | "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string };

export const customerRouteConfig: Record<
  CustomerRoute,
  { label: string; href: string; title: string; icon: string; prominent?: boolean }
> = {
  home: { label: "首页", href: "/customer/", title: "喜乐帮到家", icon: "⌂" },
  services: { label: "服务", href: "/customer/services", title: "服务选择", icon: "⌕" },
  createOrder: { label: "下单", href: "/customer/order/create", title: "确认订单", icon: "+", prominent: true },
  orders: { label: "订单", href: "/customer/orders", title: "订单", icon: "▦" },
  profile: { label: "我的", href: "/customer/profile", title: "我的", icon: "👤" },
};

export function detectCustomerRoute(pathname = window.location.pathname): CustomerRoute {
  const trimmed = pathname.replace(/\/+$/, "") || "/";
  if (trimmed.endsWith("/customer/services")) return "services";
  if (trimmed.endsWith("/customer/order/create")) return "createOrder";
  if (trimmed.endsWith("/customer/orders")) return "orders";
  if (trimmed.endsWith("/customer/profile")) return "profile";
  return "home";
}

export function readCustomerCityCode(): CityCode {
  if (typeof window === "undefined") return DEFAULT_CITY;
  const stored = window.localStorage.getItem(CITY_STORAGE_KEY);
  return CITY_OPTIONS.includes(stored as CityCode) ? (stored as CityCode) : DEFAULT_CITY;
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

export function appendOrderId(orderId: string): string[] {
  const next = [orderId, ...readOrderIds().filter((item) => item !== orderId)].slice(0, 8);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(next));
  }
  return next;
}

export type CustomerPageApi = ReturnType<typeof createCustomerApiClient>;

export function createCustomerApiClient(cityCode: CityCode) {
  return customerApi.forClient(
    createApiClient({
      baseUrl: "",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
        [XLB_HEADERS.cityCode]: cityCode,
        [XLB_HEADERS.userId]: CUSTOMER_ID,
      },
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

export function CustomerBottomNav({ currentRoute }: { currentRoute: CustomerRoute }) {
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
  currentRoute: CustomerRoute;
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

export function renderFact(value: unknown): string {
  if (value === null || value === undefined || value === "") return "暂无";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length === 0 ? "[]" : JSON.stringify(value, null, 2);
  return JSON.stringify(value, null, 2);
}

type UatFact = { label: string; value: unknown };

export function UatDebugPanel({
  binding,
  facts,
  title = "UAT Debug",
}: {
  binding?: WorkflowUiBinding;
  facts: UatFact[];
  title?: string;
}) {
  return (
    <details style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "10px 12px" }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>{title}</summary>
      <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
        {binding && (
          <div style={{ display: "grid", gap: 2 }}>
            <strong>{binding.workflowName}</strong>
            <span style={{ color: "#64748b", fontSize: 12 }}>{binding.route}</span>
          </div>
        )}
        {facts.map((fact) => (
          <div key={fact.label} style={{ display: "grid", gap: 2 }}>
            <span style={{ color: "#8a735b", fontWeight: 700, fontSize: 12 }}>{fact.label}</span>
            <pre
              style={{
                background: "rgba(43, 33, 24, 0.05)",
                borderRadius: 8,
                color: "#2b2118",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 11,
                lineHeight: "16px",
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                padding: 8,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {renderFact(fact.value)}
            </pre>
          </div>
        ))}
      </div>
    </details>
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
    setValue(new URLSearchParams(window.location.search).get(key));
  }, [key]);
  return value;
}

export const customerPageStyles: Record<string, CSSProperties> = {
  quietText: { color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 },
  sectionGrid: { display: "grid", gap: 14 },
  panelCard: {
    background: "rgba(255, 255, 255, 0.86)",
    borderColor: "#ead8bd",
    borderRadius: 24,
    boxShadow: "0 8px 22px rgba(43, 33, 24, 0.08)",
    padding: 18,
  },
  flatCard: {
    background: "rgba(255, 250, 240, 0.72)",
    borderColor: "#ead8bd",
    borderRadius: 24,
    boxShadow: "none",
    padding: 18,
  },
};
