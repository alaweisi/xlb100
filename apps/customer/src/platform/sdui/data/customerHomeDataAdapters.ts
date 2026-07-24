import type {
  CatalogSnapshot,
  CustomerSduiDataKey,
  NotificationUnreadCountResponse,
} from "@xlb/types";

import { HomeDataAdapterRegistry } from "./HomeDataAdapterRegistry.js";
import type {
  HomeCurrentLocationViewModel,
  HomeDataAdapter,
  HomeDataLoadContext,
  HomeDataSourceFor,
  HomeDataValueByKey,
  HomeNearbyProviderViewModel,
  HomePromotionViewModel,
  HomeRecommendedServiceViewModel,
  HomeTrustGuaranteeViewModel,
} from "./types.js";

interface CustomerHomeReadApi {
  getCatalog(options?: { signal?: AbortSignal }): Promise<{ ok: true; catalog: CatalogSnapshot }>;
  getNotificationUnreadCount(options?: { signal?: AbortSignal }): Promise<NotificationUnreadCountResponse>;
}

type Provider<TKey extends CustomerSduiDataKey> = (
  source: HomeDataSourceFor<TKey>,
  context: HomeDataLoadContext,
) => Promise<HomeDataValueByKey[TKey]>;

export interface CustomerHomeDataAdapterDependencies {
  customerApi: CustomerHomeReadApi;
  getCurrentLocation: Provider<"customer.current_location">;
  getRecommendedServices?: Provider<"catalog.recommended_services">;
  getNearbyProviders?: Provider<"provider.nearby">;
  getHomePromotions?: Provider<"content.home_promotions">;
  getTrustGuarantees?: Provider<"content.trust_guarantees">;
}

function optionalAdapter<TKey extends CustomerSduiDataKey>(
  dataKey: TKey,
  provider: Provider<TKey> | undefined,
): HomeDataAdapter<TKey> | null {
  return provider ? { dataKey, load: provider } : null;
}

export function registerCustomerHomeDataAdapters(
  registry: HomeDataAdapterRegistry,
  dependencies: CustomerHomeDataAdapterDependencies,
): HomeDataAdapterRegistry {
  registry.register({
    dataKey: "customer.current_location",
    load: dependencies.getCurrentLocation,
  });

  registry.register({
    dataKey: "customer.notification_summary",
    async load(_source, context) {
      const response = await context.request("customer.notification_summary", (signal) =>
        dependencies.customerApi.getNotificationUnreadCount({ signal }),
      );
      return { unreadCount: response.unreadCount };
    },
  });

  registry.register({
    dataKey: "catalog.service_categories",
    async load(source, context) {
      const response = await context.request("customer.catalog", (signal) =>
        dependencies.customerApi.getCatalog({ signal }),
      );
      return response.catalog.categories
        .filter((category) => category.isEnabled)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .slice(0, source.parameters.limit)
        .map((category) => ({
          categoryId: category.categoryId,
          name: category.name,
          sortOrder: category.sortOrder,
          itemCount: category.items.filter((item) => item.isEnabled).length,
        }));
    },
  });

  const recommendations = optionalAdapter(
    "catalog.recommended_services",
    dependencies.getRecommendedServices,
  );
  if (recommendations) registry.register(recommendations);

  const nearbyProviders = optionalAdapter("provider.nearby", dependencies.getNearbyProviders);
  if (nearbyProviders) registry.register(nearbyProviders);

  const promotions = optionalAdapter("content.home_promotions", dependencies.getHomePromotions);
  if (promotions) registry.register(promotions);

  const guarantees = optionalAdapter("content.trust_guarantees", dependencies.getTrustGuarantees);
  if (guarantees) registry.register(guarantees);

  return registry;
}

export type {
  HomeCurrentLocationViewModel,
  HomeNearbyProviderViewModel,
  HomePromotionViewModel,
  HomeRecommendedServiceViewModel,
  HomeTrustGuaranteeViewModel,
};
