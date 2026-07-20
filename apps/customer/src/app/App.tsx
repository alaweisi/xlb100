import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
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
  detectCustomerRoute,
  readCustomerCityCode,
  readOrderIds,
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
      const params = new URLSearchParams(window.location.search);
      params.set("orderId", orderId);
      window.history.replaceState({}, "", `/customer/orders?${params.toString()}`);
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

  const ordersApi: CustomerOrdersPageProps["api"] = {
    getOrder: (orderId) => api.getOrder(orderId),
    confirmService: (orderId) => api.confirmService(orderId),
    createPaymentOrder: (payload) => api.createPaymentOrder(payload),
    createRefundRequest: (payload) => api.createRefundRequest(payload),
    createOrderReview: (payload) => api.createOrderReview(payload),
    getOrderReview: (orderId) => api.getOrderReview(orderId),
    createReviewAppeal: (reviewId, payload) => api.createReviewAppeal(reviewId, payload),
    withdrawReviewAppeal: (reviewId, payload) => api.withdrawReviewAppeal(reviewId, payload),
  };

  if (!session) {
    return <CustomerLoginPage reason={sessionEndReason} onLogin={handleLogin} />;
  }

  if (currentRoute === "home") {
    return <CustomerHomePage cityCode={cityCode} catalogState={catalogState} onRetryCatalog={handleRetryCatalog} />;
  }

  if (currentRoute === "services") {
    return <CustomerServicesPage cityCode={cityCode} catalogState={catalogState} onRetryCatalog={handleRetryCatalog} />;
  }

  if (currentRoute === "createOrder") {
    return (
      <CustomerOrderCreatePage
        api={orderCreateApi}
        catalogState={catalogState}
        cityCode={cityCode}
        onOrderCreated={handleOrderCreated}
      />
    );
  }

  if (currentRoute === "orders") {
    return <CustomerOrdersPage api={ordersApi} cityCode={cityCode} orderIds={orderIds} />;
  }

  if (currentRoute === "aftersale") {
    return <CustomerAftersalePage api={api} orderIds={orderIds} />;
  }

  if (currentRoute === "support") {
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
    return <CustomerSupportPage api={supportApi} />;
  }

  if (currentRoute === "notifications") {
    return <CustomerNotificationsPage api={api} />;
  }

  if (currentRoute === "coupons") {
    const couponsApi: CustomerCouponsPageProps["api"] = {
      listCouponGrants: (query) => api.listCouponGrants(query),
    };
    return (
      <CustomerCouponsPage
        api={couponsApi}
        onSelectForQuote={(couponGrantId) => {
          window.location.assign(`/customer/order/create?couponGrantId=${encodeURIComponent(couponGrantId)}`);
        }}
      />
    );
  }

  return <CustomerProfilePage api={api} cityCode={cityCode} onLogout={handleLogout} />;
}
