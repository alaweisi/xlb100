import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellSimple,
  CaretDown,
  CaretRight,
  ClipboardText,
  IdentificationCard,
  MagnifyingGlass,
  MapPin,
  ShieldCheck,
  Star,
  Tag,
} from "@phosphor-icons/react";
import type {
  CatalogSnapshot,
  CityCode,
  CustomerWorkerShowcaseResponse,
  NotificationUnreadCountResponse,
} from "@xlb/types";
import {
  Button,
  CustomerHomeTemplate,
  EmptyState,
  ErrorState,
  LoadingState,
  LocationSearchBar,
} from "@xlb/ui";
import { CITY_OPTIONS, CustomerLoadable, CustomerRouteShell } from "./customerPageShell";
import {
  type CustomerCategoryIconKey,
  catalogToHomeCategoryViewModels,
  cityNameByCode,
  featuredHomeSkus,
} from "../adapters/catalogAdapters";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";

type City = CityCode;

const categoryIconSrc: Readonly<Record<CustomerCategoryIconKey, string>> = {
  "home-cleaning": "/assets/home/categories/home-cleaning.png",
  "appliance-cleaning": "/assets/home/categories/appliance-cleaning.png",
  "appliance-repair": "/assets/home/categories/appliance-repair.png",
  installation: "/assets/home/categories/installation.png",
  pipe: "/assets/home/categories/pipe.png",
  lock: "/assets/home/categories/lock.png",
  utilities: "/assets/home/categories/utilities.png",
  waterproofing: "/assets/home/categories/waterproofing.png",
  furniture: "/assets/home/categories/furniture.png",
  renovation: "/assets/home/categories/renovation.png",
  moving: "/assets/home/categories/moving.png",
  "air-quality": "/assets/home/categories/air-quality.png",
  digital: "/assets/home/categories/digital.png",
  laundry: "/assets/home/categories/laundry.png",
  care: "/assets/home/categories/care.png",
  "pest-control": "/assets/home/categories/pest-control.png",
};

const featuredImageBySkuId: Readonly<Record<string, string>> = {
  sku_home_daily_2h: "/assets/home/recommendations/home-cleaning.png",
  sku_ac_wall_basic: "/assets/home/recommendations/appliance-cleaning.png",
  sku_lock_unlock_standard: "/assets/home/recommendations/lock-service.png",
};

const fallbackFeaturedImages = [
  "/assets/home/recommendations/home-cleaning.png",
  "/assets/home/recommendations/appliance-cleaning.png",
  "/assets/home/recommendations/lock-service.png",
] as const;

function HomeTopBar({ unreadState }: { unreadState: CustomerLoadable<number> }) {
  const unreadCount = unreadState.status === "success" ? unreadState.data : 0;
  const label = unreadState.status === "error"
    ? "打开消息中心，未读数量暂时无法读取"
    : unreadCount > 0
      ? `打开消息中心，${unreadCount} 条未读消息`
      : "打开消息中心，暂无未读消息";

  return (
    <header className="customer-home-topbar">
      <div className="customer-home-brand">
        <strong>喜乐帮</strong>
        <span>安心到家，服务就在身边</span>
      </div>
      <a className="customer-home-notifications" href="/customer/notifications" aria-label={label}>
        <BellSimple size={30} weight="regular" aria-hidden="true" />
        {unreadCount > 0 ? <span aria-hidden="true" /> : null}
      </a>
    </header>
  );
}

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
    <LocationSearchBar
      cityLabel={cityNameByCode[cityCode]}
      placeholder="搜索全部上门服务"
      locationIcon={<span className="customer-home-location-icon"><MapPin size={16} weight="fill" /></span>}
      disclosureIcon={<CaretDown size={12} />}
      searchIcon={<MagnifyingGlass size={20} />}
      searchIconPlacement="start"
      value={searchQuery}
      onSearchChange={onSearchChange}
      onSearchSubmit={onSearchSubmit}
      onCityClick={() => {
        const nextIndex = (CITY_OPTIONS.indexOf(cityCode) + 1) % CITY_OPTIONS.length;
        onCityChange(CITY_OPTIONS[nextIndex]);
      }}
    />
  );
}

export interface CustomerHomeApi {
  getNotificationUnreadCount(): Promise<NotificationUnreadCountResponse>;
  listWorkerShowcase(): Promise<CustomerWorkerShowcaseResponse>;
}

export interface CustomerHomePageProps {
  api: CustomerHomeApi;
  cityCode: City;
  catalogState: CustomerLoadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}

export function CustomerHomePage({ api, cityCode, catalogState, onRetryCatalog }: CustomerHomePageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadState, setUnreadState] = useState<CustomerLoadable<number>>({ status: "loading" });
  const [workerShowcaseState, setWorkerShowcaseState] = useState<CustomerLoadable<CustomerWorkerShowcaseResponse>>({ status: "loading" });
  const binding = createCustomerUiBinding({ route: "home", cityCode });

  const categories = useMemo(() => {
    if (catalogState.status !== "success") return [];
    return catalogToHomeCategoryViewModels(catalogState.data);
  }, [catalogState]);

  const quickSkus = useMemo(() => {
    if (catalogState.status !== "success") return [];
    return featuredHomeSkus(catalogState.data);
  }, [catalogState]);

  const loadWorkerShowcase = useCallback(() => {
    let active = true;
    setWorkerShowcaseState({ status: "loading" });
    void api.listWorkerShowcase()
      .then((response) => {
        if (active) setWorkerShowcaseState({ status: "success", data: response });
      })
      .catch((error: unknown) => {
        if (active) setWorkerShowcaseState({ status: "error", error: error instanceof Error ? error.message : "worker showcase unavailable" });
      });
    return () => { active = false; };
  }, [api]);

  useEffect(() => loadWorkerShowcase(), [loadWorkerShowcase]);

  useEffect(() => {
    let active = true;
    setUnreadState({ status: "loading" });
    void api.getNotificationUnreadCount()
      .then((response) => {
        if (active) setUnreadState({ status: "success", data: response.unreadCount });
      })
      .catch((error: unknown) => {
        if (active) setUnreadState({ status: "error", error: error instanceof Error ? error.message : "notification count unavailable" });
      });
    return () => { active = false; };
  }, [api]);

  const onCityChange = (next: City) => {
    window.location.href = `/customer/?${new URLSearchParams({ cityCode: next }).toString()}`;
  };

  function navigateToServices(query: string) {
    const trimmed = query.trim();
    const params = new URLSearchParams({ cityCode });
    if (trimmed) params.set("q", trimmed);
    window.location.href = `/customer/services?${params.toString()}`;
  }

  return (
    <CustomerRouteShell currentRoute="home" topBar={<HomeTopBar unreadState={unreadState} />}>
      <CustomerHomeTemplate route="/customer/" cityCode={cityCode} binding={binding}>
        <HomeHeader
          cityCode={cityCode}
          onCityChange={onCityChange}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={navigateToServices}
        />

        {catalogState.status === "loading" ? <LoadingState title="服务目录加载中" description="正在读取当前城市可预约的服务" /> : null}
        {catalogState.status === "error" ? (
          <ErrorState
            title="服务目录加载失败"
            description="网络异常，请稍后重试"
            action={<Button type="button" onClick={onRetryCatalog}>重试</Button>}
          />
        ) : null}
        {catalogState.status === "success" && catalogState.data.categories.length === 0 ? (
          <EmptyState title="暂无服务目录" description="当前城市暂无可预约服务，请稍后再试" />
        ) : null}

        {catalogState.status === "success" && categories.length > 0 ? (
          <section className="customer-home-section" aria-labelledby="customer-home-categories-title">
            <div className="customer-home-section__heading">
              <h2 id="customer-home-categories-title">全部服务</h2>
              <a href={`/customer/services?${new URLSearchParams({ cityCode }).toString()}`}>查看全部</a>
            </div>
            <div className="customer-home-category-grid">
              {categories.map((category) => {
                const params = new URLSearchParams({ cityCode, categoryId: category.categoryId });
                return (
                  <a
                    className="customer-home-category"
                    href={`/customer/services?${params.toString()}`}
                    key={category.categoryId}
                    aria-label={`${category.categoryName}，查看真实服务清单`}
                  >
                    <img
                      className="customer-home-category__image"
                      src={categoryIconSrc[category.iconKey]}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                    />
                    <span>{category.label}</span>
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}

        {catalogState.status === "success" && quickSkus.length > 0 ? (
          <section className="customer-home-section" aria-labelledby="customer-home-featured-title">
            <div className="customer-home-section__heading">
              <h2 id="customer-home-featured-title">推荐服务</h2>
              <a href={`/customer/services?${new URLSearchParams({ cityCode }).toString()}`}>更多<CaretRight size={16} aria-hidden="true" /></a>
            </div>
            <div className="customer-home-featured-list">
              {quickSkus.map((sku, index) => {
                const category = categories.find((item) => item.categoryId === sku.categoryId);
                const params = new URLSearchParams({ skuId: sku.skuId });
                return (
                  <a
                    className="customer-home-featured-card"
                    data-sku-id={sku.skuId}
                    href={`/customer/order/create?${params.toString()}`}
                    key={sku.skuId}
                  >
                    <span className="customer-home-featured-card__media">
                      <img
                        src={featuredImageBySkuId[sku.skuId] ?? fallbackFeaturedImages[index % fallbackFeaturedImages.length]}
                        alt=""
                        loading="lazy"
                      />
                      {category ? <img className="customer-home-featured-card__badge" src={categoryIconSrc[category.iconKey]} alt="" aria-hidden="true" /> : null}
                    </span>
                    <span className="customer-home-featured-card__body">
                      <strong>{sku.name}</strong>
                      <span className="customer-home-featured-card__category">{sku.categoryName}</span>
                      <span className="customer-home-featured-card__action">查看服务<CaretRight size={16} aria-hidden="true" /></span>
                    </span>
                  </a>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="customer-home-section" aria-labelledby="customer-home-workers-title">
          <div className="customer-home-section__heading">
            <h2 id="customer-home-workers-title">本城师傅</h2>
            <span>仅展示能力</span>
          </div>
          {workerShowcaseState.status === "loading" ? <LoadingState title="师傅能力加载中" /> : null}
          {workerShowcaseState.status === "error" ? (
            <ErrorState
              title="师傅能力暂时无法读取"
              description="该区域不会展示虚构数据。"
              action={<Button type="button" onClick={() => loadWorkerShowcase()}>重试</Button>}
            />
          ) : null}
          {workerShowcaseState.status === "success" && workerShowcaseState.data.items.length === 0 ? (
            <EmptyState title="暂无可展示师傅" description="有符合平台条件的师傅后会显示在这里。" />
          ) : null}
          {workerShowcaseState.status === "success" && workerShowcaseState.data.items.length > 0 ? (
            <>
              <div className="customer-home-worker-list" aria-label="师傅能力展示列表">
                {workerShowcaseState.data.items.map((worker) => (
                  <article className="customer-home-worker" key={worker.showcaseId}>
                    <img className="customer-home-worker__avatar" src="/assets/home/workers/service-worker.png" alt="" aria-hidden="true" loading="lazy" />
                    <div className="customer-home-worker__content">
                      <strong>{worker.displayName}</strong>
                      <div className="customer-home-worker__meta">
                        <span className="customer-home-worker__certification"><ShieldCheck size={14} weight="fill" aria-hidden="true" />{worker.certificationLabel}</span>
                        <span className="customer-home-worker__rating" aria-label={worker.averageRating === null ? "暂无公开评分" : `评分 ${worker.averageRating}，共 ${worker.ratingCount} 条评价`}>
                          <Star size={13} weight={worker.averageRating === null ? "regular" : "fill"} aria-hidden="true" />
                          {worker.averageRating === null ? "暂无" : worker.averageRating.toFixed(1)}
                        </span>
                      </div>
                      <p>{worker.skillCategoryNames.join(" · ") || "后台暂未登记服务技能"}</p>
                    </div>
                  </article>
                ))}
              </div>
              <p className="customer-home-worker__disclosure" aria-label={workerShowcaseState.data.disclosure}>仅展示技能与评分，订单由平台统一派单</p>
            </>
          ) : null}
        </section>

        <section className="customer-home-assurance" aria-label="平台服务保障">
          <div className="customer-home-assurance__items">
            <span><IdentificationCard size={16} weight="duotone" aria-hidden="true" />实名认证</span>
            <span><Tag size={16} weight="duotone" aria-hidden="true" />价格透明</span>
            <span><ClipboardText size={16} weight="duotone" aria-hidden="true" />服务留痕</span>
            <span><ShieldCheck size={16} weight="duotone" aria-hidden="true" />售后保障</span>
          </div>
          <p>{cityNameByCode[cityCode]}服务已开通</p>
        </section>
      </CustomerHomeTemplate>
    </CustomerRouteShell>
  );
}
