import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { CatalogSnapshot, CityCode, Order, PaymentOrder, PriceQuote, ServiceSku, WorkflowActionContract, WorkflowUiBinding } from "@xlb/types";
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
  Input,
  LoadingState,
  MobileShell,
  NotWiredState,
  OrderCard,
  PriceText,
  RuntimeThemeSurface,
  SearchBar,
  Select,
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

type CustomerRoute = "home" | "services" | "createOrder" | "orders" | "profile";
type Loadable<T> =
  | { status: "pending" | "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string };

type CatalogSku = ServiceSku & {
  categoryId: string;
  categoryName: string;
  itemName: string;
};

const DEFAULT_CITY: CityCode = "hangzhou";
const CUSTOMER_ID = "customer-demo-001";
const CITY_STORAGE_KEY = "xlb.customer.cityCode";
const ORDER_HISTORY_KEY = "xlb.customer.orderIds";
const cityOptions: CityCode[] = ["hangzhou", "shanghai", "beijing"];

const routeConfig: Record<CustomerRoute, { label: string; href: string; title: string; eyebrow: string; icon: string; prominent?: boolean }> = {
  home: { label: "首页", href: "/customer/", title: "安心到家维修", eyebrow: "上海 · 静安区", icon: "⌂" },
  services: { label: "服务", href: "/customer/services", title: "选择服务", eyebrow: "真实目录", icon: "⌕" },
  createOrder: { label: "新报修", href: "/customer/order/create", title: "填写上门信息", eyebrow: "新报修", icon: "+", prominent: true },
  orders: { label: "订单", href: "/customer/orders", title: "订单进度", eyebrow: "真实订单", icon: "▦" },
  profile: { label: "我的", href: "/customer/profile", title: "我的", eyebrow: "账户资料", icon: "♙" },
};

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

function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "cancelled" || status === "failed" || status === "closed") return "danger";
  if (status === "pending" || status === "pending_payment" || status === "draft") return "warning";
  return "muted";
}

function HelperText({ children }: { children: ReactNode }) {
  return <p style={quietText}>{children}</p>;
}

function PhoneStatusBar() {
  return (
    <div style={{ alignItems: "center", color: "#2B2118", display: "flex", fontSize: 12, fontWeight: 800, justifyContent: "space-between", lineHeight: "16px" }}>
      <span>9:41</span>
      <span>5G ▰</span>
    </div>
  );
}

function CustomerPageHeader({ route, cityCode }: { route: CustomerRoute; cityCode: CityCode }) {
  const config = routeConfig[route];
  return (
    <header style={{ display: "grid", gap: 10, padding: "20px 20px 8px" }}>
      <PhoneStatusBar />
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

function CustomerBindingFootnote({ binding }: { binding: Pick<WorkflowUiBinding, "workflowName" | "state" | "figmaBinding"> }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255, 250, 240, 0.62)",
        border: "1px solid rgba(234, 216, 189, 0.74)",
        borderRadius: 16,
        color: "#8a735b",
        display: "flex",
        fontSize: 11,
        gap: 8,
        justifyContent: "space-between",
        lineHeight: "16px",
        padding: "8px 10px",
      }}
    >
      <span style={{ fontWeight: 700 }}>{binding.state.label}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{binding.workflowName} · {binding.figmaBinding.kind}</span>
    </div>
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
  return (
    <div data-role="customer" style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh", padding: "28px 18px" }}>
        <div
          style={{
            background: "#FFFAF0",
            border: "10px solid #dec49e",
            borderRadius: 44,
            boxShadow: "0 24px 54px rgba(43, 33, 24, 0.22)",
            boxSizing: "border-box",
            minHeight: 844,
            overflow: "hidden",
          }}
        >
        <MobileShell
          topBar={<CustomerPageHeader cityCode={cityCode} route={route} />}
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
              style={{
                background: "rgba(255, 250, 240, 0.96)",
                borderTop: "1px solid rgba(222, 196, 158, 0.58)",
                boxShadow: "0 -10px 26px rgba(43, 33, 24, 0.07)",
                position: "sticky",
                bottom: 0,
                zIndex: 3,
              }}
            />
          }
          contentStyle={{ padding: "8px 20px 0" }}
          style={{ background: "#FFFAF0", minHeight: 824 }}
        >
          <div style={{ display: "grid", gap: 16, paddingBottom: 18 }}>{children}</div>
        </MobileShell>
        </div>
      </div>
    </div>
  );
}

function CitySelector({
  cityCode,
  onCityChange,
}: {
  cityCode: CityCode;
  onCityChange: (cityCode: CityCode) => void;
}) {
  return (
    <Card
      title="服务城市"
      actions={<StatusTag tone="primary">同源 API</StatusTag>}
      style={customerFlatCardStyle}
    >
      <FormField label="当前城市" description="目录、报价、下单都会携带 x-xlb-city-code">
        <Select value={cityCode} onChange={(event) => onCityChange(event.target.value as CityCode)}>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
      </FormField>
    </Card>
  );
}

function ServiceShortcutGrid({ services }: { services: CatalogSku[] }) {
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
      {services.slice(0, 8).map((sku) => {
        const selectAction = customerWorkflowActions.selectService(sku.skuId);
        return (
          <button
            key={sku.skuId}
            onClick={() => runWorkflowAction(selectAction, () => {
              window.location.href = `/customer/order/create?skuId=${encodeURIComponent(sku.skuId)}`;
            })}
            title={selectAction.disabledReasonCode ?? selectAction.actionId}
            type="button"
            style={{
              alignItems: "center",
              background: "rgba(255, 255, 255, 0.88)",
              border: "1px solid #ead8bd",
              borderRadius: 16,
              boxShadow: "0 6px 14px rgba(43, 33, 24, 0.08)",
              color: "#2B2118",
              cursor: "pointer",
              display: "grid",
              fontFamily: "inherit",
              gap: 6,
              justifyItems: "center",
              minHeight: 64,
              padding: "8px 6px",
            }}
          >
            <span aria-hidden="true" style={{ color: "#B85F2A", fontSize: 20, lineHeight: 1 }}>⌁</span>
            <span style={{ fontSize: 12, fontWeight: 700, lineHeight: "16px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sku.itemName}
            </span>
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
      <Card title="服务目录加载中" actions={<StatusTag tone="primary">loading</StatusTag>}>
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
      <Card title="服务目录暂时不可用" actions={<StatusTag tone="danger">API 错误</StatusTag>} style={{ ...customerCardStyle, borderColor: "#fca5a5" }}>
        <div style={{ display: "grid", gap: 12 }}>
          <HelperText>{catalogState.error}</HelperText>
          <ActionDock actions={[retryAction]} density="compact" onAction={() => onRetry()} showDisabledReason={false} />
        </div>
      </Card>
    );
  }

  if (catalogState.status !== "success") {
    return <LoadingState title="准备连接服务目录" description="正在等待真实 API 返回。" />;
  }

  if (catalogState.data.categories.length === 0) {
    return <EmptyState title="暂无可用服务" description="后端返回了真实空目录，本页不会补本地样例服务。" />;
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
  const binding = createCustomerWorkflowBinding({ route: "home", cityCode });
  const openServicesAction = customerWorkflowActions.openServices();
  const retryCatalogAction = customerWorkflowActions.retryCatalog();

  return (
    <RuntimeThemeSurface binding={binding}>
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="水槽漏水、空调清洗、门锁维修"
        leadingIcon="⌕"
        style={{ borderColor: "#ead8bd", borderRadius: 16, boxShadow: "0 6px 16px rgba(43, 33, 24, 0.08)", minHeight: 46 }}
      />

      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog} retryAction={retryCatalogAction}>
        {(catalog) => {
          const allServices = flattenSkus(catalog);
          const services = allServices
            .filter((sku) => {
              const text = `${sku.categoryName} ${sku.itemName} ${sku.name}`.toLowerCase();
              return text.includes(query.trim().toLowerCase());
            })
            .slice(0, 6);

          if (services.length === 0) {
            return <EmptyState title="没有匹配服务" description="请更换关键词或切换城市后重试。" />;
          }

          return (
            <div style={sectionGrid}>
              <ServiceShortcutGrid services={allServices} />
              <Card
                style={{
                  ...customerFlatCardStyle,
                  background: "linear-gradient(135deg, rgba(255, 250, 240, 0.9), rgba(255, 255, 255, 0.62))",
                  minHeight: 92,
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <StatusTag tone="warning" style={{ justifySelf: "start" }}>实时报价</StatusTag>
                  <strong style={{ color: "#2B2118", fontSize: 17, lineHeight: "24px" }}>服务价格以下单页报价为准</strong>
                  <span style={{ color: "#9a8266", fontSize: 12, lineHeight: "18px" }}>
                    catalog / pricing / order 均保持后端来源，不使用本地活动价。
                  </span>
                </div>
              </Card>
              <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
                <h2 style={{ color: "#2B2118", fontSize: 18, lineHeight: "24px", margin: 0 }}>推荐服务</h2>
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
                        subtitle={`${sku.categoryName} · ${sku.itemName}`}
                        status={<StatusTag tone="success">真实目录</StatusTag>}
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
      <CitySelector cityCode={cityCode} onCityChange={onCityChange} />
      <CustomerBindingFootnote binding={binding} />
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
  const [activeCategory, setActiveCategory] = useState("all");
  const binding = createCustomerWorkflowBinding({ route: "services", cityCode });
  const retryCatalogAction = customerWorkflowActions.retryCatalog();

  return (
    <RuntimeThemeSurface binding={binding}>
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="搜索服务、类目或 SKU"
        leadingIcon="⌕"
        style={{ borderColor: "#ead8bd", borderRadius: 16, boxShadow: "0 6px 16px rgba(43, 33, 24, 0.08)", minHeight: 46 }}
      />
      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog} retryAction={retryCatalogAction}>
        {(catalog) => {
          const tabs = [
            { key: "all", label: "全部" },
            ...catalog.categories.slice(0, 8).map((category) => ({
              key: category.categoryId,
              label: category.name,
            })),
          ];
          const services = flattenSkus(catalog).filter((sku) => {
            const matchesCategory = activeCategory === "all" || sku.categoryId === activeCategory;
            const text = `${sku.categoryName} ${sku.itemName} ${sku.name}`.toLowerCase();
            return matchesCategory && text.includes(query.trim().toLowerCase());
          });

          return (
            <>
              <Tabs activeKey={activeCategory} onChange={setActiveCategory} items={tabs} density="compact" />
              <Card title="服务目录" actions={<StatusTag tone="success">{services.length} 项</StatusTag>} style={customerFlatCardStyle}>
                <HelperText>当前结果来自真实 catalog API。价格会在下单页读取真实报价。</HelperText>
              </Card>
              {services.length === 0 ? (
                <EmptyState title="没有匹配服务" description="当前结果来自真实目录 API，可以调整分类或搜索词。" />
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {services.slice(0, 24).map((sku) => (
                    (() => {
                      const selectAction = customerWorkflowActions.selectService(sku.skuId);
                      return (
                        <ServiceCard
                          key={sku.skuId}
                          title={sku.name}
                          subtitle={`${sku.categoryName} · ${sku.itemName} · ${sku.unit}`}
                          status={<StatusTag tone="success">可下单</StatusTag>}
                          priceText="报价下单页读取"
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
      <CustomerBindingFootnote binding={binding} />
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
      setSubmitState({ status: "error", error: "请选择真实服务 SKU。" });
      return;
    }

    setSubmitState({ status: "submitting" });
    try {
      const orderResponse = await api.createOrder({
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
          <Card title="服务项目" actions={<StatusTag tone="primary">{cityCode}</StatusTag>} style={customerCardStyle}>
            <div style={{ display: "grid", gap: 12 }}>
              <FormField label="项目" description="选项来自真实 catalog API">
                <Select value={selectedSkuId} onChange={(event) => setSelectedSkuId(event.target.value)}>
                  <option value="" disabled>
                    请选择服务
                  </option>
                  {skus.map((sku) => (
                    <option key={sku.skuId} value={sku.skuId}>
                      {sku.categoryName} / {sku.itemName} / {sku.name}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="数量" description="按真实 SKU 计价单位提交">
                <Input
                  min={1}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  type="number"
                  value={quantity}
                />
              </FormField>
              {selectedSku && (
                <ServiceCard
                  title={selectedSku.name}
                  subtitle={`${selectedSku.categoryName} · ${selectedSku.itemName} · ${selectedSku.unit}`}
                  status={<StatusTag tone="success">已选择</StatusTag>}
                  style={{ ...customerFlatCardStyle, minHeight: 96 }}
                />
              )}
            </div>
          </Card>
        )}
      </CatalogState>

      {quoteState.status === "loading" && <LoadingState title="正在读取报价" description="价格来自 /api/pricing/quote。" />}
      {quoteState.status === "error" && (
        <ErrorState
          title="报价不可用"
          description={quoteState.error}
          action={<ActionDock actions={[retryQuoteAction]} density="compact" onAction={() => selectedSkuId && loadQuote(selectedSkuId)} />}
        />
      )}
      {quoteState.status === "success" && (
        <CustomerQuoteCard
          price={<PriceText amount={quoteState.data.basePrice} currency={quoteState.data.currency} style={{ fontSize: 24, lineHeight: "30px" }} />}
          status={<StatusTag tone="success">{quoteState.data.priceType}</StatusTag>}
          meta={`${quoteState.data.priceText} · 规则 ${quoteState.data.priceRuleId}`}
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
            { key: "catalog", title: "服务目录", description: "从真实 catalog API 读取" },
            { key: "quote", title: "报价", description: quoteState.status === "success" ? "已读取真实报价" : "等待报价 API 返回" },
            { key: "order", title: "订单", description: submitState.status === "success" ? "后端已创建订单" : "提交后创建真实订单" },
            { key: "payment", title: "支付单", description: submitState.status === "success" ? "后端已创建支付单，支付回调未在本页触发" : "订单创建后生成" },
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

      {submitState.status === "error" && <ErrorState title="下单失败" description={submitState.error} />}
      {submitState.status === "success" && (
        <OrderCard
          title={`订单 ${submitState.order.orderId}`}
          status={<StatusTag tone={statusTone(submitState.verifiedOrder.status)}>{submitState.verifiedOrder.status}</StatusTag>}
          description={`${submitState.order.skuName} · ${submitState.order.quantity}${submitState.order.unit} · ${cityCode}`}
          meta={`支付单 ${submitState.paymentOrder.paymentOrderId} · ${submitState.paymentOrder.status}`}
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
          <HelperText>订单、支付单和复查状态均来自后端 API。支付完成回调本阶段不在 C 端页面触发。</HelperText>
        </OrderCard>
      )}
      <CustomerBindingFootnote binding={binding} />
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
      <Card title="订单列表 API 状态" actions={<StatusTag tone="warning">未接线</StatusTag>} style={customerFlatCardStyle}>
        <HelperText>后端当前提供订单创建与详情查询，尚未提供按用户查询订单列表。本页只复查本浏览器中真实创建过的订单 ID。</HelperText>
      </Card>
      {ordersState.status === "loading" && <LoadingState title="正在读取订单" description="逐个调用 /api/orders/:orderId。" />}
      {ordersState.status === "error" && (
        <ErrorState
          title="订单读取失败"
          description={ordersState.error}
          action={<ActionDock actions={[retryOrderDetailsAction]} density="compact" onAction={() => loadOrders()} />}
        />
      )}
      {ordersState.status === "success" && ordersState.data.length === 0 && (
        <EmptyState title="暂无本地订单记录" description="完成一次真实下单后，这里会用订单详情 API 复查展示。" />
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
      <CustomerBindingFootnote binding={binding} />
    </RuntimeThemeSurface>
  );
}

function ProfilePage({ cityCode }: { cityCode: CityCode }) {
  const binding = createCustomerWorkflowBinding({ route: "profile", cityCode });

  return (
    <RuntimeThemeSurface binding={binding}>
      <Card title="我的账户" actions={<StatusTag tone="warning">未接线</StatusTag>} style={customerCardStyle}>
        <HelperText>当前本地测试身份：{CUSTOMER_ID}。该身份用于真实下单请求体和请求头，但后端尚未提供 C 端资料 API。</HelperText>
      </Card>
      <Card title="账户资料" actions={<StatusTag tone="muted">暂不可用</StatusTag>} style={customerCardStyle}>
        <Timeline
          items={[
            { key: "profile", title: "资料 API", description: "头像、昵称、手机号尚未开放" },
            { key: "address", title: "地址簿 API", description: "地址新增、编辑、选择尚未开放" },
            { key: "security", title: "安全设置 API", description: "登录态与账号设置尚未开放" },
          ]}
        />
      </Card>
      <NotWiredState
        capability="账户资料与地址簿"
        description={`当前请求上下文：appType=customer · role=customer · cityCode=${cityCode} · userId=${CUSTOMER_ID}`}
        action={<ActionDock actions={binding.availableActions} density="compact" />}
      />
      <CustomerBindingFootnote binding={binding} />
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
