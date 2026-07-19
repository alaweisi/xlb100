import { useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import {
  ActionDock,
  Card,
  CustomerAnswerCard,
  CustomerServicesTemplate,
  EmptyState,
  ErrorState,
  LoadingState,
  LocationSearchBar,
  ServiceCard,
  StatusTag,
  Tabs,
} from "@xlb/ui";
import {
  CITY_OPTIONS,
  CustomerLoadable,
  CustomerRouteShell,
  setRouteSearchParams,
  useRouteSearchParams,
} from "./customerPageShell";
import { cityDisplayLabel, getCatalogSkuDisplayLabel, getCatalogSkus } from "../adapters/catalogAdapters";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";

type CatalogCategoryTab = {
  key: string;
  label: string;
};


export function CustomerServicesPage({
  cityCode,
  catalogState,
  onRetryCatalog,
}: {
  cityCode: CityCode;
  catalogState: CustomerLoadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const routeSearchQuery = useRouteSearchParams("q");
  const binding = createCustomerUiBinding({ route: "services", cityCode });

  const actionById = useMemo(() => {
    return binding.availableActions.reduce(
      (acc, action) => {
        acc[action.actionId] = action;
        return acc;
      },
      {} as Record<string, (typeof binding.availableActions)[number]>,
    );
  }, [binding]);

  useEffect(() => {
    setSearchQuery(routeSearchQuery ?? "");
  }, [routeSearchQuery]);

  const allSkus = useMemo(() => {
    if (catalogState.status !== "success") return [];
    return getCatalogSkus(catalogState.data);
  }, [catalogState]);

  const tabs = useMemo<CatalogCategoryTab[]>(() => {
    if (catalogState.status !== "success") {
      return [{ key: "all", label: "All" }];
    }
    return [{ key: "all", label: "All" }, ...catalogState.data.categories.map((category) => ({ key: category.categoryId, label: category.name }))];
  }, [catalogState]);

  const filteredSkus = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allSkus.filter((sku) => {
      const matchText = `${sku.name} ${sku.categoryPathLabel} ${sku.unit}`.toLowerCase();
      const matchCategory = activeCategoryId === "all" || sku.categoryId === activeCategoryId;
      return matchCategory && (query ? matchText.includes(query) : true);
    });
  }, [activeCategoryId, allSkus, searchQuery]);

  const catalogQueryParams = (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    const params = new URLSearchParams({ cityCode });
    if (trimmed) {
      params.set("q", trimmed);
    }
    return params;
  };

  const updateRouteSearchQuery = (nextQuery: string) => {
    const trimmed = nextQuery.trim();
    setSearchQuery(trimmed);
    setRouteSearchParams({ cityCode, q: trimmed || null });
  };

  const onCityChange = () => {
    const nextIndex = (CITY_OPTIONS.indexOf(cityCode) + 1) % CITY_OPTIONS.length;
    const nextCity = CITY_OPTIONS[nextIndex];
    const params = catalogQueryParams(searchQuery);
    window.location.href = `/customer/services?${new URLSearchParams({ cityCode: nextCity, ...(params.get("q") ? { q: params.get("q")! } : {}) })}`;
  };

  const retryAction = actionById["customer.catalog.retry"];

  const header = (
    <Card title="Service discovery">
      <LocationSearchBar
        cityLabel={cityCode}
        areaLabel={cityDisplayLabel(cityCode)}
        onSearchChange={setSearchQuery}
        onSearchSubmit={updateRouteSearchQuery}
        placeholder="Search cleaning, repair, moving"
        value={searchQuery}
        onCityClick={onCityChange}
      />
      <CustomerAnswerCard state={binding.state} />
    </Card>
  );

  return (
    <CustomerRouteShell currentRoute="services">
      <CustomerServicesTemplate route="/customer/services" cityCode={cityCode} binding={binding} header={header}>
      <Card
        actions={
          <ActionDock
            actions={retryAction ? [retryAction] : []}
            density="compact"
            onAction={() => onRetryCatalog()}
          />
        }
      >
        <Tabs items={tabs} activeKey={activeCategoryId} onChange={setActiveCategoryId} density="compact" />
      </Card>

      {catalogState.status === "loading" && <LoadingState title="Loading services" description="Reading catalog API..." />}
      {catalogState.status === "error" && (
        <ErrorState
          title="Load failed"
          description="Catalog API failed. Please retry."
          action={
            <ActionDock
              actions={retryAction ? [retryAction] : []}
              density="compact"
              onAction={() => onRetryCatalog()}
            />
          }
        />
      )}

      {catalogState.status === "success" && catalogState.data.categories.length === 0 && (
        <EmptyState title="No service available" description="Current city has no service catalog." />
      )}

      {catalogState.status === "success" && filteredSkus.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ alignItems: "center", color: "#64748b", display: "flex", justifyContent: "space-between" }}>
            <strong>Service list</strong>
            <StatusTag tone="success">{`${filteredSkus.length} items`}</StatusTag>
          </div>
          {filteredSkus.map((sku) => {
            const skuDisplay = getCatalogSkuDisplayLabel(sku);
            return (
              <ServiceCard
                key={sku.skuId}
                title={sku.name}
                subtitle={skuDisplay.subtitle}
                status={<StatusTag tone="muted">Available</StatusTag>}
                onClick={() => {
                  const params = new URLSearchParams({ skuId: sku.skuId });
                  window.location.href = `/customer/order/create?${params.toString()}`;
                }}
              />
            );
          })}
        </section>
      )}

      {catalogState.status === "success" && filteredSkus.length === 0 && (
        <EmptyState
          title="No matching services"
          description={searchQuery.trim() ? `No services found for "${searchQuery}"` : "No service is available in selected filters"}
        />
      )}

      </CustomerServicesTemplate>
    </CustomerRouteShell>
  );
}
