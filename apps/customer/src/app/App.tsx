import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import type { CustomerOrderCreatePageProps } from "../pages/CustomerOrderCreatePage";
import type { CustomerOrdersPageProps } from "../pages/CustomerOrdersPage";
import type { CustomerSupportApi } from "../pages/CustomerSupportPage";
import {
  appendOrderId,
  createCustomerApiClient,
  CustomerLoadable,
  detectCustomerRoute,
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
  const [session, setSession] = useState<CustomerSession | null>(() => readStoredSession());
  const currentRoute = useMemo(() => detectCustomerRoute(), []);

  // Login on mount (idempotent: reuses stored token if still valid)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const storedSession = readStoredSession();
      if (storedSession) {
        if (!cancelled) setSession(storedSession);
        return;
      }
      try {
        const s = await loginCustomer();
        if (!cancelled) setSession(s);
      } catch (error) {
        if (!cancelled) {
          setCatalogState({
            status: "error",
            error: error instanceof Error ? error.message : "Customer login failed",
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const api = useMemo(
    () => createCustomerApiClient(cityCode, session?.token),
    [cityCode, session?.token],
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
        error: error instanceof Error ? error.message : "Unable to load catalog",
      });
    }
  }, [api, cityCode, session?.token]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

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

  const orderCreateApi: CustomerOrderCreatePageProps["api"] = {
    getPriceQuote: (skuId) => api.getPriceQuote(skuId),
    createOrder: (payload) => api.createOrder(payload),
    getOrder: (orderId) => api.getOrder(orderId),
  };

  const ordersApi: CustomerOrdersPageProps["api"] = {
    getOrder: (orderId) => api.getOrder(orderId),
    confirmService: (orderId) => api.confirmService(orderId),
    createPaymentOrder: (payload) => api.createPaymentOrder(payload),
    mockPaySuccess: (payload) => api.mockPaySuccess(payload),
    createRefundRequest: (payload) => api.createRefundRequest(payload),
    createOrderReview: (payload) => api.createOrderReview(payload),
  };

  if (!session) {
    return <main aria-busy="true" style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>Authenticating customer</main>;
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

  return <CustomerProfilePage api={api} cityCode={cityCode} />;
}
