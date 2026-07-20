import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair,
  BellSimple,
  BugBeetle,
  CaretDown,
  DesktopTower,
  Drop,
  Hammer,
  HandHeart,
  HouseLine,
  Leaf,
  Lightning,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Pipe,
  ShieldCheck,
  Star,
  Toolbox,
  Truck,
  TShirt,
  WashingMachine,
  Wrench,
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
  ServiceCard,
} from "@xlb/ui";
import { CITY_OPTIONS, CustomerLoadable, CustomerRouteShell } from "./customerPageShell";
import {
  type CustomerCategoryIconKey,
  catalogToHomeCategoryViewModels,
  cityAreaByCode,
  cityNameByCode,
  featuredHomeSkus,
} from "../adapters/catalogAdapters";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";

type City = CityCode;

const categoryIcons: Readonly<Record<CustomerCategoryIconKey, ReactNode>> = {
  "home-cleaning": <HouseLine size={30} weight="duotone" />,
  "appliance-cleaning": <WashingMachine size={30} weight="duotone" />,
  "appliance-repair": <Wrench size={30} weight="duotone" />,
  installation: <Toolbox size={30} weight="duotone" />,
  pipe: <Pipe size={30} weight="duotone" />,
  lock: <LockKey size={30} weight="duotone" />,
  utilities: <Lightning size={30} weight="duotone" />,
  waterproofing: <Drop size={30} weight="duotone" />,
  furniture: <Armchair size={30} weight="duotone" />,
  renovation: <Hammer size={30} weight="duotone" />,
  moving: <Truck size={30} weight="duotone" />,
  "air-quality": <Leaf size={30} weight="duotone" />,
  digital: <DesktopTower size={30} weight="duotone" />,
  laundry: <TShirt size={30} weight="duotone" />,
  care: <HandHeart size={30} weight="duotone" />,
  "pest-control": <BugBeetle size={30} weight="duotone" />,
};

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
        <BellSimple size={28} weight="regular" aria-hidden="true" />
        {unreadCount > 0 ? <span>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
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
      areaLabel={cityAreaByCode[cityCode]}
      placeholder="搜索全部上门服务"
      locationIcon={<MapPin size={18} weight="fill" />}
      disclosureIcon={<CaretDown size={14} />}
      searchIcon={<MagnifyingGlass size={20} />}
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
                    <span className="customer-home-category__icon" aria-hidden="true">{categoryIcons[category.iconKey]}</span>
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
              <span>来自当前城市服务目录</span>
            </div>
            <div className="customer-home-featured-list">
              {quickSkus.map((sku) => (
                <ServiceCard
                  key={sku.skuId}
                  data-sku-id={sku.skuId}
                  title={sku.name}
                  subtitle={sku.subtitle}
                  priceText="查看服务"
                  actionLabel="选择"
                  onClick={() => {
                    const url = new URL("/customer/order/create", window.location.origin);
                    url.searchParams.set("skuId", sku.skuId);
                    window.location.href = url.pathname + url.search;
                  }}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="customer-home-section" aria-labelledby="customer-home-workers-title">
          <div className="customer-home-section__heading">
            <h2 id="customer-home-workers-title">服务师傅</h2>
            <span>能力展示</span>
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
                    <span className="customer-home-worker__avatar" aria-hidden="true"><Wrench size={24} weight="duotone" /></span>
                    <div>
                      <strong>{worker.displayName}</strong>
                      <div className="customer-home-worker__rating" aria-label={worker.averageRating === null ? "暂无公开评分" : `评分 ${worker.averageRating}，共 ${worker.ratingCount} 条评价`}>
                        <Star size={15} weight={worker.averageRating === null ? "regular" : "fill"} aria-hidden="true" />
                        <span>{worker.averageRating === null ? "暂无评分" : `${worker.averageRating.toFixed(1)} · ${worker.ratingCount}条评价`}</span>
                      </div>
                      <p>{worker.skillCategoryNames.join(" · ") || "后台暂未登记服务技能"}</p>
                    </div>
                    <span className="customer-home-worker__certification"><ShieldCheck size={16} weight="fill" aria-hidden="true" />{worker.certificationLabel}</span>
                  </article>
                ))}
              </div>
              <p className="customer-home-worker__disclosure">{workerShowcaseState.data.disclosure}</p>
            </>
          ) : null}
        </section>
      </CustomerHomeTemplate>
    </CustomerRouteShell>
  );
}
