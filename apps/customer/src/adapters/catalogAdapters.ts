import type { CatalogSnapshot, CityCode, ServiceItem, ServiceSku } from "@xlb/types";

export interface CatalogSkuViewModel {
  skuId: string;
  categoryId: string;
  categoryName: string;
  itemName: string;
  name: string;
  unit: string;
  categoryPathLabel: string;
  subtitle: string;
}

export interface CatalogSkuDisplayModel {
  title: string;
  subtitle: string;
  optionLabel: string;
}

export interface CatalogCategoryViewModel {
  categoryId: string;
  categoryName: string;
  label: string;
  iconKey: CustomerCategoryIconKey;
  examples: string;
}

export type CustomerCategoryIconKey =
  | "home-cleaning"
  | "appliance-cleaning"
  | "appliance-repair"
  | "installation"
  | "pipe"
  | "lock"
  | "utilities"
  | "waterproofing"
  | "furniture"
  | "renovation"
  | "moving"
  | "air-quality"
  | "digital"
  | "laundry"
  | "care"
  | "pest-control";

type CatalogCategory = CatalogSnapshot["categories"][number];
type CatalogItem = ServiceItem & CatalogCategory["items"][number];

export const cityAreaByCode: Record<CityCode, string> = {
  hangzhou: "西湖区",
  shanghai: "静安区",
  beijing: "朝阳区",
};

export const cityNameByCode: Record<CityCode, string> = { hangzhou: "杭州", shanghai: "上海", beijing: "北京" };

export const cityDisplayLabel = (cityCode: CityCode): string => `${cityNameByCode[cityCode]} · ${cityAreaByCode[cityCode] ?? "市中心"}`;

const fallbackCategoryOrder = [
  "家庭保洁",
  "家电清洗",
  "家电维修",
  "上门安装",
  "管道疏通",
  "开锁换锁",
  "水电维修",
  "搬家搬运/拆旧清运",
  "四害消杀",
  "甲醛检测治理",
  "洗衣洗鞋",
  "家具家居维修保养",
  "房屋修缮/局部改造",
  "防水补漏/精准测漏",
  "保姆月嫂/照护",
  "数码办公维修",
];

const customerCategoryPresentation: Readonly<Record<string, { label: string; iconKey: CustomerCategoryIconKey }>> = {
  "家庭保洁": { label: "家庭保洁", iconKey: "home-cleaning" },
  "家电清洗": { label: "家电清洗", iconKey: "appliance-cleaning" },
  "家电维修": { label: "家电维修", iconKey: "appliance-repair" },
  "上门安装": { label: "上门安装", iconKey: "installation" },
  "管道疏通": { label: "管道疏通", iconKey: "pipe" },
  "开锁换锁": { label: "开锁换锁", iconKey: "lock" },
  "水电维修": { label: "水电维修", iconKey: "utilities" },
  "防水补漏/精准测漏": { label: "防水补漏", iconKey: "waterproofing" },
  "家具家居维修保养": { label: "家具维修", iconKey: "furniture" },
  "房屋修缮/局部改造": { label: "房屋修缮", iconKey: "renovation" },
  "搬家搬运/拆旧清运": { label: "搬家清运", iconKey: "moving" },
  "甲醛检测治理": { label: "甲醛治理", iconKey: "air-quality" },
  "数码办公维修": { label: "数码维修", iconKey: "digital" },
  "洗衣洗鞋": { label: "洗衣洗鞋", iconKey: "laundry" },
  "保姆月嫂/照护": { label: "保姆照护", iconKey: "care" },
  "四害消杀": { label: "四害消杀", iconKey: "pest-control" },
};

function dedupe(parts: Array<string | undefined>): string[] {
  const values = parts.filter(Boolean).map((item) => item!.trim()).filter(Boolean);
  const deduped: string[] = [];
  for (const value of values) {
    if (!deduped.includes(value)) {
      deduped.push(value);
    }
  }
  return deduped;
}

function dedupeDisplayText(parts: Array<string | undefined>): string[] {
  const values = parts
    .filter(Boolean)
    .map((item) => item!.trim())
    .filter(Boolean);
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    deduped.push(value);
    seen.add(key);
  }

  return deduped;
}

function catalogItemToSku(
  categoryName: string,
  itemName: string,
  catalogItem: ServiceSku,
  categoryId: string,
): CatalogSkuViewModel {
  return {
    skuId: catalogItem.skuId,
    categoryId,
    categoryName,
    itemName,
    name: catalogItem.name,
    unit: catalogItem.unit,
    categoryPathLabel: dedupe([categoryName, itemName]).join(" · "),
    subtitle: dedupe([categoryName, itemName, catalogItem.unit]).join(" · "),
  };
}

export function getCatalogSkus(catalog?: CatalogSnapshot): CatalogSkuViewModel[] {
  if (!catalog) return [];
  return catalog.categories.flatMap((category) =>
    (category.items as CatalogItem[]).flatMap((item) =>
      item.skus.map((sku) => catalogItemToSku(category.name, item.name, sku, category.categoryId)),
    ),
  );
}

export function getCatalogSkuDisplayLabel(sku: CatalogSkuViewModel): CatalogSkuDisplayModel {
  return {
    title: sku.name,
    subtitle: dedupeDisplayText([sku.categoryPathLabel, sku.unit]).join(" / "),
    optionLabel: dedupeDisplayText([sku.name, sku.categoryPathLabel, sku.unit]).join(" / "),
  };
}

export function dedupeCatalogSkusByName(skus: CatalogSkuViewModel[]): CatalogSkuViewModel[] {
  const map = new Map<string, CatalogSkuViewModel>();
  for (const sku of skus) {
    const key = sku.name.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, sku);
    }
  }
  return Array.from(map.values());
}

export function orderedHomeCategories(catalog: CatalogSnapshot): CatalogCategory[] {
  const byName = new Map(catalog.categories.map((category) => [category.name, category]));
  const ordered = fallbackCategoryOrder
    .map((name) => byName.get(name))
    .filter((category): category is CatalogCategory => Boolean(category));
  const remaining = catalog.categories.filter((category) => !fallbackCategoryOrder.includes(category.name));
  return [...ordered, ...remaining];
}

export function catalogToHomeCategoryViewModels(catalog: CatalogSnapshot): CatalogCategoryViewModel[] {
  return orderedHomeCategories(catalog).map((category) => {
    const presentation = customerCategoryPresentation[category.name] ?? {
      label: category.name,
      iconKey: "appliance-repair" as const,
    };
    return {
      categoryId: category.categoryId,
      categoryName: category.name,
      label: presentation.label,
      iconKey: presentation.iconKey,
      examples: category.items.slice(0, 3).map((item) => item.name).join("、"),
    };
  });
}

export function representativeHomeSkus(catalog: CatalogSnapshot): CatalogSkuViewModel[] {
  return orderedHomeCategories(catalog).flatMap((category) => {
    const itemWithSku = category.items.find((item) => item.skus.length > 0);
    const firstSku = itemWithSku?.skus[0];
    if (!itemWithSku || !firstSku) {
      return [];
    }

    return [
      catalogItemToSku(
        category.name,
        itemWithSku.name,
        firstSku,
        category.categoryId,
      ),
    ];
  });
}

const featuredHomeSkuIds = [
  "sku_home_daily_2h",
  "sku_ac_wall_basic",
  "sku_lock_unlock_standard",
] as const;

export function featuredHomeSkus(catalog: CatalogSnapshot): CatalogSkuViewModel[] {
  const allSkus = getCatalogSkus(catalog);
  const byId = new Map(allSkus.map((sku) => [sku.skuId, sku]));
  const featured = featuredHomeSkuIds
    .map((skuId) => byId.get(skuId))
    .filter((sku): sku is CatalogSkuViewModel => Boolean(sku));
  return featured.length > 0 ? featured : representativeHomeSkus(catalog).slice(0, 3);
}

export function toCatalogDisplayModels(catalog: CatalogSnapshot, selectedSkuId?: string) {
  const allSkus = getCatalogSkus(catalog);
  const matchedSku = selectedSkuId ? allSkus.find((sku) => sku.skuId === selectedSkuId) : undefined;

  return {
    allSkus,
    matchedSku,
    total: allSkus.length,
  };
}
