import { useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import {
  Broom,
  CaretDown,
  CircleNotch,
  Hammer,
  Headset,
  Heart,
  MagnifyingGlass,
  MapPin,
  ShieldCheck,
  Truck,
  Wrench,
  ArrowClockwise,
  ArrowRight,
} from "@phosphor-icons/react";
import { CITY_OPTIONS, CustomerLoadable, CustomerRouteShell } from "./customerPageShell";
import { cityDisplayLabel, representativeHomeSkus } from "../adapters/catalogAdapters";

type City = CityCode;

export interface CustomerHomePageProps {
  cityCode: City;
  catalogState: CustomerLoadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}

export function CustomerHomePage({ cityCode, catalogState, onRetryCatalog }: CustomerHomePageProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const quickSkus = useMemo(() => {
    if (catalogState.status !== "success") return [];
    return representativeHomeSkus(catalogState.data);
  }, [catalogState]);

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
      <section className="customer-home" aria-label="顾客首页">
        <div className="customer-home-hero">
          <button
            aria-label={`当前城市 ${cityDisplayLabel(cityCode)}，点击切换城市`}
            className="customer-location-inline"
            onClick={() => {
              const nextIndex = (CITY_OPTIONS.indexOf(cityCode) + 1) % CITY_OPTIONS.length;
              onCityChange(CITY_OPTIONS[nextIndex]);
            }}
            type="button"
          >
            <MapPin size={17} weight="regular" />
            <span>{cityDisplayLabel(cityCode)}</span>
            <CaretDown size={13} weight="fill" />
          </button>

          <div className="customer-home-title-row">
            <div>
              <h1>安心到家修缮</h1>
            </div>
            <ShieldCheck aria-label="平台保障" size={42} weight="regular" />
          </div>

          <form
            className="customer-location-search-glass"
            onSubmit={(event) => {
              event.preventDefault();
              navigateToServices(searchQuery);
            }}
          >
            <button aria-label="提交搜索" className="customer-search-icon-submit" type="submit">
              <MagnifyingGlass aria-hidden="true" size={24} weight="regular" />
            </button>
            <input
              aria-label="搜索服务"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="输入服务名称或关键词"
              value={searchQuery}
            />
          </form>
        </div>

        {catalogState.status === "success" && quickSkus.length > 0 ? (
          <>
            <section aria-label="可用服务" className="customer-service-grid">
              {quickSkus.slice(0, 8).map((sku, index) => {
                const Icon = [Broom, Wrench, Hammer, Truck, Wrench, Hammer, Wrench, ShieldCheck][index] ?? Wrench;
                return (
                  <button
                    aria-label={`选择${sku.name}`}
                    className="customer-service-card"
                    key={sku.skuId}
                    onClick={() => {
                      const url = new URL("/customer/order/create", window.location.origin);
                      url.searchParams.set("skuId", sku.skuId);
                      window.location.href = url.pathname + url.search;
                    }}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={36} weight="regular" />
                    <strong>{sku.categoryName}</strong>
                  </button>
                );
              })}
            </section>
            <section className="customer-home-state customer-home-coverage">
              <span className="customer-coverage-badge">本地服务</span>
              <h2>{cityDisplayLabel(cityCode)}服务已开放</h2>
              <p>当前可预约 {catalogState.data.categories.length} 类正式服务，具体项目以实时目录为准。</p>
              <button aria-label="查看全部服务" className="customer-coverage-action" onClick={() => navigateToServices("")} type="button">
                <ArrowRight size={23} weight="bold" />
              </button>
            </section>

            <section aria-label="推荐服务" className="customer-featured-section">
              <h2>推荐服务</h2>
              <button
                className="customer-featured-service"
                onClick={() => {
                  const url = new URL("/customer/order/create", window.location.origin);
                  url.searchParams.set("skuId", quickSkus[0].skuId);
                  window.location.href = url.pathname + url.search;
                }}
                type="button"
              >
                <span className="customer-featured-icon"><Wrench size={30} weight="regular" /></span>
                <span className="customer-featured-copy">
                  <strong>{quickSkus[0].name}</strong>
                  <small>{quickSkus[0].categoryPathLabel}</small>
                  <em>{cityDisplayLabel(cityCode)}可预约 · 服务单位：{quickSkus[0].unit}</em>
                </span>
                <ArrowRight className="customer-featured-arrow" size={21} weight="bold" />
              </button>
            </section>
          </>
        ) : null}

        {catalogState.status === "loading" ? (
          <section aria-busy="true" className="customer-home-state customer-home-loading">
            <CircleNotch aria-hidden="true" className="customer-state-spinner" size={30} weight="bold" />
            <h2>服务目录加载中</h2>
            <p>正在读取当前城市可用服务</p>
          </section>
        ) : null}

        {catalogState.status === "error" ? (
          <section className="customer-home-state" role="alert">
            <MapPin aria-hidden="true" size={54} weight="thin" />
            <h2>服务目录加载失败</h2>
            <p>{catalogState.error}</p>
            <button className="customer-retry-button" onClick={onRetryCatalog} type="button">
              <ArrowClockwise size={20} weight="bold" />重试
            </button>
          </section>
        ) : null}

        {catalogState.status === "success" && catalogState.data.categories.length === 0 ? (
          <section className="customer-home-state">
            <MapPin aria-hidden="true" size={58} weight="thin" />
            <h2>当前城市暂无可用服务，请稍后重试</h2>
            <p>我们正在为你拓展更多优质服务，敬请期待</p>
            <button className="customer-retry-button" onClick={onRetryCatalog} type="button">
              <ArrowClockwise size={20} weight="bold" />刷新重试
            </button>
          </section>
        ) : null}

        <section aria-label="平台保障" className="customer-trust-section">
          <h2>平台保障</h2>
          <div className="customer-trust-strip">
          <span><ShieldCheck size={21} weight="regular" /><span><strong>实名认证</strong><small>服务更安心</small></span></span>
          <span><Heart size={21} weight="regular" /><span><strong>严格筛选</strong><small>专业平台认证</small></span></span>
          <span><Headset size={21} weight="regular" /><span><strong>售后保障</strong><small>问题快速响应</small></span></span>
          </div>
        </section>

        <section aria-label="客服协助" className="customer-assistance-card">
          <Headset aria-hidden="true" size={29} weight="regular" />
          <span>
            <strong>没有找到合适的服务？</strong>
            <small>客服可协助确认服务类目与预约流程</small>
          </span>
          <a href="/customer/support">咨询客服 <ArrowRight size={16} weight="bold" /></a>
        </section>
      </section>
    </CustomerRouteShell>
  );
}
