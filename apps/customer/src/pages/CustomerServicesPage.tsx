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
import { CaretDown, MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import {
  CITY_OPTIONS,
  CustomerLoadable,
  setRouteSearchParams,
  useRouteSearchParams,
} from "./customerPageShell";
import { cityDisplayLabel, cityNameByCode, getCatalogSkuDisplayLabel, getCatalogSkus } from "../adapters/catalogAdapters";
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
    <Card title="全部服务">
      <LocationSearchBar
        cityLabel={cityNameByCode[cityCode]}
        areaLabel={cityDisplayLabel(cityCode)}
        locationIcon={<MapPin size={15} weight="fill" />}
        dropdownIcon={<CaretDown size={13} weight="bold" />}
        searchIcon={<MagnifyingGlass size={18} weight="bold" />}
        onSearchChange={setSearchQuery}
        onSearchSubmit={updateRouteSearchQuery}
        placeholder="输入服务名称或关键词"
        value={searchQuery}
        onCityClick={onCityChange}
      />
      <CustomerAnswerCard state={binding.state} />
    </Card>
  );

  const catalogLoading = catalogState.status === "loading";
  const catalogFailed = catalogState.status === "error";
  const catalogReady = catalogState.status === "success";

  return (
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

      {catalogLoading && <LoadingState title="服务加载中" description="正在读取实时服务目录" />}
      {catalogFailed && (
        <ErrorState
          title="加载失败"
          description={catalogState.error}
          action={
            <ActionDock
              actions={retryAction ? [retryAction] : []}
              density="compact"
              onAction={() => onRetryCatalog()}
            />
          }
        />
      )}

      {catalogReady && catalogState.data.categories.length === 0 && (
        <EmptyState title="暂无可用服务" description="当前城市暂未开放服务目录。" />
      )}

      {catalogReady && filteredSkus.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ alignItems: "center", color: "#64748b", display: "flex", justifyContent: "space-between" }}>
            <strong>服务项目</strong>
            <StatusTag tone="success">{`共 ${filteredSkus.length} 项`}</StatusTag>
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

      {catalogReady && filteredSkus.length === 0 && (
        <EmptyState
          title="没有匹配的服务"
          description={searchQuery.trim() ? `未找到“${searchQuery}”相关服务` : "当前筛选条件下暂无服务"}
        />
      )}

    </CustomerServicesTemplate>
  );
}
