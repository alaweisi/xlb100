import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { LoadingState } from "@xlb/ui";
import type { CustomerOrderCreatePageProps } from "../pages/CustomerOrderCreatePage";
import type { CustomerOrdersPageProps } from "../pages/CustomerOrdersPage";
import type { CustomerCouponsPageProps } from "../pages/CustomerCouponsPage";
import type { CustomerSupportApi } from "../pages/CustomerSupportPage";
import { toCustomerError } from "../adapters/customerError";
import {
  clearCustomerSession,
  logoutCustomer,
  readStoredCustomerSession,
  type CustomerSession,
} from "../features/auth/customerAuth";
import {
  appendOrderId,
  createCustomerApiClient,
  CustomerLoadable,
  CustomerRouteShell,
  detectCustomerRoute,
  readCustomerCityCode,
  readOrderIds,
  writeCustomerCityCode,
} from "../pages/customerPageShell";
import { assignCustomerDeepLink, replaceCustomerDeepLink } from "../routes/customerDeepLinks";

const CustomerHomePage = lazy(() => import("../pages/CustomerHomePage").then((module) => ({ default: module.CustomerHomePage })));
const CustomerOrderCreatePage = lazy(() => import("../pages/CustomerOrderCreatePage").then((module) => ({ default: module.CustomerOrderCreatePage })));
const CustomerOrdersPage = lazy(() => import("../pages/CustomerOrdersPage").then((module) => ({ default: module.CustomerOrdersPage })));
const CustomerAftersalePage = lazy(() => import("../pages/CustomerAftersalePage").then((module) => ({ default: module.CustomerAftersalePage })));
const CustomerProfilePage = lazy(() => import("../pages/CustomerProfilePage").then((module) => ({ default: module.CustomerProfilePage })));
const CustomerServicesPage = lazy(() => import("../pages/CustomerServicesPage").then((module) => ({ default: module.CustomerServicesPage })));
const CustomerSupportPage = lazy(() => import("../pages/CustomerSupportPage").then((module) => ({ default: module.CustomerSupportPage })));
const CustomerNotificationsPage = lazy(() => import("../pages/CustomerNotificationsPage").then((module) => ({ default: module.CustomerNotificationsPage })));
const CustomerCouponsPage = lazy(() => import("../pages/CustomerCouponsPage").then((module) => ({ default: module.CustomerCouponsPage })));
const CustomerLoginPage = lazy(() => import("../pages/CustomerLoginPage").then((module) => ({ default: module.CustomerLoginPage })));

export function App() {
  const initialCityCode = useMemo(() => readCustomerCityCode(), []);
  const [cityCode, setCityCode] = useState<CityCode>(initialCityCode);
  const [catalogState, setCatalogState] = useState<CustomerLoadable<CatalogSnapshot>>({ status: "loading" });
  const [orderIds, setOrderIds] = useState<string[]>(() => {
    const storedOrderIds = readOrderIds();
    const orderIdFromUrl =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("orderId")?.trim() ?? "";
    return orderIdFromUrl
      ? [orderIdFromUrl, ...storedOrderIds.filter((orderId) => orderId !== orderIdFromUrl)]
      : storedOrderIds;
  });
  const [session, setSession] = useState<CustomerSession | null>(() => readStoredCustomerSession());
  const [sessionEndReason, setSessionEndReason] = useState<"expired" | undefined>();
  const currentRoute = useMemo(() => detectCustomerRoute(), []);

  const endSession = useCallback((reason?: "expired") => {
    clearCustomerSession();
    setSession(null);
    setSessionEndReason(reason);
    setOrderIds([]);
    setCatalogState({ status: "loading" });
  }, []);

  const handleUnauthorized = useCallback(() => endSession("expired"), [endSession]);
  const handleLogin = useCallback((nextSession: CustomerSession) => {
    setSessionEndReason(undefined);
    setSession(nextSession);
    setOrderIds(readOrderIds());
  }, []);
  const handleLogout = useCallback(() => {
    const currentSession = session;
    endSession();
    if (currentSession) void logoutCustomer(currentSession).catch(() => undefined);
  }, [endSession, session]);

  const api = useMemo(
    () => createCustomerApiClient(cityCode, session?.token, handleUnauthorized),
    [cityCode, handleUnauthorized, session?.token],
  );
  const setCityAndPersist = useCallback((next: CityCode) => {
    writeCustomerCityCode(next);
    setCityCode(next);
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!session?.token) {
      setCatalogState({ status: "loading" });
      return;
    }
    setCatalogState((previous) =>
      previous.status === "success" && previous.data?.cityCode === cityCode
        ? { status: "loading", data: previous.data }
        : { status: "loading" },
    );
    try {
      const result = await api.getCatalog();
      setCatalogState({ status: "success", data: result.catalog });
    } catch (error) {
      setCatalogState({
        status: "error",
        error: toCustomerError(error, "服务目录加载失败").description,
      });
    }
  }, [api, cityCode, session?.token]);

  useEffect(() => {
    // Notifications load their own scoped data and do not consume the service
    // catalog. Avoid leaving an unrelated catalog request in flight when this
    // route reloads or closes (and avoid an unnecessary production request).
    if (currentRoute === "notifications") return;
    void loadCatalog();
  }, [currentRoute, loadCatalog]);

  const handleRetryCatalog = useCallback(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleOrderCreated = useCallback(
    (orderId: string) => {
      setOrderIds(() => appendOrderId(orderId));
      setCityAndPersist(cityCode);
      replaceCustomerDeepLink("orders", { cityCode, orderId });
    },
    [cityCode, setCityAndPersist],
  );

  const orderCreateApi = useMemo<CustomerOrderCreatePageProps["api"]>(() => ({
    getPriceQuote: (skuId) => api.getPriceQuote(skuId),
    createOrder: (payload) => api.createOrder(payload),
    getOrder: (orderId) => api.getOrder(orderId),
    listCouponGrants: (query) => api.listCouponGrants(query),
    issueDiscountDecision: (payload) => api.issueDiscountDecision(payload),
    listAddresses: () => api.listAddresses(),
  }), [api]);

  const ordersApi = useMemo<CustomerOrdersPageProps["api"]>(() => ({
    listOrders: (query) => api.listOrders(query),
    getOrder: (orderId) => api.getOrder(orderId),
    confirmService: (orderId) => api.confirmService(orderId),
    createPaymentOrder: (payload) => api.createPaymentOrder(payload),
    createRefundRequest: (payload) => api.createRefundRequest(payload),
    createOrderReview: (payload) => api.createOrderReview(payload),
    getOrderReview: (orderId) => api.getOrderReview(orderId),
    createReviewAppeal: (reviewId, payload) => api.createReviewAppeal(reviewId, payload),
    withdrawReviewAppeal: (reviewId, payload) => api.withdrawReviewAppeal(reviewId, payload),
  }), [api]);

  if (!session) {
    return <CustomerLoginPage reason={sessionEndReason} onLogin={handleLogin} />;
  }

  let routeContent: ReactNode;
  if (currentRoute === "home") {
    routeContent = <CustomerHomePage cityCode={cityCode} catalogState={catalogState} onRetryCatalog={handleRetryCatalog} />;
  } else if (currentRoute === "services") {
    routeContent = <CustomerServicesPage cityCode={cityCode} catalogState={catalogState} onRetryCatalog={handleRetryCatalog} />;
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
    routeContent = <CustomerOrdersPage api={ordersApi} cityCode={cityCode} />;
  } else if (currentRoute === "aftersale") {
    routeContent = <CustomerAftersalePage api={api} cityCode={cityCode} orderIds={orderIds} />;
  } else if (currentRoute === "support") {
    const supportApi: CustomerSupportApi = {
      createTicket: (input) => api.createSupportTicket(input),
      listTickets: (filters) => api.listSupportTickets(filters),
      getTicket: (ticketId) => api.getSupportTicket(ticketId),
      addComment: (ticketId, input) => api.addSupportTicketComment(ticketId, input),
      reopenTicket: (ticketId, input) => api.reopenSupportTicket(ticketId, input),
      submitCsat: (ticketId,input) => api.submitSupportTicketCsat(ticketId,input),
      createConversation: (input) => api.createSupportConversation(input),
      listConversations: () => api.listSupportConversations(),
      getConversation: (conversationId) => api.getSupportConversation(conversationId),
      sendConversationMessage: (conversationId, input) => api.sendSupportMessage(conversationId, input),
    };
    routeContent = <CustomerSupportPage api={supportApi} />;
  } else if (currentRoute === "notifications") {
    routeContent = <CustomerNotificationsPage api={api} cityCode={cityCode} />;
  } else if (currentRoute === "coupons") {
    const couponsApi: CustomerCouponsPageProps["api"] = {
      listCouponGrants: (query) => api.listCouponGrants(query),
    };
    routeContent = (
      <CustomerCouponsPage
        api={couponsApi}
        cityCode={cityCode}
        onSelectForQuote={(couponGrantId) => {
          assignCustomerDeepLink("createOrder", { cityCode, couponGrantId });
        }}
      />
    );
  } else {
    routeContent = <CustomerProfilePage api={api} cityCode={cityCode} onLogout={handleLogout} />;
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
