import { BrandLogo, CustomerButton } from "@xlb/customer-components";
import type { ChangeEvent, FormEvent } from "react";
import type { CustomerDiscoveryViewModel } from "./catalogDiscovery.js";

export interface CustomerDiscoveryComponentActions {
  readonly onQueryChange: (query: string) => void;
  readonly onCategoryChange: (categoryId: string | null) => void;
  readonly onClear: () => void;
  readonly onOpenSku: (skuId: string) => void;
}

export interface CustomerDiscoveryComponentProps {
  readonly viewModel: CustomerDiscoveryViewModel;
  readonly actions: CustomerDiscoveryComponentActions;
  readonly queryChanging: boolean;
}

export function DiscoveryBoundaryHeader() {
  return (
    <header className="xlb-discovery-header" data-discovery-component="header">
      <BrandLogo variant="compact" />
      <div>
        <p>当前城市服务目录</p>
        <h1>找到适合你的服务</h1>
      </div>
    </header>
  );
}

export function DiscoveryHeader(_props: CustomerDiscoveryComponentProps) {
  return <DiscoveryBoundaryHeader />;
}

export function DiscoverySearchField({
  viewModel,
  actions,
  queryChanging,
}: CustomerDiscoveryComponentProps) {
  function change(event: ChangeEvent<HTMLInputElement>) {
    actions.onQueryChange(event.currentTarget.value);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form
      className="xlb-discovery-search"
      role="search"
      aria-label="搜索当前城市服务"
      data-discovery-component="search-field"
      onSubmit={submit}
    >
      <label htmlFor="customer-service-query">搜索服务</label>
      <div className="xlb-discovery-search__control">
        <input
          id="customer-service-query"
          type="search"
          value={viewModel.filters.query}
          onChange={change}
          placeholder="输入类目、服务路径或服务名称"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={80}
          aria-describedby="customer-service-search-help"
        />
        {viewModel.filters.query.length > 0 ? (
          <button type="button" onClick={() => actions.onQueryChange("")}>
            清除
          </button>
        ) : null}
      </div>
      <small id="customer-service-search-help">
        仅筛选当前城市已加载的正式服务目录
        {queryChanging ? "，正在更新结果" : ""}
      </small>
    </form>
  );
}

export function DiscoveryCategoryFilter({
  viewModel,
  actions,
}: CustomerDiscoveryComponentProps) {
  return (
    <section
      className="xlb-discovery-categories"
      data-discovery-component="category-filter"
      aria-labelledby="customer-service-category-title"
    >
      <h2 id="customer-service-category-title">按类目筛选</h2>
      <div role="group" aria-label="服务类目" className="xlb-discovery-category-list">
        <button
          type="button"
          aria-pressed={viewModel.filters.categoryId === null}
          onClick={() => actions.onCategoryChange(null)}
        >
          全部
          <span>{viewModel.totalAvailable}</span>
        </button>
        {viewModel.categories.map((category) => (
          <button
            type="button"
            key={category.categoryId}
            aria-pressed={viewModel.filters.categoryId === category.categoryId}
            onClick={() => actions.onCategoryChange(category.categoryId)}
          >
            {category.name}
            <span>{category.resultCount}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DiscoveryResultCount({
  viewModel,
  queryChanging,
}: CustomerDiscoveryComponentProps) {
  return (
    <div
      className="xlb-discovery-result-count"
      data-discovery-component="result-count"
      role="status"
      aria-live="polite"
      aria-busy={queryChanging || undefined}
    >
      <strong>{viewModel.results.length}</strong>
      <span>项服务</span>
      {viewModel.filters.categoryId !== null || viewModel.filters.query.trim().length > 0 ? (
        <small>（已从 {viewModel.totalAvailable} 项中筛选）</small>
      ) : null}
    </div>
  );
}

export function DiscoveryServiceResultList({
  viewModel,
  actions,
}: CustomerDiscoveryComponentProps) {
  if (viewModel.results.length === 0) {
    return (
      <section
        className="xlb-discovery-no-match"
        data-discovery-component="service-result-list"
        role="status"
      >
        <h2>没有匹配的服务</h2>
        <p>换一个正式服务名称，或清除当前筛选后再试。</p>
        <CustomerButton variant="secondary" onClick={actions.onClear}>
          清除筛选
        </CustomerButton>
      </section>
    );
  }

  return (
    <section
      className="xlb-discovery-results"
      data-discovery-component="service-result-list"
      aria-label="服务结果"
    >
      <ul>
        {viewModel.results.map((service) => (
          <li key={service.skuId}>
            <button
              type="button"
              onClick={() => actions.onOpenSku(service.skuId)}
              aria-label={`查看${service.name}服务详情`}
            >
              <span className="xlb-discovery-service__path">{service.pathLabel}</span>
              <strong>{service.name}</strong>
              <span className="xlb-discovery-service__meta">
                服务单位：{service.unit}
              </span>
              <span className="xlb-discovery-service__action" aria-hidden="true">
                查看详情
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DiscoveryCatalogScopeNote(_props: CustomerDiscoveryComponentProps) {
  return (
    <aside
      className="xlb-discovery-scope-note"
      data-discovery-component="catalog-scope-note"
    >
      页面仅展示当前城市正式目录中的可用服务；服务详情与计价信息以进入详情后读取的正式接口为准。
    </aside>
  );
}
