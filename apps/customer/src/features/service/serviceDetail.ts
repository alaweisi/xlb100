import type {
  CatalogSnapshot,
  PriceQuote,
  ServiceSku,
  ServiceSkuProfile,
  ServiceStandard,
} from "@xlb/types";

export interface CustomerServiceDetailIdentity {
  readonly skuId: string;
  readonly name: string;
  readonly unit: string;
  readonly categoryName: string;
  readonly itemName: string;
  readonly pathLabel: string;
  readonly profile: ServiceSkuProfile | null;
  readonly standards: readonly ServiceStandard[];
}

export interface CustomerServiceDetailViewModel {
  readonly cityCode: string;
  readonly identity: CustomerServiceDetailIdentity;
  readonly quote: PriceQuote;
  readonly freshness: "fresh" | "stale";
  readonly staleReason: string | null;
}

export interface CustomerCatalogSkuMatch {
  readonly categoryName: string;
  readonly itemName: string;
  readonly sku: ServiceSku;
}

function bySortOrder<T extends { readonly sortOrder: number }>(left: T, right: T): number {
  return left.sortOrder - right.sortOrder;
}

export function findEnabledCatalogSku(
  catalog: CatalogSnapshot,
  skuId: string,
): CustomerCatalogSkuMatch | null {
  for (const category of catalog.categories) {
    if (!category.isEnabled || category.cityCode !== catalog.cityCode) continue;
    for (const item of category.items) {
      if (
        !item.isEnabled ||
        item.cityCode !== catalog.cityCode ||
        item.categoryId !== category.categoryId
      ) {
        continue;
      }
      const sku = item.skus.find((candidate) =>
        candidate.isEnabled &&
        candidate.skuId === skuId &&
        candidate.cityCode === catalog.cityCode &&
        candidate.itemId === item.itemId);
      if (sku !== undefined) {
        return Object.freeze({
          categoryName: category.name,
          itemName: item.name,
          sku,
        });
      }
    }
  }
  return null;
}

export function createCustomerServiceDetailViewModel(
  catalog: CatalogSnapshot,
  match: CustomerCatalogSkuMatch,
  quote: PriceQuote,
  freshness: CustomerServiceDetailViewModel["freshness"] = "fresh",
  staleReason: string | null = null,
): CustomerServiceDetailViewModel {
  const pathLabel = [match.categoryName, match.itemName]
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(" · ");
  const standards = match.sku.standards
    .filter((standard) =>
      standard.isEnabled &&
      standard.cityCode === catalog.cityCode &&
      standard.skuId === match.sku.skuId)
    .sort(bySortOrder)
    .map((standard) => Object.freeze({ ...standard }));

  return Object.freeze({
    cityCode: catalog.cityCode,
    identity: Object.freeze({
      skuId: match.sku.skuId,
      name: match.sku.name,
      unit: match.sku.unit,
      categoryName: match.categoryName,
      itemName: match.itemName,
      pathLabel,
      profile: match.sku.profile === null
        ? null
        : Object.freeze({ ...match.sku.profile }),
      standards: Object.freeze(standards),
    }),
    quote: {
      ...quote,
      standards: quote.standards.map((standard) => ({ ...standard })),
      breakdown: {
        ...quote.breakdown,
        feeItems: quote.breakdown.feeItems.map((feeItem) => ({ ...feeItem })),
      },
    },
    freshness,
    staleReason,
  });
}
