import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import {
  cityCodeSchema,
  serviceCategorySchema,
  serviceItemSchema,
  serviceSkuProfileSchema,
  serviceSkuSchema,
  serviceStandardSchema,
} from "@xlb/validators";

type CustomerCatalogApi = Pick<ReturnType<typeof customerApi.forClient>, "getCatalog">;

export type CustomerCatalogLoadResult =
  | {
      readonly status: "ready";
      readonly catalog: CatalogSnapshot;
      readonly freshness: "fresh" | "stale";
      readonly staleReason: string | null;
    }
  | {
      readonly status: "empty";
      readonly reasonCode: "catalog_empty";
    }
  | {
      readonly status: "error";
      readonly errorCode: "catalog_load_failed" | "catalog_response_invalid";
      readonly retryable: boolean;
    }
  | {
      readonly status: "unavailable";
      readonly capability: "customer.catalog";
      readonly reasonCode: "catalog_api_unavailable" | "catalog_city_mismatch";
    };

interface CatalogResponseShape {
  readonly cityCode?: unknown;
  readonly categories?: unknown;
}

function parseCatalogSnapshot(input: unknown): CatalogSnapshot {
  if (typeof input !== "object" || input === null) {
    throw new Error("Catalog response must be an object");
  }
  const candidate = input as CatalogResponseShape;
  const cityCode = cityCodeSchema.parse(candidate.cityCode);
  if (!Array.isArray(candidate.categories)) {
    throw new Error("Catalog categories must be an array");
  }

  const categories = candidate.categories.map((categoryInput) => {
    const category = serviceCategorySchema.parse(categoryInput);
    if (typeof categoryInput !== "object" || categoryInput === null) {
      throw new Error("Catalog category must be an object");
    }
    const rawItems = (categoryInput as { readonly items?: unknown }).items;
    if (!Array.isArray(rawItems)) {
      throw new Error("Catalog category items must be an array");
    }
    if (category.cityCode !== cityCode) {
      throw new Error("Catalog category city does not match snapshot");
    }

    const items = rawItems.map((itemInput) => {
      const item = serviceItemSchema.parse(itemInput);
      if (typeof itemInput !== "object" || itemInput === null) {
        throw new Error("Catalog item must be an object");
      }
      const rawSkus = (itemInput as { readonly skus?: unknown }).skus;
      if (!Array.isArray(rawSkus)) {
        throw new Error("Catalog item skus must be an array");
      }
      if (
        item.cityCode !== cityCode ||
        item.categoryId !== category.categoryId
      ) {
        throw new Error("Catalog item parent or city does not match");
      }

      const skus = rawSkus.map((skuInput) => {
        const sku = serviceSkuSchema.parse(skuInput);
        if (typeof skuInput !== "object" || skuInput === null) {
          throw new Error("Catalog sku must be an object");
        }
        const rawSku = skuInput as {
          readonly profile?: unknown;
          readonly standards?: unknown;
        };
        if (!Array.isArray(rawSku.standards)) {
          throw new Error("Catalog sku standards must be an array");
        }
        const profile = rawSku.profile === null
          ? null
          : serviceSkuProfileSchema.parse(rawSku.profile);
        const standards = rawSku.standards.map((standard) =>
          serviceStandardSchema.parse(standard));
        if (
          sku.cityCode !== cityCode ||
          sku.itemId !== item.itemId ||
          (profile !== null && (
            profile.skuId !== sku.skuId ||
            profile.cityCode !== cityCode
          )) ||
          standards.some((standard) =>
            standard.skuId !== sku.skuId || standard.cityCode !== cityCode)
        ) {
          throw new Error("Catalog sku parent or city does not match");
        }
        return Object.freeze({ ...sku, profile, standards });
      });
      return Object.freeze({ ...item, skus });
    });
    return Object.freeze({ ...category, items });
  });

  return Object.freeze({
    cityCode,
    categories: Object.freeze(categories),
  }) as CatalogSnapshot;
}

function isUnavailable(error: unknown): boolean {
  return error instanceof ApiClientError &&
    error.kind === "http" &&
    (error.status === 404 || error.status === 501 || error.status === 503);
}

export class ServiceDiscoveryCoordinator {
  readonly #api: CustomerCatalogApi;
  readonly #cache = new Map<CityCode, CatalogSnapshot>();

  constructor(api: CustomerCatalogApi) {
    this.#api = api;
  }

  clear(cityCode?: CityCode): void {
    if (cityCode === undefined) {
      this.#cache.clear();
      return;
    }
    this.#cache.delete(cityCode);
  }

  async load(cityCode: CityCode): Promise<CustomerCatalogLoadResult> {
    try {
      const response = await this.#api.getCatalog();
      const catalog = parseCatalogSnapshot(response.catalog);
      if (catalog.cityCode !== cityCode) {
        return Object.freeze({
          status: "unavailable",
          capability: "customer.catalog",
          reasonCode: "catalog_city_mismatch",
        });
      }
      if (
        catalog.categories.length === 0 ||
        !catalog.categories.some((category) =>
          category.isEnabled &&
          category.items.some((item) =>
            item.isEnabled && item.skus.some((sku) => sku.isEnabled)))
      ) {
        return Object.freeze({ status: "empty", reasonCode: "catalog_empty" });
      }
      this.#cache.set(cityCode, catalog);
      return Object.freeze({
        status: "ready",
        catalog,
        freshness: "fresh",
        staleReason: null,
      });
    } catch (error) {
      const cached = this.#cache.get(cityCode);
      if (cached !== undefined) {
        return Object.freeze({
          status: "ready",
          catalog: cached,
          freshness: "stale",
          staleReason: isUnavailable(error)
            ? "catalog_api_unavailable"
            : "catalog_refresh_failed",
        });
      }
      if (isUnavailable(error)) {
        return Object.freeze({
          status: "unavailable",
          capability: "customer.catalog",
          reasonCode: "catalog_api_unavailable",
        });
      }
      return Object.freeze({
        status: "error",
        errorCode: error instanceof ApiClientError
          ? "catalog_load_failed"
          : "catalog_response_invalid",
        retryable: error instanceof ApiClientError
          ? error.kind === "network" || error.kind === "timeout" || error.status === 429
          : false,
      });
    }
  }
}
