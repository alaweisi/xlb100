import type { CatalogSnapshot } from "@xlb/types";

export const CUSTOMER_DISCOVERY_QUERY_MAX_LENGTH = 80;

export interface CustomerDiscoveryFilters {
  readonly categoryId: string | null;
  readonly query: string;
}

export interface CustomerDiscoveryCategory {
  readonly categoryId: string;
  readonly name: string;
  readonly resultCount: number;
}

export interface CustomerDiscoveryService {
  readonly skuId: string;
  readonly name: string;
  readonly unit: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly pathLabel: string;
}

export interface CustomerDiscoveryViewModel {
  readonly cityCode: string;
  readonly filters: CustomerDiscoveryFilters;
  readonly categories: readonly CustomerDiscoveryCategory[];
  readonly results: readonly CustomerDiscoveryService[];
  readonly totalAvailable: number;
  readonly freshness: "fresh" | "stale";
}

function bySortOrder<T extends { readonly sortOrder: number }>(left: T, right: T): number {
  return left.sortOrder - right.sortOrder;
}

export function sanitizeDiscoveryQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .slice(0, CUSTOMER_DISCOVERY_QUERY_MAX_LENGTH);
}

function searchable(value: string): string {
  return sanitizeDiscoveryQuery(value).trim().toLocaleLowerCase("zh-CN");
}

function enabledServices(catalog: CatalogSnapshot): CustomerDiscoveryService[] {
  return catalog.categories
    .filter((category) => category.isEnabled)
    .sort(bySortOrder)
    .flatMap((category) =>
      category.items
        .filter((item) => item.isEnabled)
        .sort(bySortOrder)
        .flatMap((item) =>
          item.skus
            .filter((sku) => sku.isEnabled)
            .sort(bySortOrder)
            .map((sku) => Object.freeze({
              skuId: sku.skuId,
              name: sku.name,
              unit: sku.unit,
              categoryId: category.categoryId,
              categoryName: category.name,
              itemId: item.itemId,
              itemName: item.name,
              pathLabel: [category.name, item.name].filter(
                (part, index, parts) => parts.indexOf(part) === index,
              ).join(" · "),
            })),
        ),
    );
}

export function createCustomerDiscoveryViewModel(
  catalog: CatalogSnapshot,
  requestedFilters: CustomerDiscoveryFilters,
  freshness: CustomerDiscoveryViewModel["freshness"] = "fresh",
): CustomerDiscoveryViewModel {
  const services = enabledServices(catalog);
  const categoryIds = new Set(
    catalog.categories.filter((category) => category.isEnabled).map((category) => category.categoryId),
  );
  const categoryId = requestedFilters.categoryId !== null &&
    categoryIds.has(requestedFilters.categoryId)
    ? requestedFilters.categoryId
    : null;
  const query = sanitizeDiscoveryQuery(requestedFilters.query);
  const queryKey = searchable(query);

  const results = services.filter((service) => {
    if (categoryId !== null && service.categoryId !== categoryId) return false;
    if (queryKey.length === 0) return true;
    return searchable([
      service.categoryName,
      service.itemName,
      service.name,
    ].join(" ")).includes(queryKey);
  });

  const categories = catalog.categories
    .filter((category) => category.isEnabled)
    .sort(bySortOrder)
    .map((category) => Object.freeze({
      categoryId: category.categoryId,
      name: category.name,
      resultCount: services.filter((service) => service.categoryId === category.categoryId).length,
    }));

  return Object.freeze({
    cityCode: catalog.cityCode,
    filters: Object.freeze({ categoryId, query }),
    categories: Object.freeze(categories),
    results: Object.freeze(results),
    totalAvailable: services.length,
    freshness,
  });
}
