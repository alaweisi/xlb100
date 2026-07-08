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
  readCustomerCityCode,
  readOrderIds,
  writeCustomerCityCode,
} from "../pages/customerPageShell";

function createApi(cityCode: CityCode) {
  return createCustomerApiClient(cityCode);
}

export function App() {
  const initialCityCode = useMemo(() => readCustomerCityCode(), []);
  const [cityCode, setCityCode] = useState<CityCode>(initialCityCode);
  const [catalogState, setCatalogState] = useState<CustomerLoadable<CatalogSnapshot>>({ status: "loading" });
  const [orderIds, setOrderIds] = useState<string[]>(() => readOrderIds());
  const currentRoute = useMemo(() => detectCustomerRoute(), []);

  const api = useMemo(() => createApi(cityCode), [cityCode]);
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
