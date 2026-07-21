import { type FormEvent, useMemo, useState } from "react";
import {
  Bell,
  CaretDown,
  CaretRight,
  ClipboardText,
  IdentificationCard,
  MagnifyingGlass,
  MapPin,
  ShieldCheck,
  Tag,
} from "@phosphor-icons/react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { RuntimeThemeSurface } from "@xlb/ui";
import { CUSTOMER_SERVICE_CATEGORY_ASSETS } from "../assets/serviceCategoryAssets";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { assignCustomerDeepLink, buildCustomerDeepLink } from "../routes/customerDeepLinks";
import { CITY_OPTIONS, type CustomerLoadable } from "./customerPageShell";
import "./customer-home.css";

type City = CityCode;
type CatalogCategory = CatalogSnapshot["categories"][number];

const CITY_NAMES: Readonly<Record<City, string>> = {
  hangzhou: "杭州",
  shanghai: "上海",
  beijing: "北京",
};

const CITY_AREAS: Readonly<Record<City, string>> = {
  hangzhou: "西湖区",
  shanghai: "静安区",
  beijing: "朝阳区",
};

const TRUST_ITEMS = [
  { label: "实名认证", Icon: IdentificationCard },
  { label: "价格透明", Icon: Tag },
  { label: "服务留痕", Icon: ClipboardText },
  { label: "售后保障", Icon: ShieldCheck },
] as const;

const CATEGORY_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "家庭保洁": "家庭保洁",
  "家电清洗": "家电清洗",
  "家电维修": "家电维修",
  "上门安装": "上门安装",
  "管道疏通": "管道疏通",
  "开锁换锁": "开锁换锁",
  "水电维修": "水电维修",
  "防水补漏/精准测漏": "防水补漏",
  "家具家居维修保养": "家具维修",
  "房屋修缮/局部改造": "房屋修缮",
  "搬家搬运/拆旧清运": "搬家清运",
  "甲醛检测治理": "甲醛治理",
  "数码办公维修": "数码维修",
  "洗衣洗鞋": "洗衣洗鞋",
  "保姆月嫂/照护": "保姆照护",
  "四害消杀": "四害消杀",
};

function nextCity(cityCode: City): City {
  const nextIndex = (CITY_OPTIONS.indexOf(cityCode) + 1) % CITY_OPTIONS.length;
  return CITY_OPTIONS[nextIndex] ?? CITY_OPTIONS[0];
}

function SectionHeading({
  id,
  title,
  actionLabel,
  onAction,
}: {
  id: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="customer-home__section-heading">
      <h2 id={id}>{title}</h2>
      {actionLabel && onAction ? (
        <button className="customer-home__section-action" type="button" onClick={onAction}>
          <span>{actionLabel}</span>
          <CaretRight aria-hidden="true" weight="bold" />
        </button>
      ) : null}
    </div>
  );
}

function CategoryGrid({
  categories,
  onOpenCategory,
}: {
  categories: CatalogCategory[];
  onOpenCategory: (categoryName: string) => void;
}) {
  const categoryByName = useMemo(
    () => new Map(categories.map((category) => [category.name, category])),
    [categories],
  );
  const availableCategories = CUSTOMER_SERVICE_CATEGORY_ASSETS.flatMap((asset) => {
    const category = categoryByName.get(asset.categoryName);
    return category ? [{ asset, category }] : [];
  });

  return (
    <div className="customer-home__category-grid" aria-label="全部服务类目">
      {availableCategories.map(({ asset, category }) => (
        <button
          className="customer-home__category-card"
          key={category.categoryId}
          type="button"
          onClick={() => onOpenCategory(category.name)}
          aria-label={`查看${category.name}服务`}
        >
          <img
            src={asset.src}
            alt={asset.alt}
            width={asset.width}
            height={asset.height}
            loading="eager"
          />
          <span className="customer-home__category-label" aria-hidden="true">
            {CATEGORY_DISPLAY_NAMES[category.name] ?? category.name}
          </span>
          <span className="customer-home__visually-hidden">{category.name}</span>
        </button>
      ))}
    </div>
  );
}

function CatalogLoading() {
  return (
    <div className="customer-home__category-grid" aria-label="服务类目正在加载" aria-busy="true">
      {CUSTOMER_SERVICE_CATEGORY_ASSETS.map((asset) => (
        <div className="customer-home__category-card customer-home__category-card--loading" key={asset.categoryName}>
          <span className="customer-home__skeleton customer-home__skeleton--image" />
          <span className="customer-home__skeleton customer-home__skeleton--label" />
        </div>
      ))}
    </div>
  );
}

function HonestState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="customer-home__honest-state" role="status">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export interface CustomerHomePageProps {
  cityCode: City;
  catalogState: CustomerLoadable<CatalogSnapshot>;
  onRetryCatalog: () => void;
}

export function CustomerHomePage({ cityCode, catalogState, onRetryCatalog }: CustomerHomePageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const binding = createCustomerUiBinding({ route: "home", cityCode });

  function navigateToServices(query = "") {
    const trimmed = query.trim();
    assignCustomerDeepLink("services", { cityCode, q: trimmed || null });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateToServices(searchQuery);
  }

  const catalogIsEmpty =
    catalogState.status === "success" && catalogState.data.categories.length === 0;
  const availableCategoryCount = useMemo(() => {
    if (catalogState.status !== "success") return 0;
    const catalogNames = new Set(catalogState.data.categories.map((category) => category.name));
    return CUSTOMER_SERVICE_CATEGORY_ASSETS.filter((asset) => catalogNames.has(asset.categoryName)).length;
  }, [catalogState]);

  return (
    <RuntimeThemeSurface
      className="customer-home"
      binding={binding}
      style={{ display: "block", gap: 0 }}
    >
      <header className="customer-home__header">
        <div>
          <h1>喜乐帮</h1>
          <p>安心到家，服务就在身边</p>
        </div>
        <a
          className="customer-home__notification"
          href={buildCustomerDeepLink("notifications", { cityCode })}
          aria-label="查看通知"
          title="查看通知"
        >
          <Bell aria-hidden="true" weight="regular" />
          <span aria-hidden="true" />
        </a>
      </header>

      <form className="customer-home__search" role="search" onSubmit={submitSearch}>
        <button
          className="customer-home__location"
          type="button"
          onClick={() => assignCustomerDeepLink("home", { cityCode: nextCity(cityCode) })}
          aria-label={`当前城市${CITY_NAMES[cityCode]}，区域${CITY_AREAS[cityCode]}，点击切换城市`}
        >
          <MapPin aria-hidden="true" weight="fill" />
          <span>{CITY_NAMES[cityCode]} · {CITY_AREAS[cityCode]}</span>
          <CaretDown aria-hidden="true" weight="bold" />
        </button>
        <span className="customer-home__search-divider" aria-hidden="true" />
        <label className="customer-home__search-field">
          <span className="customer-home__visually-hidden">搜索全部上门服务</span>
          <MagnifyingGlass aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索全部上门服务"
          />
        </label>
      </form>

      <main className="customer-home__main">
        <section className="customer-home__section" aria-labelledby="customer-home-all-services">
          <SectionHeading
            id="customer-home-all-services"
            title="全部服务"
            actionLabel="查看全部"
            onAction={() => navigateToServices()}
          />

          {catalogState.status === "loading" || catalogState.status === "pending" ? <CatalogLoading /> : null}
          {catalogState.status === "error" ? (
            <HonestState
              title="服务目录暂时没有加载成功"
              description="请检查网络后重试，已获取的数据不会被伪造或补齐。"
              actionLabel="重新加载"
              onAction={onRetryCatalog}
            />
          ) : null}
          {catalogIsEmpty ? (
            <HonestState
              title="当前城市暂未开放服务"
              description="我们会在服务目录正式开放后第一时间呈现。"
            />
          ) : null}
          {catalogState.status === "success" && !catalogIsEmpty && availableCategoryCount > 0 ? (
            <CategoryGrid categories={catalogState.data.categories} onOpenCategory={navigateToServices} />
          ) : null}
          {catalogState.status === "success" && !catalogIsEmpty && availableCategoryCount === 0 ? (
            <HonestState
              title="当前目录暂不可展示"
              description="目录与正式服务类目尚未对齐，我们不会用临时类目替代。"
              actionLabel="重新加载"
              onAction={onRetryCatalog}
            />
          ) : null}
          {catalogState.status === "success" && availableCategoryCount > 0 && availableCategoryCount < CUSTOMER_SERVICE_CATEGORY_ASSETS.length ? (
            <p className="customer-home__partial-note" role="status">
              当前已开放 {availableCategoryCount} 项正式服务，其余类目将在目录开放后显示。
            </p>
          ) : null}
        </section>

        <section className="customer-home__section" aria-labelledby="customer-home-recommended">
          <SectionHeading
            id="customer-home-recommended"
            title="推荐服务"
            actionLabel="更多"
            onAction={() => navigateToServices()}
          />
          <HonestState
            title="推荐服务即将上线"
            description="当前暂无权威推荐数据，你可以先浏览全部服务。"
            actionLabel="浏览服务"
            onAction={() => navigateToServices()}
          />
        </section>

        <section className="customer-home__section" aria-labelledby="customer-home-nearby">
          <SectionHeading id="customer-home-nearby" title="附近师傅" />
          <HonestState
            title="附近师傅信息暂未开放"
            description="距离、认证和可接单状态将在权威接口接入后展示。"
          />
        </section>

        <section className="customer-home__trust" aria-label="平台服务保障">
          {TRUST_ITEMS.map(({ label, Icon }) => (
            <div key={label}>
              <Icon aria-hidden="true" weight="regular" />
              <span>{label}</span>
            </div>
          ))}
          <p>杭州服务已开通</p>
        </section>
      </main>
    </RuntimeThemeSurface>
  );
}
