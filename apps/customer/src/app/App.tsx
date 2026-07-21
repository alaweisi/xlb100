import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { Button, ErrorState, LoadingState } from "@xlb/ui";
import type { CustomerOrderCreatePageProps } from "../pages/CustomerOrderCreatePage";
import type { CustomerOrdersPageProps } from "../pages/CustomerOrdersPage";
import type { CustomerCouponsPageProps } from "../pages/CustomerCouponsPage";
import type { CustomerSupportApi } from "../pages/CustomerSupportPage";
import {
  appendOrderId,
  clearStoredSession,
  createCustomerApiClient,
  type CustomerAppFailure,
  type CustomerLoadable,
  CustomerRouteShell,
  detectCustomerRoute,
  describeCustomerAppError,
  loginCustomer,
  readCustomerCityCode,
  readOrderIds,
  readStoredSession,
  type CustomerSession,
  writeCustomerCityCode,
} from "../pages/customerPageShell";

const CustomerHomePage = lazy(() => import("../pages/CustomerHomePage").then((module) => ({ default: module.CustomerHomePage })));
const CustomerOrderCreatePage = lazy(() => import("../pages/CustomerOrderCreatePage").then((module) => ({ default: module.CustomerOrderCreatePage })));
const CustomerOrdersPage = lazy(() => import("../pages/CustomerOrdersPage").then((module) => ({ default: module.CustomerOrdersPage })));
const CustomerAftersalePage = lazy(() => import("../pages/CustomerAftersalePage").then((module) => ({ default: module.CustomerAftersalePage })));
const CustomerProfilePage = lazy(() => import("../pages/CustomerProfilePage").then((module) => ({ default: module.CustomerProfilePage })));
const CustomerServicesPage = lazy(() => import("../pages/CustomerServicesPage").then((module) => ({ default: module.CustomerServicesPage })));
const CustomerSupportPage = lazy(() => import("../pages/CustomerSupportPage").then((module) => ({ default: module.CustomerSupportPage })));
const CustomerNotificationsPage = lazy(() => import("../pages/CustomerNotificationsPage").then((module) => ({ default: module.CustomerNotificationsPage })));
const CustomerCouponsPage = lazy(() => import("../pages/CustomerCouponsPage").then((module) => ({ default: module.CustomerCouponsPage })));

export type CustomerAuthState =
  | { status: "authenticating" }
  | { status: "authenticated"; session: CustomerSession }
  | { status: "error"; failure: CustomerAppFailure };

export function CustomerAuthGate({
  state,
  onRetry,
}: {
  state: Exclude<CustomerAuthState, { status: "authenticated" }>;
  onRetry: () => void;
}) {
  return (
    <CustomerRouteShell currentRoute="home" showBottomNav={false}>
      <section aria-labelledby="customer-auth-title" className="customer-auth-gate">
        <div className="customer-auth-brand">
          <p aria-hidden="true" className="customer-auth-monogram">喜</p>
          <div>
            <h1 id="customer-auth-title">喜乐帮</h1>
            <p>安心到家，服务就在身边</p>
          </div>
        </div>
        {state.status === "authenticating" ? (
          <LoadingState
            description="正在安全确认顾客身份，请稍候。"
            productRole="customer"
            title="正在连接喜乐帮"
          />
        ) : (
          <ErrorState
            action={(
              <Button onClick={onRetry} productRole="customer" variant="primary">
                {state.failure.retryLabel}
              </Button>
            )}
            description={state.failure.description}
            productRole="customer"
            title={state.failure.title}
          />
        )}
        <p className="customer-auth-assurance">身份信息仅用于当前顾客端服务与城市范围校验。</p>
      </section>
    </CustomerRouteShell>
  );
}

export function App() {
  const initialCityCode = useMemo(() => readCustomerCityCode(), []);
  const [cityCode, setCityCode] = useState<CityCode>(initialCityCode);
  const [catalogState, setCatalogState] = useState<CustomerLoadable<CatalogSnapshot>>({ status: "loading" });
  const [orderIds, setOrderIds] = useState<string[]>(() => {
    const storedOrderIds = readOrderIds();
    const orderIdFromUrl = typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("orderId")?.trim() ?? "";
    return orderIdFromUrl
      ? [orderIdFromUrl, ...storedOrderIds.filter((orderId) => orderId !== orderIdFromUrl)]
      : storedOrderIds;
  });
  const [authState, setAuthState] = useState<CustomerAuthState>({ status: "authenticating" });
  const [authAttempt, setAuthAttempt] = useState(0);
  const currentRoute = useMemo(() => detectCustomerRoute(), []);

  useEffect(() => {
    let cancelled = false;
    setAuthState({ status: "authenticating" });

    const authenticate = async () => {
      const storedSession = authAttempt === 0 ? readStoredSession() : null;
      if (storedSession) {
        if (!cancelled) setAuthState({ status: "authenticated", session: storedSession });
        return;
      }
      try {
        const session = await loginCustomer();
        if (!cancelled) setAuthState({ status: "authenticated", session });
      } catch (error) {
        if (!cancelled) setAuthState({ status: "error", failure: describeCustomerAppError(error) });
      }
    };

    void authenticate();
    return () => { cancelled = true; };
  }, [authAttempt]);

  const session = authState.status === "authenticated" ? authState.session : null;
  const api = useMemo(() => createCustomerApiClient(cityCode, session?.token), [cityCode, session?.token]);

  const setCityAndPersist = useCallback((next: CityCode) => {
    writeCustomerCityCode(next);
    setCityCode(next);
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!session?.token) {
      setCatalogState({ status: "loading" });
      return;
    }
    setCatalogState((previous) => previous.status === "success" && previous.data?.cityCode === cityCode
      ? { status: "loading", data: previous.data }
      : { status: "loading" });
    try {
      const result = await api.getCatalog();
      setCatalogState({ status: "success", data: result.catalog });
    } catch (error) {
      const failure = describeCustomerAppError(error);
      if (failure.kind === "expired" || failure.kind === "permission") {
        clearStoredSession();
        setAuthState({ status: "error", failure });
        return;
      }
      setCatalogState({ status: "error", error: failure.description });
    }
  }, [api, cityCode, session?.token]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleRetryCatalog = useCallback(() => { void loadCatalog(); }, [loadCatalog]);
  const handleRetryAuth = useCallback(() => {
    clearStoredSession();
    setCatalogState({ status: "loading" });
    setAuthAttempt((attempt) => attempt + 1);
  }, []);

  const handleOrderCreated = useCallback((orderId: string) => {
    setOrderIds(() => appendOrderId(orderId));
    setCityAndPersist(cityCode);
    const params = new URLSearchParams(window.location.search);
    params.set("orderId", orderId);
    window.history.replaceState({}, "", `/customer/orders?${params.toString()}`);
  }, [cityCode, setCityAndPersist]);

  if (authState.status !== "authenticated") {
    return <CustomerAuthGate onRetry={handleRetryAuth} state={authState} />;
  }

  const orderCreateApi: CustomerOrderCreatePageProps["api"] = {
    getPriceQuote: (skuId) => api.getPriceQuote(skuId),
    createOrder: (payload) => api.createOrder(payload),
    getOrder: (orderId) => api.getOrder(orderId),
    listCouponGrants: (query) => api.listCouponGrants(query),
    issueDiscountDecision: (payload) => api.issueDiscountDecision(payload),
  };
  const ordersApi: CustomerOrdersPageProps["api"] = {
    getOrder: (orderId) => api.getOrder(orderId),
    confirmService: (orderId) => api.confirmService(orderId),
    createPaymentOrder: (payload) => api.createPaymentOrder(payload),
    mockPaySuccess: (payload) => api.mockPaySuccess(payload),
    createRefundRequest: (payload) => api.createRefundRequest(payload),
    createOrderReview: (payload) => api.createOrderReview(payload),
    getOrderReview: (orderId) => api.getOrderReview(orderId),
    createReviewAppeal: (reviewId, payload) => api.createReviewAppeal(reviewId, payload),
    withdrawReviewAppeal: (reviewId, payload) => api.withdrawReviewAppeal(reviewId, payload),
  };

  let routeContent: ReactNode;
  if (currentRoute === "home") {
    routeContent = <CustomerHomePage catalogState={catalogState} cityCode={cityCode} onRetryCatalog={handleRetryCatalog} />;
  } else if (currentRoute === "services") {
    routeContent = <CustomerServicesPage catalogState={catalogState} cityCode={cityCode} onRetryCatalog={handleRetryCatalog} />;
  } else if (currentRoute === "createOrder") {
    routeContent = (
      <CustomerOrderCreatePage
        api={orderCreateApi}
        catalogState={catalogState}
        cityCode={cityCode}
        onOrderCreated={handleOrderCreated}
      />
    );
  } else if (currentRoute === "orders") {
    routeContent = <CustomerOrdersPage api={ordersApi} cityCode={cityCode} orderIds={orderIds} />;
  } else if (currentRoute === "aftersale") {
    routeContent = <CustomerAftersalePage api={api} orderIds={orderIds} />;
  } else if (currentRoute === "support") {
    const supportApi: CustomerSupportApi = {
      createTicket: (input) => api.createSupportTicket(input),
      listTickets: (filters) => api.listSupportTickets(filters),
      getTicket: (ticketId) => api.getSupportTicket(ticketId),
      addComment: (ticketId, input) => api.addSupportTicketComment(ticketId, input),
      reopenTicket: (ticketId, input) => api.reopenSupportTicket(ticketId, input),
      submitCsat: (ticketId, input) => api.submitSupportTicketCsat(ticketId, input),
      createConversation: (input) => api.createSupportConversation(input),
      listConversations: () => api.listSupportConversations(),
      getConversation: (conversationId) => api.getSupportConversation(conversationId),
      sendConversationMessage: (conversationId, input) => api.sendSupportMessage(conversationId, input),
    };
    routeContent = <CustomerSupportPage api={supportApi} />;
  } else if (currentRoute === "notifications") {
    routeContent = <CustomerNotificationsPage api={api} />;
  } else if (currentRoute === "coupons") {
    const couponsApi: CustomerCouponsPageProps["api"] = {
      listCouponGrants: (query) => api.listCouponGrants(query),
    };
    routeContent = (
      <CustomerCouponsPage
        api={couponsApi}
        onSelectForQuote={(couponGrantId) => {
          window.location.assign(`/customer/order/create?couponGrantId=${encodeURIComponent(couponGrantId)}`);
        }}
      />
    );
  } else {
    routeContent = <CustomerProfilePage api={api} cityCode={cityCode} />;
  }

  return (
    <CustomerRouteShell currentRoute={currentRoute}>
      <Suspense
        fallback={(
          <LoadingState
            description="正在准备当前页面，请稍候。"
            productRole="customer"
            title="正在加载服务"
          />
        )}
      >
        {routeContent}
      </Suspense>
    </CustomerRouteShell>
  );
}
