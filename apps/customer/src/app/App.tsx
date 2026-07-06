import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { CatalogSnapshot, CityCode, Order, PaymentOrder, PriceQuote, ServiceSku } from "@xlb/types";
import { XLB_HEADERS } from "@xlb/types";
import {
  Badge,
  BottomNav,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  MobileShell,
  OrderCard,
  SearchBar,
  Select,
  ServiceCard,
  Skeleton,
  Tabs,
  TopBar,
} from "@xlb/ui";
import { createApiClient, customerApi } from "../../../../packages/api-client/src/index";

type CustomerRoute = "home" | "services" | "createOrder" | "orders" | "profile";
type Loadable<T> =
  | { status: "idle" | "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: string };

const DEFAULT_CITY: CityCode = "hangzhou";
const CUSTOMER_ID = "customer-demo-001";
const CITY_STORAGE_KEY = "xlb.customer.cityCode";
const ORDER_HISTORY_KEY = "xlb.customer.orderIds";
const cityOptions: CityCode[] = ["hangzhou", "shanghai", "beijing"];

const routeConfig: Record<CustomerRoute, { label: string; href: string; title: string }> = {
  home: { label: "首页", href: "/customer/", title: "安心到家维修" },
  services: { label: "服务", href: "/customer/services", title: "选择服务项目" },
  createOrder: { label: "下单", href: "/customer/order/create", title: "填写上门信息" },
  orders: { label: "订单", href: "/customer/orders", title: "服务进度" },
  profile: { label: "我的", href: "/customer/profile", title: "账户入口" },
};

const shellStyle = {
  "--xlb-role-accent": "#B85F2A",
  background: "#FFFAF0",
  minHeight: "100vh",
} as CSSProperties;

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

function flattenSkus(
  catalog?: CatalogSnapshot,
): Array<ServiceSku & { categoryId: string; categoryName: string; itemName: string }> {
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

function formatMoney(amount: number, currency = "CNY") {
  return `${currency} ${amount.toFixed(2)}`;
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
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh" }}>
        <MobileShell
          topBar={<TopBar title={routeConfig[route].title} actions={<Badge tone="success">{cityCode}</Badge>} />}
          bottomNav={
            <BottomNav
              items={(Object.keys(routeConfig) as CustomerRoute[]).map((key) => ({
                key,
                label: routeConfig[key].label,
                active: key === route,
                href: routeConfig[key].href,
              }))}
            />
          }
        >
          <div style={{ display: "grid", gap: 16 }}>{children}</div>
        </MobileShell>
      </div>
    </div>
  );
}

function HelperText({ children }: { children: ReactNode }) {
  return <p style={{ color: "#4b5563", fontSize: 13, lineHeight: "20px", margin: 0 }}>{children}</p>;
}

function CitySelector({
  cityCode,
  onCityChange,
}: {
  cityCode: CityCode;
  onCityChange: (cityCode: CityCode) => void;
}) {
  return (
    <Card title="服务城市">
      <FormField label="当前城市" description="所有目录、报价、订单都会带 x-xlb-city-code 请求头。">
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

function CatalogState({
  catalogState,
  onRetry,
  children,
}: {
  catalogState: Loadable<CatalogSnapshot>;
  onRetry: () => void;
  children: (catalog: CatalogSnapshot) => ReactNode;
}) {
  if (catalogState.status === "loading") {
    return (
      <Card title="服务目录加载中">
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton style={{ height: 18, width: "70%" }} />
          <Skeleton style={{ height: 18, width: "86%" }} />
          <Skeleton style={{ height: 88 }} />
        </div>
      </Card>
    );
  }

  if (catalogState.status === "error") {
    return (
      <ErrorState
        title="服务目录暂时不可用"
        description={catalogState.error}
        action={<Button onClick={onRetry}>重试</Button>}
      />
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

  return (
    <>
      <Card>
        <p style={{ color: "#B85F2A", fontSize: 13, fontWeight: 700, margin: 0 }}>{cityCode} · 同源 API</p>
        <h1 style={{ color: "#2B2118", fontSize: 28, lineHeight: "36px", margin: "8px 0" }}>安心到家维修</h1>
        <HelperText>服务目录、报价与下单都读取当前后端；未开放的账户资料和全量订单列表会明确标记为 not-wired。</HelperText>
      </Card>
      <CitySelector cityCode={cityCode} onCityChange={onCityChange} />
      <SearchBar value={query} onChange={setQuery} placeholder="搜索真实服务目录" />
      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog}>
        {(catalog) => {
          const services = flattenSkus(catalog)
            .filter((sku) => {
              const text = `${sku.categoryName} ${sku.itemName} ${sku.name}`.toLowerCase();
              return text.includes(query.trim().toLowerCase());
            })
            .slice(0, 4);

          if (services.length === 0) {
            return <EmptyState title="没有匹配服务" description="请更换关键词或切换城市后重试。" />;
          }

          return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {services.map((sku) => (
                <ServiceCard
                  key={sku.skuId}
                  title={sku.name}
                  subtitle={`${sku.categoryName} · ${sku.itemName}`}
                  status={<Badge tone="success">真实目录</Badge>}
                  actionLabel="去下单"
                  onClick={() => {
                    window.location.href = `/customer/order/create?skuId=${encodeURIComponent(sku.skuId)}`;
                  }}
                />
              ))}
            </div>
          );
        }}
      </CatalogState>
    </>
  );
}

function ServicesPage({
  catalogState,
  onRetryCatalog,
}: {
  catalogState: Loadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  return (
    <>
      <SearchBar value={query} onChange={setQuery} placeholder="搜索服务、类目或 SKU" />
      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog}>
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
              {services.length === 0 ? (
                <EmptyState title="没有匹配服务" description="当前结果来自真实目录 API，可以调整分类或搜索词。" />
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {services.slice(0, 24).map((sku) => (
                    <ServiceCard
                      key={sku.skuId}
                      title={sku.name}
                      subtitle={`${sku.categoryName} · ${sku.itemName} · ${sku.unit}`}
                      status={<Badge tone="success">可下单</Badge>}
                      actionLabel="选择"
                      onClick={() => {
                        window.location.href = `/customer/order/create?skuId=${encodeURIComponent(sku.skuId)}`;
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          );
        }}
      </CatalogState>
    </>
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
  const [quoteState, setQuoteState] = useState<Loadable<PriceQuote>>({ status: "idle" });
  const [submitState, setSubmitState] = useState<
    | { status: "idle" | "submitting" }
    | { status: "success"; order: Order; paymentOrder: PaymentOrder; verifiedOrder: Order }
    | { status: "error"; error: string }
  >({ status: "idle" });

  const skus = flattenSkus(catalogState.data);
  const selectedSku = skus.find((sku) => sku.skuId === selectedSkuId);

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
      setQuoteState({ status: "idle" });
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
    <>
      <CatalogState catalogState={catalogState} onRetry={onRetryCatalog}>
        {() => (
          <Card title="真实下单">
            <div style={{ display: "grid", gap: 12 }}>
              <FormField label="服务项目" description="选项来自真实 catalog API。">
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
              <FormField label="数量">
                <Input
                  min={1}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  type="number"
                  value={quantity}
                />
              </FormField>
              {selectedSku && (
                <HelperText>
                  已选：{selectedSku.name} · {selectedSku.unit} · {selectedSku.skuId}
                </HelperText>
              )}
            </div>
          </Card>
        )}
      </CatalogState>

      {quoteState.status === "loading" && <LoadingState title="正在读取报价" description="价格来自 /api/pricing/quote。" />}
      {quoteState.status === "error" && (
        <ErrorState title="报价不可用" description={quoteState.error} action={<Button onClick={() => selectedSkuId && loadQuote(selectedSkuId)}>重试</Button>} />
      )}
      {quoteState.status === "success" && (
        <Card
          title="后端报价"
          actions={<Badge tone="success">{quoteState.data.priceType}</Badge>}
        >
          <HelperText>
            {quoteState.data.priceText} · 单价 {formatMoney(quoteState.data.basePrice, quoteState.data.currency)} · 规则 {quoteState.data.priceRuleId}
          </HelperText>
        </Card>
      )}

      <Button
        disabled={submitState.status === "submitting" || !selectedSkuId || quoteState.status !== "success"}
        onClick={submitOrder}
        style={{ minHeight: 44, width: "100%" }}
        variant="primary"
      >
        {submitState.status === "submitting" ? "提交中" : "提交真实订单"}
      </Button>

      {submitState.status === "error" && <ErrorState title="下单失败" description={submitState.error} />}
      {submitState.status === "success" && (
        <OrderCard
          title={`订单 ${submitState.order.orderId}`}
          status={<Badge tone={submitState.verifiedOrder.status === "paid" ? "success" : "warning"}>{submitState.verifiedOrder.status}</Badge>}
          description={`${submitState.order.skuName} · ${submitState.order.quantity}${submitState.order.unit} · ${cityCode}`}
          meta={`支付单 ${submitState.paymentOrder.paymentOrderId} · ${submitState.paymentOrder.status}`}
          priceText={formatMoney(submitState.order.totalAmount, submitState.order.currency)}
          actions={<Button onClick={() => { window.location.href = "/customer/orders"; }}>查看订单</Button>}
        >
          <HelperText>订单、支付单和复查状态均来自后端 API。支付完成回调本阶段不在 C 端页面触发。</HelperText>
        </OrderCard>
      )}
    </>
  );
}

function OrdersPage({
  api,
  orderIds,
}: {
  api: ReturnType<typeof createCustomerApi>;
  orderIds: string[];
}) {
  const [ordersState, setOrdersState] = useState<Loadable<Order[]>>({ status: "idle" });

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
    <>
      <Card title="订单列表 API 状态">
        <HelperText>后端当前提供订单创建与详情查询，尚未提供按用户查询订单列表。本页只复查本浏览器中真实创建过的订单 ID。</HelperText>
      </Card>
      {ordersState.status === "loading" && <LoadingState title="正在读取订单" description="逐个调用 /api/orders/:orderId。" />}
      {ordersState.status === "error" && (
        <ErrorState title="订单读取失败" description={ordersState.error} action={<Button onClick={loadOrders}>重试</Button>} />
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
              status={<Badge tone={order.status === "paid" ? "success" : "warning"}>{order.status}</Badge>}
              description={`订单 ${order.orderId} · ${order.cityCode}`}
              meta={`${order.quantity}${order.unit} · ${order.createdAt}`}
              priceText={formatMoney(order.totalAmount, order.currency)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProfilePage({ cityCode }: { cityCode: CityCode }) {
  return (
    <>
      <Card title="我的">
        <HelperText>当前本地测试身份：{CUSTOMER_ID}。该身份用于真实下单请求体和请求头，但后端尚未提供 C 端资料 API。</HelperText>
      </Card>
      <Card title="账户资料">
        <HelperText>头像、昵称、手机号、地址簿和安全设置 API 尚未开放，本页保持 not-wired，不展示本地样例资料。</HelperText>
      </Card>
      <Card title="请求上下文">
        <HelperText>appType=customer · role=customer · cityCode={cityCode} · userId={CUSTOMER_ID}</HelperText>
      </Card>
    </>
  );
}

export function App() {
  const route = useMemo(currentRoute, []);
  const [cityCode, setCityCode] = useState<CityCode>(readCity);
  const [catalogState, setCatalogState] = useState<Loadable<CatalogSnapshot>>({ status: "idle" });
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
    services: <ServicesPage catalogState={catalogState} onRetryCatalog={loadCatalog} />,
    createOrder: (
      <CreateOrderPage
        api={api}
        catalogState={catalogState}
        cityCode={cityCode}
        onOrderCreated={(orderId) => setOrderIds(rememberOrder(orderId))}
        onRetryCatalog={loadCatalog}
      />
    ),
    orders: <OrdersPage api={api} orderIds={orderIds} />,
    profile: <ProfilePage cityCode={cityCode} />,
  };

  return <AppFrame route={route} cityCode={cityCode}>{content[route]}</AppFrame>;
}
