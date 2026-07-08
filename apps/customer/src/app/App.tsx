import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { CustomerHomePage } from "../pages/CustomerHomePage";
import { CustomerOrderCreatePage } from "../pages/CustomerOrderCreatePage";
import type { CustomerOrderCreatePageProps } from "../pages/CustomerOrderCreatePage";
import { CustomerOrdersPage } from "../pages/CustomerOrdersPage";
import type { CustomerOrdersPageProps } from "../pages/CustomerOrdersPage";
import { CustomerProfilePage } from "../pages/CustomerProfilePage";
import { CustomerServicesPage } from "../pages/CustomerServicesPage";
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

export function App() {
  const initialCityCode = useMemo(() => readCustomerCityCode(), []);
  const [cityCode, setCityCode] = useState<CityCode>(initialCityCode);
  const [catalogState, setCatalogState] = useState<CustomerLoadable<CatalogSnapshot>>({ status: "loading" });
  const [orderIds, setOrderIds] = useState<string[]>(() => readOrderIds());
  const [session, setSession] = useState<CustomerSession | null>(() => readStoredSession());
  const currentRoute = useMemo(() => detectCustomerRoute(), []);

  // Login on mount (idempotent: reuses stored token if still valid)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (readStoredSession()) return; // already have a session
      try {
        const s = await loginCustomer();
        if (!cancelled) setSession(s);
      } catch {
        // If login fails, proceed with header fallback.
        // The backend returns 401 for routes that require real auth.
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
  }, [api, cityCode]);

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
    createPaymentOrder: (request) => api.createPaymentOrder(request),
    getOrder: (orderId) => api.getOrder(orderId),
  };

  const ordersApi: CustomerOrdersPageProps["api"] = {
    getOrder: (orderId) => api.getOrder(orderId),
    createRefundRequest: (payload) => api.createRefundRequest(payload),
    createOrderReview: (payload) => api.createOrderReview(payload),
  };

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

  return <CustomerProfilePage cityCode={cityCode} />;
}
