import {
  sanitizeDiscoveryQuery,
  type CustomerDiscoveryFilters,
} from "./catalogDiscovery.js";

export interface CustomerDiscoveryNavigation {
  replaceDiscovery(filters: CustomerDiscoveryFilters): void;
  openSku(skuId: string): void;
}

export interface CustomerDiscoveryActionScope {
  readonly categoryIds: ReadonlySet<string>;
  readonly skuIds: ReadonlySet<string>;
}

export function createBrowserCustomerDiscoveryNavigation(): CustomerDiscoveryNavigation {
  return Object.freeze({
    replaceDiscovery(filters: CustomerDiscoveryFilters) {
      const search = new URLSearchParams();
      if (filters.categoryId !== null) search.set("categoryId", filters.categoryId);
      const query = sanitizeDiscoveryQuery(filters.query).trim();
      if (query.length > 0) search.set("q", query);
      const suffix = search.size > 0 ? `?${search.toString()}` : "";
      window.history.replaceState(null, "", `/service${suffix}`);
    },
    openSku(skuId: string) {
      window.history.pushState(null, "", `/service/${encodeURIComponent(skuId)}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
  });
}

export class ServiceDiscoveryActionController {
  readonly #navigation: CustomerDiscoveryNavigation;

  constructor(navigation: CustomerDiscoveryNavigation) {
    this.#navigation = navigation;
  }

  changeQuery(
    current: CustomerDiscoveryFilters,
    query: string,
  ): CustomerDiscoveryFilters {
    const next = Object.freeze({
      ...current,
      query: sanitizeDiscoveryQuery(query),
    });
    this.#navigation.replaceDiscovery(next);
    return next;
  }

  selectCategory(
    current: CustomerDiscoveryFilters,
    categoryId: string | null,
    scope: CustomerDiscoveryActionScope,
  ): CustomerDiscoveryFilters {
    const nextCategoryId = categoryId !== null && scope.categoryIds.has(categoryId)
      ? categoryId
      : null;
    const next = Object.freeze({ ...current, categoryId: nextCategoryId });
    this.#navigation.replaceDiscovery(next);
    return next;
  }

  clear(current: CustomerDiscoveryFilters): CustomerDiscoveryFilters {
    const next = Object.freeze({ ...current, categoryId: null, query: "" });
    this.#navigation.replaceDiscovery(next);
    return next;
  }

  openSku(skuId: string, scope: CustomerDiscoveryActionScope): boolean {
    if (!scope.skuIds.has(skuId)) return false;
    this.#navigation.openSku(skuId);
    return true;
  }
}
