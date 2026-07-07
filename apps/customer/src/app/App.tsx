import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { CatalogSnapshot, CityCode, Order, PaymentOrder, PriceQuote, ServiceSku, WorkflowActionContract } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import {
  ActionDock,
  BottomNav,
  Button,
  Card,
  CustomerQuoteCard,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  MobileShell,
  OrderCard,
  LocationSearchBar,
  PriceText,
  RuntimeThemeSurface,
  SearchBar,
  Select,
  QuantityStepper,
  ServiceCard,
  Skeleton,
  StatusTag,
  Tabs,
  Timeline,
} from "@xlb/ui";
import { createApiClient, customerApi } from "../../../../packages/api-client/src/index";
import {
  createCustomerWorkflowBinding,
  customerWorkflowActions,
  runWorkflowAction,
} from "../adapters/workflowBindings";
import "./mobile-shell.css";

type CustomerRoute = "home" | "services" | "createOrder" | "orders" | "profile";
type CustomerShellMode = "preview" | "app";
type Loadable<T> =
  | { status: "pending" | "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string };

type CatalogSku = ServiceSku & {
  categoryId: string;
  categoryName: string;
  itemName: string;
};
type CatalogCategory = CatalogSnapshot["categories"][number];

const DEFAULT_CITY: CityCode = "hangzhou";
const CUSTOMER_ID = "customer-demo-001";
const CITY_STORAGE_KEY = "xlb.customer.cityCode";
const ORDER_HISTORY_KEY = "xlb.customer.orderIds";
const MOBILE_APP_SHELL_QUERY = "(max-width: 640px), (pointer: coarse)";
const cityOptions: CityCode[] = ["hangzhou", "shanghai", "beijing"];
const cityAreaByCode: Record<CityCode, string> = {
  hangzhou: "静安区",
  shanghai: "黄埔区",
  beijing: "朝阳区",
};

const routeConfig: Record<CustomerRoute, { label: string; href: string; title: string; eyebrow: string; icon: string; prominent?: boolean }> = {
  home: { label: "首页", href: "/customer/", title: "喜乐帮到家", eyebrow: "上海 · 静安区", icon: "⌂" },
  services: { label: "服务", href: "/customer/services", title: "选择服务", eyebrow: "可预约服务", icon: "⌕" },
  createOrder: { label: "新报修", href: "/customer/order/create", title: "确认服务并下单", eyebrow: "新报修", icon: "+", prominent: true },
  orders: { label: "订单", href: "/customer/orders", title: "订单进度", eyebrow: "已创建订单", icon: "▦" },
  profile: { label: "我的", href: "/customer/profile", title: "我的", eyebrow: "账户资料", icon: "♙" },
};

const categoryDisplay: Record<string, { label: string; icon: string; tone: string }> = {
  家庭保洁: { label: "保洁", icon: "洁", tone: "#B85F2A" },
  家电清洗: { label: "清洗", icon: "净", tone: "#0F766E" },
  家电维修: { label: "维修", icon: "修", tone: "#2563EB" },
  上门安装: { label: "安装", icon: "装", tone: "#7C3AED" },
  管道疏通: { label: "疏通", icon: "通", tone: "#B45309" },
  开锁换锁: { label: "开锁", icon: "锁", tone: "#334155" },
  水电维修: { label: "水电", icon: "电", tone: "#0284C7" },
  "防水补漏/精准测漏": { label: "防水", icon: "漏", tone: "#0891B2" },
  家具家居维修保养: { label: "家具", icon: "家", tone: "#854D0E" },
  "房屋修缮/局部改造": { label: "修缮", icon: "房", tone: "#9A3412" },
  "搬家搬运/拆旧清运": { label: "搬家", icon: "搬", tone: "#15803D" },
  甲醛检测治理: { label: "除醛", icon: "醛", tone: "#16A34A" },
  数码办公维修: { label: "数码", icon: "数", tone: "#4338CA" },
  洗衣洗鞋: { label: "洗护", icon: "洗", tone: "#0369A1" },
  "保姆月嫂/照护": { label: "照护", icon: "护", tone: "#BE185D" },
  四害消杀: { label: "消杀", icon: "杀", tone: "#4D7C0F" },
};

const homeCategoryOrder = [
  "家庭保洁",
  "家电清洗",
  "家电维修",
  "上门安装",
  "管道疏通",
  "开锁换锁",
  "水电维修",
  "搬家搬运/拆旧清运",
  "洗衣洗鞋",
  "保姆月嫂/照护",
  "甲醛检测治理",
  "四害消杀",
  "防水补漏/精准测漏",
  "家具家居维修保养",
  "房屋修缮/局部改造",
  "数码办公维修",
];

const shellStyle = {
  "--xlb-role-accent": "#B85F2A",
  background: "#efe7da",
  minHeight: "100vh",
} as CSSProperties;

const sectionGrid: CSSProperties = {
  display: "grid",
  gap: 14,
};

const quietText: CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: "20px",
  margin: 0,
};

const customerCardStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.86)",
  borderColor: "#ead8bd",
  borderRadius: 24,
  boxShadow: "0 8px 22px rgba(43, 33, 24, 0.08)",
  padding: 18,
};

const customerFlatCardStyle: CSSProperties = {
  background: "rgba(255, 250, 240, 0.72)",
  borderColor: "#ead8bd",
  borderRadius: 24,
  boxShadow: "none",
  padding: 18,
};

function cityDisplayLabel(cityCode: CityCode): string {
  return `${cityCode} · ${cityAreaByCode[cityCode] ?? "市中心"}`;
}

function dedupePathParts(parts: Array<string | undefined>): string[] {
  const list = parts.filter(Boolean).map((item) => item!.trim());
  const deduped: string[] = [];
  for (const item of list) {
    if (!deduped.includes(item)) deduped.push(item);
  }
  return deduped;
}

function getSkuPathLabel(sku: CatalogSku): string {
  return dedupePathParts([sku.categoryName, sku.itemName, sku.name]).join(" · ");
}

function getSkuSubtitle(sku: CatalogSku): string {
  const path = dedupePathParts([sku.categoryName, sku.itemName]).join(" · ");
  return path ? `${path} · ${sku.unit}` : sku.unit;
}

function currentRoute(): CustomerRoute {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.endsWith("/customer/services")) return "services";
  if (path.endsWith("/customer/order/create")) return "createOrder";
  if (path.endsWith("/customer/orders")) return "orders";
  if (path.endsWith("/customer/profile")) return "profile";
  return "home";
}

function readCity(): CityCode {
  if (typeof window === "undefined") return DEFAULT_CITY;
  const stored = window.localStorage.getItem(CITY_STORAGE_KEY);
  return cityOptions.includes(stored as CityCode) ? (stored as CityCode) : DEFAULT_CITY;
}

function readOrderIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORDER_HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function rememberOrder(orderId: string): string[] {
  const next = [orderId, ...readOrderIds().filter((id) => id !== orderId)].slice(0, 8);
  window.localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(next));
  return next;
}

function detectCustomerShellMode(): CustomerShellMode {
  if (typeof window === "undefined") return "preview";
  const mediaMatch = window.matchMedia(MOBILE_APP_SHELL_QUERY).matches;
  const touchViewport = window.navigator.maxTouchPoints > 0 && window.innerWidth <= 900;
  return mediaMatch || touchViewport ? "app" : "preview";
}

function useCustomerShellMode(): CustomerShellMode {
  const [shellMode, setShellMode] = useState<CustomerShellMode>(detectCustomerShellMode);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_APP_SHELL_QUERY);
    const syncShellMode = () => setShellMode(detectCustomerShellMode());

    syncShellMode();
    mediaQuery.addEventListener("change", syncShellMode);
    window.addEventListener("resize", syncShellMode);
    return () => {
      mediaQuery.removeEventListener("change", syncShellMode);
      window.removeEventListener("resize", syncShellMode);
    };
  }, []);

  return shellMode;
}

function createCustomerApi(cityCode: CityCode) {
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

function flattenSkus(catalog?: CatalogSnapshot): CatalogSku[] {
  if (!catalog) return [];
  return catalog.categories.flatMap((category) =>
    category.items.flatMap((item) =>
      item.skus.map((sku) => ({
        ...sku,
        categoryId: category.categoryId,
        categoryName: category.name,
        itemName: item.name,
      })),
    ),
  );
}

function representativeSku(category: CatalogCategory): CatalogSku | undefined {
  const item = category.items.find((catalogItem) => catalogItem.skus.length > 0);
  const sku = item?.skus[0];
  if (!item || !sku) return undefined;
  return {
    ...sku,
    categoryId: category.categoryId,
    categoryName: category.name,
    itemName: item.name,
  };
}

function representativeSkus(catalog: CatalogSnapshot): CatalogSku[] {
  return catalog.categories.flatMap((category) => {
    const sku = representativeSku(category);
    return sku ? [sku] : [];
  });
}

function orderedHomeCategories(catalog: CatalogSnapshot): CatalogCategory[] {
  const byName = new Map(catalog.categories.map((category) => [category.name, category]));
  const ordered = homeCategoryOrder.flatMap((categoryName) => {
    const category = byName.get(categoryName);
    return category ? [category] : [];
  });
  const remaining = catalog.categories.filter((category) => !homeCategoryOrder.includes(category.name));
  return [...ordered, ...remaining];
}

function categoryMeta(category: CatalogCategory) {
  return categoryDisplay[category.name] ?? {
    label: category.name.length > 4 ? category.name.slice(0, 4) : category.name,
    icon: category.name.slice(0, 1),
    tone: "#B85F2A",
  };
}

function categoryExamples(category: CatalogCategory): string {
  return category.items
    .slice(0, 3)
    .map((item) => item.name)
    .join("、");
}

function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "cancelled" || status === "failed" || status === "closed") return "danger";
  if (status === "pending" || status === "pending_payment" || status === "draft") return "warning";
  return "muted";
}

function HelperText({ children }: { children: ReactNode }) {
  return <p style={quietText}>{children}</p>;
}

type UatFact = {
  label: string;
  value: unknown;
};

function renderUatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "暂无";
  if (Array.isArray(value) && value.length === 0) return "[]";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function UatDebugPanel({ facts, title = "UAT 调试信息" }: { facts: UatFact[]; title?: string }) {
  return (
    <details
      style={{
        background: "rgba(255, 250, 240, 0.76)",
        border: "1px solid rgba(234, 216, 189, 0.86)",
        borderRadius: 16,
        color: "#5f5143",
        fontSize: 12,
        lineHeight: "18px",
        padding: "10px 12px",
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 800 }}>{title}</summary>
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        {facts.map((fact) => (
          <div key={fact.label} style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "#8a735b", fontWeight: 800 }}>{fact.label}</span>
            <pre
              style={{
                background: "rgba(43, 33, 24, 0.06)",
                borderRadius: 10,
                color: "#2B2118",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                fontSize: 11,
                lineHeight: "16px",
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                padding: 10,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {renderUatValue(fact.value)}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}

function PhoneStatusBar() {
  return (
    <div className="customer-fake-status-bar" style={{ alignItems: "center", color: "#2B2118", display: "flex", fontSize: 12, fontWeight: 800, justifyContent: "space-between", lineHeight: "16px" }}>
      <span>9:41</span>
      <span>5G ▰</span>
    </div>
  );
}

function CustomerPageHeader({ route, cityCode, showStatusBar }: { route: CustomerRoute; cityCode: CityCode; showStatusBar: boolean }) {
  const config = routeConfig[route];
  return (
    <header style={{ display: "grid", gap: 10, padding: "20px 20px 8px" }}>
      {showStatusBar && <PhoneStatusBar />}
      <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "#8a735b", fontSize: 13, fontWeight: 700, lineHeight: "18px" }}>
            {route === "home" ? `${cityCode} · 静安区` : config.eyebrow}
          </span>
          <h1 style={{ color: "#2B2118", fontFamily: "Noto Serif SC, STSong, SimSun, serif", fontSize: 28, fontWeight: 800, letterSpacing: 0, lineHeight: "36px", margin: 0 }}>
            {config.title}
          </h1>
        </div>
        <span
          aria-hidden="true"
          style={{
            alignItems: "center",
            border: "1px solid rgba(23, 63, 53, 0.18)",
            borderRadius: 999,
            color: "#173F35",
            display: "inline-flex",
            fontSize: 22,
            height: 40,
            justifyContent: "center",
            width: 40,
          }}
        >
          ◇
        </span>
      </div>
    </header>
  );
}

function AppFrame({
  route,
  cityCode,
  children,
}: {
  route: CustomerRoute;
  cityCode: CityCode;
  children: ReactNode;
}) {
  const shellMode = useCustomerShellMode();
  const appMode = shellMode === "app";

  return (
    <div className="customer-app-root" data-role="customer" data-shell-mode={shellMode} style={shellStyle}>
      <div className="customer-device-preview">
        <div className="customer-device-frame">
        <MobileShell
          mode={shellMode}
          topBar={<CustomerPageHeader cityCode={cityCode} route={route} showStatusBar={!appMode} />}
          bottomNav={
            <BottomNav
              items={(Object.keys(routeConfig) as CustomerRoute[]).map((key) => ({
                key,
                label: routeConfig[key].label,
                active: key === route,
                href: routeConfig[key].href,
                icon: routeConfig[key].icon,
                prominent: routeConfig[key].prominent,
              }))}
              placement={appMode ? "fixed" : "static"}
              style={{
                background: "rgba(255, 250, 240, 0.96)",
                borderTop: "1px solid rgba(222, 196, 158, 0.58)",
                boxShadow: "0 -10px 26px rgba(43, 33, 24, 0.07)",
              }}
            />
          }
          contentStyle={{ padding: "8px 20px 0" }}
          style={{ background: "#FFFAF0", minHeight: appMode ? "100dvh" : 824 }}
        >
          <div className="customer-content-stack">{children}</div>
        </MobileShell>
        </div>
      </div>
    </div>
  );
}

function TrustPillRow() {
  const items = ["价格透明", "在线预约", "售后保障"];
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            background: "rgba(255, 255, 255, 0.74)",
            border: "1px solid rgba(234, 216, 189, 0.82)",
            borderRadius: 999,
            color: "#5f5143",
            fontSize: 12,
            fontWeight: 800,
            lineHeight: "18px",
            padding: "7px 8px",
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function CategoryShortcutGrid({ categories }: { categories: CatalogCategory[] }) {
  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {categories.map((category) => {
        const meta = categoryMeta(category);
        const examples = categoryExamples(category);
        return (
          <button
            key={category.categoryId}
            onClick={() => {
              window.location.href = `/customer/services?category=${encodeURIComponent(category.categoryId)}`;
            }}
            title={`${category.name}${examples ? `：${examples}` : ""}`}
            type="button"
            style={{
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.8)",
              border: "1px solid rgba(234, 216, 189, 0.78)",
              borderRadius: 18,
              boxShadow: "0 6px 16px rgba(43, 33, 24, 0.06)",
              color: "#2B2118",
              cursor: "pointer",
              display: "grid",
              fontFamily: "inherit",
              gap: 7,
              justifyItems: "center",
              minHeight: 82,
              padding: "10px 4px",
              textAlign: "center",
              touchAction: "manipulation",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                alignItems: "center",
                background: `${meta.tone}17`,
                borderRadius: 16,
                color: meta.tone,
                display: "inline-flex",
                fontSize: 16,
                fontWeight: 900,
                height: 42,
                justifyContent: "center",
                lineHeight: "20px",
                width: 42,
              }}
            >
              {meta.icon}
            </span>
            <span style={{ fontSize: 12, fontWeight: 800, lineHeight: "16px", minHeight: 32 }}>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function CatalogState({
  catalogState,
  onRetry,
  retryAction,
  children,
}: {
  catalogState: Loadable<CatalogSnapshot>;
  onRetry: () => void;
  retryAction: WorkflowActionContract;
  children: (catalog: CatalogSnapshot) => ReactNode;
}) {
  if (catalogState.status === "loading") {
    return (
      <Card title="正在加载服务" actions={<StatusTag tone="primary">请稍候</StatusTag>}>
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton style={{ height: 18, width: "70%" }} />
          <Skeleton style={{ height: 18, width: "86%" }} />
          <Skeleton style={{ height: 96 }} />
        </div>
      </Card>
    );
  }

  if (catalogState.status === "error") {
    return (
      <Card title="服务暂时没加载出来" actions={<StatusTag tone="danger">稍后再试</StatusTag>} style={{ ...customerCardStyle, borderColor: "#fca5a5" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <HelperText>请检查网络或稍后重试。页面不会用示例服务替代真实可预约项目。</HelperText>
          <ActionDock actions={[retryAction]} density="compact" onAction={() => onRetry()} showDisabledReason={false} />
          <UatDebugPanel facts={[{ label: "catalog error", value: catalogState.error }]} />
        </div>
      </Card>
    );
  }

  if (catalogState.status !== "success") {
    return <LoadingState title="准备加载服务" description="正在读取当前城市可预约项目。" />;
  }

  if (catalogState.data.categories.length === 0) {
    return <EmptyState title="暂无可用服务" description="当前城市暂时没有可预约项目。" />;
  }

  return <>{children(catalogState.data)}</>;
}

function HomePage({
  cityCode,
  catalogState,
  onRetryCatalog,
  onCityChange,
}: {
  cityCode: CityCode;
  catalogState: Loadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
  onCityChange: (cityCode: CityCode) => void;
}) {
  const [query, setQuery] = useState("");
  const [showCityPicker, setShowCityPicker] = useState(false);
  const binding = createCustomerWorkflowBinding({ route: "home", cityCode });
  const openServicesAction = customerWorkflowActions.openServices();
  const retryCatalogAction = customerWorkflowActions.retryCatalog();

  return (
    <RuntimeThemeSurface binding={binding}>
      <LocationSearchBar
        cityLabel={cityCode}
        areaLabel={cityAreaByCode[cityCode] ?? "静安区"}
        placeholder="搜保洁、维修、搬家、月嫂"
        value={query}
        onSearchChange={setQuery}
        onCityClick={() => setShowCityPicker((previous) => !previous)}
      />
      {showCityPicker && (
        <div style={{ marginTop: 8, width: "100%" }}>
          <Select
            value={cityCode}
            onChange={(event) => {
              onCityChange(event.target.value as CityCode);
              setShowCityPicker(false);
            }}
            style={{ width: "100%", borderColor: "#ead8bd" }}
          >
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {cityDisplayLabel(city)}
              </option>
            ))}
          </Select>
        </div>
      )}
      <TrustPillRow />

      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog} retryAction={retryCatalogAction}>
        {(catalog) => {
          const allServices = flattenSkus(catalog);
          const homeCategories = orderedHomeCategories(catalog);
          const normalizedQuery = query.trim().toLowerCase();
          const services = normalizedQuery
            ? allServices
                .filter((sku) => {
                  const text = `${sku.categoryName} ${sku.itemName} ${sku.name}`.toLowerCase();
                  return text.includes(normalizedQuery);
                })
                .slice(0, 16)
            : representativeSkus({ ...catalog, categories: homeCategories }).slice(0, 8);

          if (services.length === 0) {
            return <EmptyState title="没有匹配服务" description="请更换关键词或切换城市后重试。" />;
          }

          return (
            <div style={sectionGrid}>
              <Card title="常用服务" actions={<StatusTag tone="success">可预约</StatusTag>} style={customerFlatCardStyle}>
                <div style={{ display: "grid", gap: 12 }}>
                  <CategoryShortcutGrid categories={homeCategories} />
                </div>
              </Card>
              <Card
                style={{
                  ...customerFlatCardStyle,
                  background: "linear-gradient(135deg, rgba(255, 250, 240, 0.9), rgba(255, 255, 255, 0.62))",
                  minHeight: 92,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <StatusTag tone="warning" style={{ justifySelf: "start" }}>安心下单</StatusTag>
                  <strong style={{ color: "#2B2118", fontSize: 17, lineHeight: "24px" }}>先选服务，再确认报价</strong>
                  <span style={{ color: "#9a8266", fontSize: 12, lineHeight: "18px" }}>
                    报价确认前不会提交订单。支付单生成后仍保持待支付状态，不会替你完成支付。
                  </span>
                </div>
              </Card>
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                <h2 style={{ color: "#2B2118", fontSize: 18, lineHeight: "24px", margin: 0 }}>{normalizedQuery ? "搜索结果" : "热门服务"}</h2>
                <Button
                  disabled={!openServicesAction.enabled}
                  onClick={() => runWorkflowAction(openServicesAction, () => { window.location.href = "/customer/services"; })}
                  title={openServicesAction.disabledReasonCode ?? openServicesAction.actionId}
                  variant="ghost"
                >
                  {openServicesAction.label}
                </Button>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {services.map((sku) => (
                  (() => {
                    const selectAction = customerWorkflowActions.selectService(sku.skuId);
                    return (
                  <ServiceCard
                    key={sku.skuId}
                    title={sku.name}
                    subtitle={getSkuSubtitle(sku)}
                    status={<StatusTag tone="success">可预约</StatusTag>}
                    actionLabel={selectAction.label}
                    onClick={() => runWorkflowAction(selectAction, () => {
                          window.location.href = `/customer/order/create?skuId=${encodeURIComponent(sku.skuId)}`;
                        })}
                        style={customerCardStyle}
                      />
                    );
                  })()
                ))}
              </div>
            </div>
          );
        }}
      </CatalogState>
    </RuntimeThemeSurface>
  );
}

function ServicesPage({
  cityCode,
  catalogState,
  onRetryCatalog,
}: {
  cityCode: CityCode;
  catalogState: Loadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}) {
  const [query, setQuery] = useState("");
  const initialCategory = useMemo(() => new URLSearchParams(window.location.search).get("category") ?? "all", []);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const binding = createCustomerWorkflowBinding({ route: "services", cityCode });
  const retryCatalogAction = customerWorkflowActions.retryCatalog();

  function updateActiveCategory(categoryId: string) {
    setActiveCategory(categoryId);
    const url = new URL(window.location.href);
    if (categoryId === "all") {
      url.searchParams.delete("category");
    } else {
      url.searchParams.set("category", categoryId);
    }
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <RuntimeThemeSurface binding={binding}>
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="搜索服务或类目"
        leadingIcon="⌕"
        style={{ borderColor: "#ead8bd", borderRadius: 16, boxShadow: "0 6px 16px rgba(43, 33, 24, 0.08)", minHeight: 46 }}
      />
      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog} retryAction={retryCatalogAction}>
        {(catalog) => {
          const validActiveCategory = activeCategory === "all" || catalog.categories.some((category) => category.categoryId === activeCategory)
            ? activeCategory
            : "all";
          const tabs = [
            { key: "all", label: "全部" },
            ...catalog.categories.map((category) => ({
              key: category.categoryId,
              label: category.name,
            })),
          ];
          const services = flattenSkus(catalog).filter((sku) => {
            const matchesCategory = validActiveCategory === "all" || sku.categoryId === validActiveCategory;
            const text = `${sku.categoryName} ${sku.itemName} ${sku.name}`.toLowerCase();
            return matchesCategory && text.includes(query.trim().toLowerCase());
          });
          const activeCategoryName = validActiveCategory === "all"
            ? "全部服务"
            : catalog.categories.find((category) => category.categoryId === validActiveCategory)?.name ?? "全部服务";

          return (
            <>
              <Tabs activeKey={validActiveCategory} onChange={updateActiveCategory} items={tabs} density="compact" />
              <Card title={activeCategoryName} actions={<StatusTag tone="success">{services.length} 项</StatusTag>} style={customerFlatCardStyle}>
                <HelperText>共 {catalog.categories.length} 个服务大类。先选服务，下一步确认价格后再提交订单。</HelperText>
              </Card>
              {services.length === 0 ? (
                <EmptyState title="没有匹配服务" description="可以调整分类或搜索词后再试。" />
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {services.slice(0, 24).map((sku) => (
                    (() => {
                      const selectAction = customerWorkflowActions.selectService(sku.skuId);
                      return (
                    <ServiceCard
                      key={sku.skuId}
                      title={sku.name}
                      subtitle={getSkuSubtitle(sku)}
                      status={<StatusTag tone="success">可下单</StatusTag>}
                          priceText="下单页确认价格"
                          actionLabel={selectAction.label}
                          onClick={() => runWorkflowAction(selectAction, () => {
                            window.location.href = `/customer/order/create?skuId=${encodeURIComponent(sku.skuId)}`;
                          })}
                          style={{ ...customerCardStyle, minHeight: 104 }}
                        />
                      );
                    })()
                  ))}
                </div>
              )}
            </>
          );
        }}
      </CatalogState>
    </RuntimeThemeSurface>
  );
}

function CreateOrderPage({
  cityCode,
  api,
  catalogState,
  onRetryCatalog,
  onOrderCreated,
}: {
  cityCode: CityCode;
  api: ReturnType<typeof createCustomerApi>;
  catalogState: Loadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
  onOrderCreated: (orderId: string) => void;
}) {
  const initialSkuId = useMemo(() => new URLSearchParams(window.location.search).get("skuId") ?? "", []);
  const [selectedSkuId, setSelectedSkuId] = useState(initialSkuId);
  const [quantity, setQuantity] = useState(1);
  const [quoteState, setQuoteState] = useState<Loadable<PriceQuote>>({ status: "pending" });
  const [submitState, setSubmitState] = useState<
    | { status: "pending" | "submitting" }
    | { status: "success"; order: Order; paymentOrder: PaymentOrder; verifiedOrder: Order }
    | { status: "error"; error: string }
  >({ status: "pending" });

  const skus = useMemo(() => flattenSkus(catalogState.data), [catalogState.data]);
  const selectedSku = skus.find((sku) => sku.skuId === selectedSkuId);
  const binding = createCustomerWorkflowBinding({
    route: "createOrder",
    cityCode,
    selectedSkuId,
    quoteReady: quoteState.status === "success",
    submitting: submitState.status === "submitting",
  });
  const retryCatalogAction = customerWorkflowActions.retryCatalog();
  const retryQuoteAction = customerWorkflowActions.retryQuote(selectedSkuId);
  const submitOrderAction = customerWorkflowActions.submitOrder(
    quoteState.status === "success",
    Boolean(selectedSkuId),
    submitState.status === "submitting",
  );
  const viewOrdersAction = customerWorkflowActions.viewOrders();
  const createOrderPayload = selectedSkuId
    ? {
        customerId: CUSTOMER_ID,
        skuId: selectedSkuId,
        quantity,
      }
    : null;

  function loadQuote(skuId: string) {
    setQuoteState({ status: "loading" });
    api
      .getPriceQuote(skuId)
      .then((response) => {
        setQuoteState({ status: "success", data: response.quote });
      })
      .catch((error: unknown) => {
        setQuoteState({ status: "error", error: error instanceof Error ? error.message : String(error) });
      });
  }

  useEffect(() => {
    if (!selectedSkuId && skus[0]) setSelectedSkuId(skus[0].skuId);
  }, [selectedSkuId, skus]);

  useEffect(() => {
    if (!selectedSkuId) {
      setQuoteState({ status: "pending" });
      return;
    }

    loadQuote(selectedSkuId);
  }, [api, selectedSkuId]);

  async function submitOrder() {
    if (!selectedSkuId) {
      setSubmitState({ status: "error", error: "请先选择一个服务。" });
      return;
    }

    setSubmitState({ status: "submitting" });
    try {
      const orderResponse = await api.createOrder(createOrderPayload ?? {
        customerId: CUSTOMER_ID,
        skuId: selectedSkuId,
        quantity,
      });
      const paymentResponse = await api.createPaymentOrder({ orderId: orderResponse.order.orderId });
      const verifiedOrder = await api.getOrder(orderResponse.order.orderId);
      onOrderCreated(orderResponse.order.orderId);
      setSubmitState({
        status: "success",
        order: orderResponse.order,
        paymentOrder: paymentResponse.paymentOrder,
        verifiedOrder: verifiedOrder.order,
      });
    } catch (error) {
      setSubmitState({ status: "error", error: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <RuntimeThemeSurface binding={binding}>
      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog} retryAction={retryCatalogAction}>
        {() => (
          <Card title="选择服务" actions={<StatusTag tone="primary">{cityCode}</StatusTag>} style={customerCardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <FormField label="服务项目" description="选择本次需要上门处理的项目">
                <Select value={selectedSkuId} onChange={(event) => setSelectedSkuId(event.target.value)}>
                  <option value="" disabled>
                    请选择服务
                  </option>
              {skus.map((sku) => (
                <option key={sku.skuId} value={sku.skuId}>
                  {getSkuPathLabel(sku)}
                </option>
              ))}
                </Select>
              </FormField>
              <FormField label="数量" description="按服务计价单位提交">
                <QuantityStepper
                  max={100}
                  value={quantity}
                  onChange={setQuantity}
                />
              </FormField>
              {selectedSku && (
                <ServiceCard
                  title={selectedSku.name}
                  subtitle={getSkuSubtitle(selectedSku)}
                  status={<StatusTag tone="success">已选择</StatusTag>}
                  style={{ ...customerFlatCardStyle, minHeight: 96 }}
                >
                  <Button
                    onClick={() => {
                      window.location.href = "/customer/services";
                    }}
                    variant="ghost"
                    type="button"
                  >
                    更换服务
                  </Button>
                </ServiceCard>
              )}
            </div>
          </Card>
        )}
      </CatalogState>

      <Card title="上门信息" actions={<StatusTag tone="muted">UAT 账号</StatusTag>} style={customerFlatCardStyle}>
        <HelperText>本轮先验证服务、报价、下单、支付单和订单复查。页面不会展示编造的联系人、地址或支付成功状态。</HelperText>
      </Card>

      {quoteState.status === "loading" && <LoadingState title="正在确认价格" description="价格返回后才可以提交订单。" />}
      {quoteState.status === "error" && (
        <ErrorState
          title="暂时无法报价"
          description="请重新报价，价格未确认前不会提交订单。"
          action={<ActionDock actions={[retryQuoteAction]} density="compact" onAction={() => selectedSkuId && loadQuote(selectedSkuId)} />}
        />
      )}
      {quoteState.status === "success" && (
        <CustomerQuoteCard
          price={<PriceText amount={quoteState.data.basePrice} currency={quoteState.data.currency} style={{ fontSize: 24, lineHeight: "30px" }} />}
          status={<StatusTag tone="success">{quoteState.data.priceType}</StatusTag>}
          meta={`${quoteState.data.priceText} · 提交前可更换服务或数量`}
          style={customerCardStyle}
        />
      )}

      <Card
        title="下单进度"
        actions={<StatusTag tone={submitState.status === "success" ? "success" : "warning"}>{submitState.status === "success" ? "已创建" : submitState.status === "submitting" ? "提交中" : "待提交"}</StatusTag>}
        style={customerCardStyle}
      >
        <Timeline
          items={[
            { key: "catalog", title: "选择服务", description: selectedSku ? selectedSku.name : "先选择一个可预约项目" },
            { key: "quote", title: "确认报价", description: quoteState.status === "success" ? "报价已确认" : "等待价格返回" },
            { key: "order", title: "创建订单", description: submitState.status === "success" ? "订单已创建" : "提交后创建订单" },
            { key: "payment", title: "生成支付单", description: submitState.status === "success" ? "支付单已生成，等待支付" : "订单创建后生成支付单" },
          ]}
        />
      </Card>

      <ActionDock
        actions={[submitOrderAction]}
        onAction={() => submitOrder()}
        showDisabledReason={false}
        style={{
          background: "rgba(255, 250, 240, 0.94)",
          borderTop: "1px solid rgba(222, 196, 158, 0.64)",
          bottom: 62,
          margin: "0 -20px",
          padding: "14px 16px",
          position: "sticky",
          zIndex: 2,
        }}
      />

      {submitState.status === "error" && <ErrorState title="下单失败" description="请稍后重试，页面不会跳过失败状态。" />}
      {submitState.status === "success" && (
        <OrderCard
          title="订单已创建"
          status={<StatusTag tone={statusTone(submitState.verifiedOrder.status)}>{submitState.verifiedOrder.status}</StatusTag>}
          description={`${submitState.order.skuName} · ${submitState.order.quantity}${submitState.order.unit} · ${cityCode}`}
          meta={`支付单已生成 · ${submitState.paymentOrder.status}`}
          priceText={<PriceText amount={submitState.order.totalAmount} currency={submitState.order.currency} />}
          style={customerCardStyle}
          actions={
            <ActionDock
              actions={[viewOrdersAction]}
              density="compact"
              onAction={() => { window.location.href = "/customer/orders"; }}
              showDisabledReason={false}
            />
          }
        >
          <HelperText>订单详情已复查。支付单已生成但未支付，本页不会显示支付成功或派单成功。</HelperText>
        </OrderCard>
      )}
      <UatDebugPanel
        facts={[
          { label: "city_code", value: cityCode },
          { label: "skuId", value: selectedSkuId },
          { label: "quote", value: quoteState.status === "success" ? quoteState.data : quoteState },
          { label: "create order payload", value: createOrderPayload },
          { label: "orderId", value: submitState.status === "success" ? submitState.order.orderId : null },
          { label: "paymentOrderId", value: submitState.status === "success" ? submitState.paymentOrder.paymentOrderId : null },
          { label: "order detail response", value: submitState.status === "success" ? submitState.verifiedOrder : null },
          { label: "workflow state", value: binding.state },
          { label: "availableActions", value: binding.availableActions },
          {
            label: "disabledReason",
            value: {
              binding: binding.disabledReasons,
              actions: binding.availableActions
                .filter((actionContract) => actionContract.disabledReasonCode)
                .map((actionContract) => ({
                  actionId: actionContract.actionId,
                  disabledReasonCode: actionContract.disabledReasonCode,
                })),
            },
          },
          { label: "quote error", value: quoteState.status === "error" ? quoteState.error : null },
          { label: "submit error", value: submitState.status === "error" ? submitState.error : null },
        ]}
      />
    </RuntimeThemeSurface>
  );
}

function OrdersPage({
  cityCode,
  api,
  orderIds,
}: {
  cityCode: CityCode;
  api: ReturnType<typeof createCustomerApi>;
  orderIds: string[];
}) {
  const [ordersState, setOrdersState] = useState<Loadable<Order[]>>({ status: "pending" });
  const binding = createCustomerWorkflowBinding({
    route: "orders",
    cityCode,
    hasOrderIds: orderIds.length > 0,
  });
  const retryOrderDetailsAction = customerWorkflowActions.retryOrderDetails(orderIds.length > 0);

  function loadOrders() {
    if (orderIds.length === 0) {
      setOrdersState({ status: "success", data: [] });
      return;
    }

    setOrdersState({ status: "loading" });
    Promise.all(orderIds.map((orderId) => api.getOrder(orderId).then((response) => response.order)))
      .then((orders) => setOrdersState({ status: "success", data: orders }))
      .catch((error: unknown) => setOrdersState({ status: "error", error: error instanceof Error ? error.message : String(error) }));
  }

  useEffect(loadOrders, [api, orderIds]);

  return (
    <RuntimeThemeSurface binding={binding}>
      <Card title="订单记录" actions={<StatusTag tone="warning">本机记录</StatusTag>} style={customerFlatCardStyle}>
        <HelperText>这里展示本浏览器刚刚创建过的订单，并逐个复查订单详情。不会展示示例订单。</HelperText>
      </Card>
      {ordersState.status === "loading" && <LoadingState title="正在读取订单" description="正在复查已创建订单的详情。" />}
      {ordersState.status === "error" && (
        <ErrorState
          title="订单读取失败"
          description="请稍后重试，读取失败的订单不会被替换成示例内容。"
          action={<ActionDock actions={[retryOrderDetailsAction]} density="compact" onAction={() => loadOrders()} />}
        />
      )}
      {ordersState.status === "success" && ordersState.data.length === 0 && (
        <EmptyState title="暂无订单记录" description="完成一次下单后，这里会展示订单复查结果。" />
      )}
      {ordersState.status === "success" && ordersState.data.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {ordersState.data.map((order) => (
            <OrderCard
              key={order.orderId}
              title={order.skuName}
              status={<StatusTag tone={statusTone(order.status)}>{order.status}</StatusTag>}
              description={`订单 ${order.orderId} · ${order.cityCode}`}
              meta={`${order.quantity}${order.unit} · ${order.createdAt}`}
              priceText={<PriceText amount={order.totalAmount} currency={order.currency} />}
              style={customerCardStyle}
            >
              <Timeline
                items={[
                  { key: "created", title: "订单已创建", meta: order.createdAt },
                  { key: "payment", title: "支付状态", description: order.status },
                ]}
              />
            </OrderCard>
          ))}
        </div>
      )}
      <UatDebugPanel
        facts={[
          { label: "city_code", value: cityCode },
          { label: "stored orderIds", value: orderIds },
          { label: "order detail response", value: ordersState.status === "success" ? ordersState.data : ordersState },
          { label: "workflow state", value: binding.state },
          { label: "availableActions", value: binding.availableActions },
          { label: "disabledReason", value: binding.disabledReasons },
        ]}
      />
    </RuntimeThemeSurface>
  );
}

function ProfilePage({ cityCode }: { cityCode: CityCode }) {
  const binding = createCustomerWorkflowBinding({ route: "profile", cityCode });

  return (
    <RuntimeThemeSurface binding={binding}>
      <Card title="我的账户" actions={<StatusTag tone="warning">待开放</StatusTag>} style={customerCardStyle}>
        <HelperText>本轮先完成下单验收。账户资料、常用地址和登录设置不会展示示例数据。</HelperText>
      </Card>
      <Card title="资料能力" actions={<StatusTag tone="muted">暂不可用</StatusTag>} style={customerCardStyle}>
        <Timeline
          items={[
            { key: "profile", title: "个人资料", description: "头像、昵称、手机号暂不展示" },
            { key: "address", title: "常用地址", description: "地址新增、编辑、选择暂不展示" },
            { key: "security", title: "账号设置", description: "登录态与账号设置暂不展示" },
          ]}
        />
      </Card>
      <UatDebugPanel
        facts={[
          { label: "city_code", value: cityCode },
          { label: "customerId", value: CUSTOMER_ID },
          { label: "workflow state", value: binding.state },
          { label: "availableActions", value: binding.availableActions },
          { label: "disabledReason", value: binding.disabledReasons },
          { label: "notWiredPolicy", value: binding.notWiredPolicy },
        ]}
      />
    </RuntimeThemeSurface>
  );
}

export function App() {
  const route = useMemo(currentRoute, []);
  const [cityCode, setCityCode] = useState<CityCode>(readCity);
  const [catalogState, setCatalogState] = useState<Loadable<CatalogSnapshot>>({ status: "pending" });
  const [orderIds, setOrderIds] = useState<string[]>(readOrderIds);
  const api = useMemo(() => createCustomerApi(cityCode), [cityCode]);

  function updateCity(nextCity: CityCode) {
    setCityCode(nextCity);
    window.localStorage.setItem(CITY_STORAGE_KEY, nextCity);
  }

  function loadCatalog() {
    setCatalogState({ status: "loading" });
    api
      .getCatalog()
      .then((response) => setCatalogState({ status: "success", data: response.catalog }))
      .catch((error: unknown) => {
        setCatalogState({ status: "error", error: error instanceof Error ? error.message : String(error) });
      });
  }

  useEffect(loadCatalog, [api]);

  const content: Record<CustomerRoute, ReactNode> = {
    home: <HomePage cityCode={cityCode} catalogState={catalogState} onCityChange={updateCity} onRetryCatalog={loadCatalog} />,
    services: <ServicesPage cityCode={cityCode} catalogState={catalogState} onRetryCatalog={loadCatalog} />,
    createOrder: (
      <CreateOrderPage
        api={api}
        catalogState={catalogState}
        cityCode={cityCode}
        onOrderCreated={(orderId) => setOrderIds(rememberOrder(orderId))}
        onRetryCatalog={loadCatalog}
      />
    ),
    orders: <OrdersPage api={api} cityCode={cityCode} orderIds={orderIds} />,
    profile: <ProfilePage cityCode={cityCode} />,
  };

  return (
    <AppFrame route={route} cityCode={cityCode}>
      {content[route]}
    </AppFrame>
  );
}
