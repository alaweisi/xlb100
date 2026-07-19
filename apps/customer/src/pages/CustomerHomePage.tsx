import { useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import {
  ActionDock,
  Button,
  Card,
  CustomerAnswerCard,
  CustomerHomeTemplate,
  EmptyState,
  ErrorState,
  LoadingState,
  LocationSearchBar,
  ServiceCard,
} from "@xlb/ui";
import { CITY_OPTIONS, CustomerLoadable, CustomerRouteShell } from "./customerPageShell";
import { cityDisplayLabel, representativeHomeSkus } from "../adapters/catalogAdapters";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";

type City = CityCode;

function HomeHeader({
  cityCode,
  onCityChange,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}: {
  cityCode: City;
  onCityChange: (next: City) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
}) {
  return (
    <Card title="Service search">
      <LocationSearchBar
        cityLabel={cityCode}
        areaLabel={cityDisplayLabel(cityCode)}
        placeholder="Search cleaning, repair, moving"
        value={searchQuery}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
        onCityClick={() => {
          const nextIndex = (CITY_OPTIONS.indexOf(cityCode) + 1) % CITY_OPTIONS.length;
          const nextCity = CITY_OPTIONS[nextIndex];
          onCityChange(nextCity);
        }}
      />
    </Card>
  );
}

export interface CustomerHomePageProps {
  cityCode: City;
  catalogState: CustomerLoadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}

export function CustomerHomePage({ cityCode, catalogState, onRetryCatalog }: CustomerHomePageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const binding = createCustomerUiBinding({
    route: "home",
    cityCode,
  });
  const actionById = useMemo(() => {
    return binding.availableActions.reduce(
      (acc, action) => {
        acc[action.actionId] = action;
        return acc;
      },
      {} as Record<string, (typeof binding.availableActions)[number]>,
    );
  }, [binding]);

  const quickSkus = useMemo(() => {
    if (catalogState.status !== "success") return [];
    return representativeHomeSkus(catalogState.data);
  }, [catalogState]);

  const openServicesAction = actionById["customer.services.open"];
  const onCityChange = (next: City) => {
    window.location.href = `/customer/?${new URLSearchParams({ cityCode: next }).toString()}`;
  };

  function navigateToServices(query: string) {
    const trimmed = query.trim();
    const params = new URLSearchParams({ cityCode: cityCode });
    if (trimmed) {
      params.set("q", trimmed);
    }
    window.location.href = `/customer/services?${params.toString()}`;
  }

  return (
    <CustomerRouteShell currentRoute="home">
      <CustomerHomeTemplate
        route="/customer/"
        cityCode={cityCode}
        binding={binding}
        actions={
          <ActionDock
            actions={openServicesAction ? [openServicesAction] : []}
            onAction={() => (window.location.href = `/customer/services?${new URLSearchParams({ cityCode }).toString()}`)}
            density="compact"
          />
        }
      >
      <HomeHeader
        cityCode={cityCode}
        onCityChange={onCityChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={navigateToServices}
      />

      {catalogState.status === "loading" && (
        <LoadingState title="服务目录加载中" description="正在读取服务目录" />
      )}
      {catalogState.status === "error" && (
        <ErrorState
          title="服务目录加载失败"
          description="网络异常，请稍后重试"
          action={
            <Button type="button" onClick={() => onRetryCatalog()}>
              重试
            </Button>
          }
        />
      )}
      {catalogState.status === "success" && catalogState.data.categories.length === 0 && (
        <EmptyState title="暂无服务目录" description="当前城市暂无可用服务，请稍后再试" />
      )}
      {catalogState.status === "success" && quickSkus.length > 0 && (
        <section style={{ display: "grid", gap: 10 }}>
          <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
            <strong style={{ color: "#334155" }}>热门服务</strong>
            <span style={{ color: "#16a34a" }}>{`共 ${quickSkus.length} 项`}</span>
          </div>
          {quickSkus.slice(0, 12).map((sku) => (
            <ServiceCard
              key={sku.skuId}
              title={sku.name}
              subtitle={sku.subtitle}
              priceText="点击查看"
              actionLabel="选择"
              onClick={() => {
                const url = new URL("/customer/order/create", window.location.origin);
                url.searchParams.set("skuId", sku.skuId);
                window.location.href = url.pathname + url.search;
              }}
            />
          ))}
        </section>
      )}

        <CustomerAnswerCard state={binding.state} />
      </CustomerHomeTemplate>
    </CustomerRouteShell>
  );
}
