import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type { CityCode } from "@xlb/types";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import { CustomerDiscoveryTemplate } from "./CustomerDiscoveryTemplate.js";
import type { CustomerDiscoveryTemplateReadyData } from "./CustomerDiscoveryTemplate.js";
import {
  ServiceDiscoveryActionController,
  createBrowserCustomerDiscoveryNavigation,
  type CustomerDiscoveryNavigation,
} from "./ServiceDiscoveryActionController.js";
import {
  ServiceDiscoveryCoordinator,
  type CustomerCatalogLoadResult,
} from "./ServiceDiscoveryCoordinator.js";
import {
  createCustomerDiscoveryViewModel,
  sanitizeDiscoveryQuery,
  type CustomerDiscoveryFilters,
} from "./catalogDiscovery.js";
import "./service-discovery.css";

const RETRY_EVENT = "xlb:customer-discovery-retry";

function storageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function createDefaultCoordinator(): ServiceDiscoveryCoordinator {
  const cityCode = storageValue("xlb.customer.cityCode") as CityCode | null;
  const client = createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    headers: () => {
      const token = storageValue("xlb.customer.token");
      return {
        ...(cityCode ? { "x-xlb-city-code": cityCode } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  });
  return new ServiceDiscoveryCoordinator(customerApi.forClient(client));
}

export interface ServiceDiscoveryPageProps extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly coordinator?: ServiceDiscoveryCoordinator;
  readonly navigation?: CustomerDiscoveryNavigation;
  readonly presentationPlan?: unknown;
}

function initialFilters(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerDiscoveryFilters {
  return Object.freeze({
    categoryId: route.query.categoryId?.trim() || null,
    query: sanitizeDiscoveryQuery(route.query.q ?? ""),
  });
}

function boundaryState(
  result: Exclude<CustomerCatalogLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerDiscoveryTemplateReadyData> {
  const recovery = Object.freeze({
    actionKey: RETRY_EVENT,
    labelKey: "重试",
  });
  switch (result.status) {
    case "empty":
      return Object.freeze({
        status: "empty",
        reasonCode: result.reasonCode,
        recovery,
      });
    case "error":
      return Object.freeze({
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
        recovery: result.retryable ? recovery : null,
      });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: result.reasonCode,
        recovery,
      });
  }
}

export function ServiceDiscoveryPage({
  slice,
  route,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  presentationPlan = null,
}: ServiceDiscoveryPageProps) {
  const cityCode = providedCityCode === undefined
    ? storageValue("xlb.customer.cityCode") as CityCode | null
    : providedCityCode;
  const coordinator = useMemo(
    () => providedCoordinator ?? createDefaultCoordinator(),
    [providedCoordinator],
  );
  const actionController = useMemo(
    () => new ServiceDiscoveryActionController(
      providedNavigation ?? createBrowserCustomerDiscoveryNavigation(),
    ),
    [providedNavigation],
  );
  const [filters, setFilters] = useState(() => initialFilters(route));
  const deferredQuery = useDeferredValue(filters.query);
  const [catalogResult, setCatalogResult] = useState<CustomerCatalogLoadResult | null>(null);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    if (cityCode === null || cityCode.length === 0) {
      setCatalogResult(Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: "catalog_city_mismatch",
      }));
      return;
    }
    const current = ++requestSequence.current;
    setCatalogResult(null);
    const result = await coordinator.load(cityCode);
    if (current === requestSequence.current) setCatalogResult(result);
  }, [cityCode, coordinator]);

  useEffect(() => {
    void load();
    const retry = () => void load();
    window.addEventListener(RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(RETRY_EVENT, retry);
    };
  }, [load]);

  useEffect(() => {
    if (catalogResult?.status !== "ready" || filters.categoryId === null) return;
    const categoryIds = new Set(
      catalogResult.catalog.categories
        .filter((category) => category.isEnabled)
        .map((category) => category.categoryId),
    );
    if (categoryIds.has(filters.categoryId)) return;
    setFilters((current) => actionController.selectCategory(
      current,
      null,
      { categoryIds, skuIds: new Set() },
    ));
  }, [actionController, catalogResult, filters.categoryId]);

  if (catalogResult === null) {
    return (
      <CustomerDiscoveryTemplate
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

  if (catalogResult.status !== "ready") {
    return (
      <CustomerDiscoveryTemplate
        slice={slice}
        route={route}
        operationalManifest={presentationPlan}
        state={boundaryState(catalogResult)}
      />
    );
  }

  const viewModel = createCustomerDiscoveryViewModel(
    catalogResult.catalog,
    { ...filters, query: deferredQuery },
    catalogResult.freshness,
  );
  const scope = Object.freeze({
    categoryIds: new Set(viewModel.categories.map((category) => category.categoryId)),
    skuIds: new Set(viewModel.results.map((service) => service.skuId)),
  });
  const actions = Object.freeze({
    onQueryChange(query: string) {
      setFilters((current) => actionController.changeQuery(current, query));
    },
    onCategoryChange(categoryId: string | null) {
      setFilters((current) => actionController.selectCategory(current, categoryId, scope));
    },
    onClear() {
      setFilters((current) => actionController.clear(current));
    },
    onOpenSku(skuId: string) {
      actionController.openSku(skuId, scope);
    },
  });
  const state: CustomerSliceState<CustomerDiscoveryTemplateReadyData> = {
    status: "ready",
    data: {
      viewModel: {
        ...viewModel,
        filters: { ...viewModel.filters, query: filters.query },
      },
      actions,
      queryChanging: deferredQuery !== filters.query,
    },
  };

  return (
    <CustomerDiscoveryTemplate
      slice={slice}
      route={route}
      operationalManifest={presentationPlan}
      state={state}
    />
  );
}

export const RouteComponent = ServiceDiscoveryPage;
