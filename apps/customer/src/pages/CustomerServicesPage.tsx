import { useMemo, useState } from "react";
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
import { cityDisplayLabel, getCatalogSkus } from "../adapters/catalogAdapters";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import type { CustomerLoadable } from "./customerPageShell";
import { UatDebugPanel } from "./customerPageShell";

type CatalogCategoryTab = {
  key: string;
  label: string;
};

function dedupePathParts(parts: Array<string | undefined>): string[] {
  const values = parts.filter(Boolean).map((item) => item!.trim());
  const out: string[] = [];
  for (const item of values) {
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

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
      const matchText = `${sku.name} ${sku.itemName} ${sku.categoryName} ${sku.subtitle}`.toLowerCase();
      const matchCategory = activeCategoryId === "all" || sku.categoryId === activeCategoryId;
      return matchCategory && (query ? matchText.includes(query) : true);
    });
  }, [activeCategoryId, allSkus, searchQuery]);

  const header = (
    <Card title="Service discovery">
      <LocationSearchBar
        cityLabel={cityCode}
        areaLabel={cityDisplayLabel(cityCode)}
        onSearchChange={setSearchQuery}
        placeholder="Search service"
        value={searchQuery}
        onCityClick={() => {}}
      />
      <CustomerAnswerCard state={binding.state} />
    </Card>
  );

  const retryAction = actionById["customer.catalog.retry"];

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
            <StatusTag tone="success">{filteredSkus.length} items</StatusTag>
          </div>
          {filteredSkus.map((sku) => {
            const subtitleParts = dedupePathParts([sku.categoryName, sku.itemName, sku.unit]);
            return (
              <ServiceCard
                key={sku.skuId}
                title={sku.name}
                subtitle={subtitleParts.join(" / ")}
                status={<StatusTag tone="muted">Orderable</StatusTag>}
                onClick={() => {
                  const params = new URLSearchParams({ skuId: sku.skuId });
                  window.location.href = `/customer/order/create?${params.toString()}`;
                }}
              />
            );
          })}
        </section>
      )}

      <UatDebugPanel
        binding={binding}
        facts={[
          { label: "city_code", value: cityCode },
          { label: "search query", value: searchQuery },
          { label: "catalog category count", value: catalogState.status === "success" ? catalogState.data.categories.length : 0 },
          { label: "workflow state", value: binding.state },
          { label: "availableActions", value: binding.availableActions },
        ]}
      />
    </CustomerServicesTemplate>
  );
}
