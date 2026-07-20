import { useEffect, useMemo, useState } from "react";
import { CaretDown, MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import {
  ActionDock,
  Card,
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
import { cityAreaByCode, cityNameByCode, getCatalogSkuDisplayLabel, getCatalogSkus } from "../adapters/catalogAdapters";
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
      return [{ key: "all", label: "全部" }];
    }
    return [{ key: "all", label: "全部" }, ...catalogState.data.categories.map((category) => ({ key: category.categoryId, label: category.name }))];
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
    <Card title="发现服务">
      <LocationSearchBar
        cityLabel={cityNameByCode[cityCode]}
        areaLabel={cityAreaByCode[cityCode]}
        onSearchChange={setSearchQuery}
        onSearchSubmit={updateRouteSearchQuery}
        placeholder="搜索保洁、维修、搬家等服务"
        locationIcon={<MapPin size={16} weight="fill" />}
        disclosureIcon={<CaretDown size={14} />}
        searchIcon={<MagnifyingGlass size={20} />}
        value={searchQuery}
        onCityClick={onCityChange}
      />
    </Card>
  );

  return (
    <CustomerRouteShell currentRoute="services">
      <CustomerServicesTemplate route="/customer/services" cityCode={cityCode} binding={binding} header={header}>
      <Card>
        <Tabs items={tabs} activeKey={activeCategoryId} onChange={setActiveCategoryId} density="compact" />
      </Card>

      {catalogState.status === "loading" && <LoadingState title="服务加载中" description="正在读取当前城市可预约的服务" />}
      {catalogState.status === "error" && (
        <ErrorState
          title="服务加载失败"
          description="网络可能暂时不可用，请重试。"
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
        <EmptyState title="当前城市暂无服务" description="可以切换城市，或稍后再来看看。" />
      )}

      {catalogState.status === "success" && filteredSkus.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ alignItems: "center", color: "#64748b", display: "flex", justifyContent: "space-between" }}>
            <strong>服务列表</strong>
            <StatusTag tone="success">{`${filteredSkus.length} 项`}</StatusTag>
          </div>
          {filteredSkus.map((sku) => {
            const skuDisplay = getCatalogSkuDisplayLabel(sku);
            return (
              <ServiceCard
                key={sku.skuId}
                title={sku.name}
                subtitle={skuDisplay.subtitle}
                status={<StatusTag tone="muted">可预约</StatusTag>}
                onClick={() => {
                  const params = new URLSearchParams({ skuId: sku.skuId });
                  window.location.href = `/customer/order/create?${params.toString()}`;
                }}
              />
            );
          })}
        </section>
      )}

      {catalogState.status === "success" && catalogState.data.categories.length > 0 && filteredSkus.length === 0 && (
        <EmptyState
          title="没有找到匹配服务"
          description={searchQuery.trim() ? `暂时没有与“${searchQuery}”匹配的服务` : "当前筛选条件下没有可预约服务"}
        />
      )}

      </CustomerServicesTemplate>
    </CustomerRouteShell>
  );
}
