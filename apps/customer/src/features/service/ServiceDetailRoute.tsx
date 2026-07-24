import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type { CityCode } from "@xlb/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  CustomerSkuDetailTemplate,
  type CustomerSkuDetailTemplateReadyData,
} from "./CustomerSkuDetailTemplate.js";
import {
  ServiceDetailActionController,
  createBrowserCustomerServiceDetailNavigation,
  type CustomerServiceDetailNavigation,
} from "./ServiceDetailActionController.js";
import {
  ServiceDetailCoordinator,
  type CustomerServiceDetailLoadResult,
} from "./ServiceDetailCoordinator.js";
import "./service-detail.css";

const RETRY_EVENT = "xlb:customer-service-detail-retry";

function storageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function createDefaultCoordinator(): ServiceDetailCoordinator {
  const client = createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    headers: () => {
      const cityCode = storageValue("xlb.customer.cityCode");
      const token = storageValue("xlb.customer.token");
      return {
        ...(cityCode ? { "x-xlb-city-code": cityCode } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  });
  return new ServiceDetailCoordinator(customerApi.forClient(client));
}

export interface ServiceDetailPageProps extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly coordinator?: ServiceDetailCoordinator;
  readonly navigation?: CustomerServiceDetailNavigation;
  readonly presentationPlan?: unknown;
}

function boundaryState(
  result: Exclude<CustomerServiceDetailLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerSkuDetailTemplateReadyData> {
  const retry = Object.freeze({
    actionKey: RETRY_EVENT,
    labelKey: "重新读取",
  });
  switch (result.status) {
    case "empty":
      return Object.freeze({
        status: "empty",
        reasonCode: result.reasonCode,
        recovery: Object.freeze({
          actionKey: "xlb:customer-service-detail-back",
          labelKey: "返回服务列表",
        }),
      });
    case "error":
      return Object.freeze({
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
        recovery: result.retryable ? retry : null,
      });
    case "conflict":
      return Object.freeze({
        status: "conflict",
        conflictCode: result.conflictCode,
        refreshRequired: true,
        recovery: retry,
      });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: result.reasonCode,
        recovery: result.reasonCode === "sku_not_found"
          ? Object.freeze({
              actionKey: "xlb:customer-service-detail-back",
              labelKey: "返回服务列表",
            })
          : retry,
      });
  }
}

export function ServiceDetailPage({
  slice,
  route,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  presentationPlan = null,
}: ServiceDetailPageProps) {
  const cityCode = providedCityCode === undefined
    ? storageValue("xlb.customer.cityCode") as CityCode | null
    : providedCityCode;
  const skuId = route.params.skuId ?? "";
  const coordinator = useMemo(
    () => providedCoordinator ?? createDefaultCoordinator(),
    [providedCoordinator],
  );
  const actionController = useMemo(
    () => new ServiceDetailActionController(
      providedNavigation ?? createBrowserCustomerServiceDetailNavigation(),
    ),
    [providedNavigation],
  );
  const [result, setResult] = useState<CustomerServiceDetailLoadResult | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    if (cityCode === null || cityCode.length === 0) {
      requestSequence.current += 1;
      setResult(Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: "catalog_city_mismatch",
      }));
      return;
    }
    const current = ++requestSequence.current;
    setResult(null);
    const next = await coordinator.load(cityCode, skuId);
    if (current === requestSequence.current) setResult(next);
  }, [cityCode, coordinator, skuId]);

  useEffect(() => {
    void load();
    const retry = () => void load();
    const back = () => actionController.backToDiscovery();
    window.addEventListener(RETRY_EVENT, retry);
    window.addEventListener("xlb:customer-service-detail-back", back);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(RETRY_EVENT, retry);
      window.removeEventListener("xlb:customer-service-detail-back", back);
    };
  }, [actionController, load]);

  if (result === null) {
    return (
      <CustomerSkuDetailTemplate
        slice={slice}
        route={route}
        operationalManifest={presentationPlan}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />
    );
  }

  if (result.status !== "ready") {
    return (
      <CustomerSkuDetailTemplate
        slice={slice}
        route={route}
        operationalManifest={presentationPlan}
        state={boundaryState(result)}
      />
    );
  }

  const scope = Object.freeze({ skuId: result.detail.identity.skuId });
  const state: CustomerSliceState<CustomerSkuDetailTemplateReadyData> = {
    status: "ready",
    data: {
      viewModel: result.detail,
      actions: Object.freeze({
        onBack() {
          actionController.backToDiscovery();
        },
        onStartCheckout() {
          actionController.startCheckout(result.detail.identity.skuId, scope);
        },
      }),
    },
  };

  return (
    <CustomerSkuDetailTemplate
      slice={slice}
      route={route}
      operationalManifest={presentationPlan}
      state={state}
    />
  );
}

export const RouteComponent = ServiceDetailPage;
