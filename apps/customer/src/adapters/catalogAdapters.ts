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
  icon: string;
  tone: string;
  examples: string;
}

type CatalogCategory = CatalogSnapshot["categories"][number];
type CatalogItem = ServiceItem & CatalogCategory["items"][number];

export const cityAreaByCode: Record<CityCode, string> = {
  hangzhou: "西湖区",
  shanghai: "静安区",
  beijing: "朝阳区",
};

export const cityNameByCode: Record<CityCode, string> = {
  hangzhou: "杭州",
  shanghai: "上海",
  beijing: "北京",
};

export const cityDisplayLabel = (cityCode: CityCode): string => `${cityNameByCode[cityCode]} · ${cityAreaByCode[cityCode] ?? "市中心"}`;

const defaultCategoryMeta = {
  label: "服务",
  icon: "🧰",
  tone: "#b85f2a",
};

const fallbackCategoryOrder = [
  "家庭保洁",
  "家电清洗",
  "家电维修",
  "上门安装",
  "管道疏通",
  "开锁换锁",
  "水电维修",
  "搬家搬运",
  "四害消杀",
  "甲醛检测治理",
  "洗衣洗鞋",
  "家具家居维修保养",
  "房屋修缮/局部改造",
  "防水补漏/精准测漏",
  "保姆月嫂/照护",
  "数码办公维修",
];

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
  return catalog.categories.map((category) => ({
    categoryId: category.categoryId,
    categoryName: category.name,
    label: (category.name.length > 4 ? category.name.slice(0, 4) : category.name) ?? category.name,
    icon: defaultCategoryMeta.icon,
    tone: defaultCategoryMeta.tone,
    examples: category.items
      .slice(0, 3)
      .map((item) => item.name)
      .join("、"),
  }));
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

export function toCatalogDisplayModels(catalog: CatalogSnapshot, selectedSkuId?: string) {
  const allSkus = getCatalogSkus(catalog);
  const matchedSku = selectedSkuId ? allSkus.find((sku) => sku.skuId === selectedSkuId) : undefined;

  return {
    allSkus,
    matchedSku,
    total: allSkus.length,
  };
}
