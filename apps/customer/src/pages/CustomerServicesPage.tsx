import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CaretDown,
  CheckCircle,
  ImageSquare,
  MagnifyingGlass,
  MapPin,
  X,
} from "@phosphor-icons/react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { Button, EmptyState, ErrorState, RuntimeThemeSurface, Tabs } from "@xlb/ui";
import { getCustomerServiceCategoryAsset } from "../assets/serviceCategoryAssets";
import {
  cityDisplayLabel,
  filterCatalogSkus,
  getCatalogSkuDisplayLabel,
  getCatalogSkus,
  type CatalogSkuViewModel,
} from "../adapters/catalogAdapters";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { assignCustomerDeepLink, buildCustomerDeepLink } from "../routes/customerDeepLinks";
import {
  CITY_OPTIONS,
  type CustomerLoadable,
  setRouteSearchParams,
  useRouteSearchParams,
} from "./customerPageShell";
import "./customer-services.css";

function nextCity(cityCode: CityCode): CityCode {
  const nextIndex = (CITY_OPTIONS.indexOf(cityCode) + 1) % CITY_OPTIONS.length;
  return CITY_OPTIONS[nextIndex] ?? CITY_OPTIONS[0];
}

function goToServicesForCity(cityCode: CityCode, query: string) {
  const normalizedQuery = query.trim();
  assignCustomerDeepLink("services", { cityCode, q: normalizedQuery || null });
}

function CatalogSkeleton() {
  return (
    <div className="customer-services__skeleton-list" aria-label="服务列表正在加载" aria-busy="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="customer-services__skeleton-card" key={index}>
          <span className="customer-services__skeleton customer-services__skeleton--image" />
          <span className="customer-services__skeleton-copy">
            <span className="customer-services__skeleton customer-services__skeleton--title" />
            <span className="customer-services__skeleton customer-services__skeleton--meta" />
          </span>
        </div>
      ))}
    </div>
  );
}

function ServiceResultCard({
  sku,
  selected,
  onSelect,
}: {
  sku: CatalogSkuViewModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const asset = getCustomerServiceCategoryAsset(sku.categoryName);
  const display = getCatalogSkuDisplayLabel(sku);

  return (
    <li>
      <button
        aria-label={`${selected ? "已选择" : "选择"}${sku.name}`}
        aria-pressed={selected}
        className={`customer-services__service-card${selected ? " is-selected" : ""}`}
        onClick={onSelect}
        type="button"
      >
        <span className="customer-services__service-visual" aria-hidden="true">
          {asset ? (
            <img alt="" height={asset.height} loading="lazy" src={asset.src} width={asset.width} />
          ) : (
            <ImageSquare weight="regular" />
          )}
        </span>
        <span className="customer-services__service-copy">
          <span className="customer-services__service-category">{sku.categoryName}</span>
          <strong>{display.title}</strong>
          <span>{display.subtitle}</span>
        </span>
        <span className="customer-services__service-indicator" aria-hidden="true">
          {selected ? <CheckCircle weight="fill" /> : <ArrowRight weight="bold" />}
        </span>
      </button>
    </li>
  );
}

export interface CustomerServicesPageProps {
  cityCode: CityCode;
  catalogState: CustomerLoadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}

export function CustomerServicesPage({
  cityCode,
  catalogState,
  onRetryCatalog,
}: CustomerServicesPageProps) {
  const routeQuery = useRouteSearchParams("q");
  const routeCategoryId = useRouteSearchParams("categoryId");
  const selectedSkuId = useRouteSearchParams("skuId");
  const [searchQuery, setSearchQuery] = useState(routeQuery ?? "");
  const binding = createCustomerUiBinding({ route: "services", cityCode });
  const catalogData = catalogState.data;

  useEffect(() => {
    setSearchQuery(routeQuery ?? "");
  }, [routeQuery]);

  const allSkus = useMemo(() => getCatalogSkus(catalogData), [catalogData]);
  const tabs = useMemo(
    () => [
      { key: "all", label: "全部" },
      ...(catalogData?.categories.map((category) => ({
        key: category.categoryId,
        label: category.name,
      })) ?? []),
    ],
    [catalogData],
  );
  const activeCategoryId = tabs.some((tab) => tab.key === routeCategoryId)
    ? routeCategoryId ?? "all"
    : "all";
  const filteredSkus = useMemo(
    () => filterCatalogSkus(allSkus, searchQuery, activeCategoryId),
    [activeCategoryId, allSkus, searchQuery],
  );
  const selectedSku = selectedSkuId
    ? allSkus.find((sku) => sku.skuId === selectedSkuId)
    : undefined;
  const staleSelection = Boolean(selectedSkuId && catalogData && !selectedSku);
  const hasCatalog = Boolean(catalogData && catalogData.categories.length > 0 && allSkus.length > 0);
  const isInitialLoading = (catalogState.status === "loading" || catalogState.status === "pending") && !catalogData;
  const isRefreshing = (catalogState.status === "loading" || catalogState.status === "pending") && Boolean(catalogData);
  const hasBlockingError = catalogState.status === "error" && !catalogData;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = searchQuery.trim();
    setSearchQuery(normalizedQuery);
    setRouteSearchParams({
      q: normalizedQuery || null,
      categoryId: null,
      skuId: null,
    });
  }

  function changeSearchQuery(value: string) {
    setSearchQuery(value);
    if (selectedSkuId) {
      setRouteSearchParams({ skuId: null });
    }
  }

  function clearFilters() {
    setSearchQuery("");
    setRouteSearchParams({ q: null, categoryId: null, skuId: null });
  }

  function selectCategory(categoryId: string) {
    setRouteSearchParams({
      categoryId: categoryId === "all" ? null : categoryId,
      skuId: null,
    });
  }

  function selectSku(skuId: string) {
    setRouteSearchParams({ skuId });
  }

  return (
    <RuntimeThemeSurface className="customer-services" binding={binding}>
      <header className="customer-services__header">
        <p>全部服务</p>
        <h1>找到适合的上门服务</h1>
        <span>从当前城市的正式服务目录中搜索并选择，下一步再填写上门信息。</span>
      </header>

      <form className="customer-services__search" onSubmit={submitSearch} role="search">
        <button
          aria-label={`当前服务范围${cityDisplayLabel(cityCode)}，点击切换城市`}
          className="customer-services__city"
          onClick={() => goToServicesForCity(nextCity(cityCode), searchQuery)}
          type="button"
        >
          <MapPin aria-hidden="true" weight="fill" />
          <span>{cityDisplayLabel(cityCode)}</span>
          <CaretDown aria-hidden="true" weight="bold" />
        </button>
        <span className="customer-services__search-divider" aria-hidden="true" />
        <label className="customer-services__search-field">
          <span className="customer-services__visually-hidden">搜索服务名称、类别或单位</span>
          <MagnifyingGlass aria-hidden="true" />
          <input
            autoComplete="off"
            onChange={(event) => changeSearchQuery(event.target.value)}
            placeholder="搜索保洁、维修、搬家"
            type="search"
            value={searchQuery}
          />
        </label>
        {searchQuery ? (
          <button
            aria-label="清空搜索"
            className="customer-services__clear-search"
            onClick={clearFilters}
            type="button"
          >
            <X aria-hidden="true" weight="bold" />
          </button>
        ) : null}
        <button aria-label="搜索服务" className="customer-services__submit-search" type="submit">
          <MagnifyingGlass aria-hidden="true" weight="bold" />
        </button>
      </form>

      {catalogData?.categories.length ? (
        <nav aria-label="服务类别" className="customer-services__categories">
          <Tabs
            activeKey={activeCategoryId}
            className="customer-services__category-tabs"
            density="compact"
            items={tabs}
            onChange={selectCategory}
            productRole="customer"
          />
        </nav>
      ) : null}

      {isRefreshing ? (
        <p className="customer-services__refreshing" role="status">
          正在更新当前城市的服务目录，已显示上次成功获取的内容。
        </p>
      ) : null}

      {catalogState.status === "error" && catalogData ? (
        <div className="customer-services__inline-error" role="alert">
          <div>
            <strong>服务目录更新失败</strong>
            <p>当前仍显示上次成功获取的内容，你可以稍后重试。</p>
          </div>
          <Button onClick={onRetryCatalog} productRole="customer" variant="secondary">重新加载</Button>
        </div>
      ) : null}

      {staleSelection ? (
        <div className="customer-services__stale-selection" role="status">
          <div>
            <strong>链接中的服务当前不可用</strong>
            <p>它可能已下线或不属于当前城市。下面只显示服务端返回的可用目录。</p>
          </div>
          <Button onClick={() => setRouteSearchParams({ skuId: null })} productRole="customer" variant="secondary">
            查看可用服务
          </Button>
        </div>
      ) : null}

      {isInitialLoading ? <CatalogSkeleton /> : null}

      {hasBlockingError ? (
        <ErrorState
          action={(
            <Button onClick={onRetryCatalog} productRole="customer" variant="primary">重新加载</Button>
          )}
          description="服务目录暂时没有加载成功。请检查网络后重试，我们不会用临时服务替代。"
          productRole="customer"
          title="暂时无法读取服务目录"
        />
      ) : null}

      {catalogState.status === "success" && !hasCatalog ? (
        <EmptyState
          description="当前城市的正式目录还没有可预约服务，开放后会在这里显示。"
          productRole="customer"
          title="当前城市暂未开放服务"
        />
      ) : null}

      {catalogData && hasCatalog ? (
        <section aria-labelledby="customer-services-results" className="customer-services__results">
          <div className="customer-services__results-heading">
            <div>
              <h2 id="customer-services-results">
                {activeCategoryId === "all" ? "服务列表" : tabs.find((tab) => tab.key === activeCategoryId)?.label}
              </h2>
              <p aria-live="polite">找到 {filteredSkus.length} 项当前可预约服务</p>
            </div>
            {searchQuery || activeCategoryId !== "all" ? (
              <button onClick={clearFilters} type="button">清除筛选</button>
            ) : null}
          </div>

          {filteredSkus.length ? (
            <ul className="customer-services__service-list">
              {filteredSkus.map((sku) => (
                <ServiceResultCard
                  key={sku.skuId}
                  onSelect={() => selectSku(sku.skuId)}
                  selected={sku.skuId === selectedSkuId}
                  sku={sku}
                />
              ))}
            </ul>
          ) : (
            <EmptyState
              action={(
                <Button onClick={clearFilters} productRole="customer" variant="secondary">查看全部服务</Button>
              )}
              description={searchQuery.trim()
                ? `没有找到与“${searchQuery.trim()}”匹配的服务，请换个关键词。`
                : "当前类别暂时没有可预约服务。"}
              productRole="customer"
              title="没有匹配的服务"
            />
          )}
        </section>
      ) : null}

      {selectedSku ? (
        <aside aria-label="已选服务" className="customer-services__selection-dock">
          <div>
            <span>已选择</span>
            <strong>{selectedSku.name}</strong>
            <p>{getCatalogSkuDisplayLabel(selectedSku).subtitle}</p>
          </div>
          <a
            href={buildCustomerDeepLink("createOrder", { cityCode, skuId: selectedSku.skuId })}
          >
            <span>继续预约</span>
            <ArrowRight aria-hidden="true" weight="bold" />
          </a>
        </aside>
      ) : null}
    </RuntimeThemeSurface>
  );
}
