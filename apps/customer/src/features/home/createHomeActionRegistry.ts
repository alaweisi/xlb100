import type { CustomerSduiActionKey } from "@xlb/types";
import {
  HomeActionRegistry,
  type HomeActionRegistryOptions,
} from "../../platform/sdui/actions/HomeActionRegistry.js";

const ROUTE_BY_ACTION: Readonly<Partial<Record<CustomerSduiActionKey, string>>> = {
  "location.open_picker": "/profile/addresses",
  "notification.open_center": "/notifications",
  "service.open_category": "/service",
  "service.open_detail": "/service",
  "service.open_all": "/service",
  "provider.open_detail": "/service/providers",
  "provider.open_all": "/service/providers",
  "demand.open_create": "/order/create",
  "navigation.open_home": "/",
  "navigation.open_support": "/support",
  "navigation.open_orders": "/orders",
  "navigation.open_profile": "/profile",
};

function emitNavigation(actionKey: CustomerSduiActionKey, payload?: unknown): void {
  const baseRoute = ROUTE_BY_ACTION[actionKey];
  if (baseRoute === undefined) return;
  const detail = { actionKey, route: baseRoute, payload };
  window.dispatchEvent(new CustomEvent("xlb:customer:navigate", { detail }));
  if (window.location.pathname !== baseRoute) {
    window.history.pushState(detail, "", baseRoute);
  }
}

export function createHomeActionRegistry(
  options: HomeActionRegistryOptions = {},
): HomeActionRegistry {
  const registry = new HomeActionRegistry(options);
  const actionKeys: readonly CustomerSduiActionKey[] = [
    "location.open_picker",
    "notification.open_center",
    "search.submit",
    "service.open_category",
    "service.open_detail",
    "service.open_all",
    "promotion.open",
    "provider.open_detail",
    "provider.open_all",
    "demand.open_create",
    "navigation.open_home",
    "navigation.open_support",
    "navigation.open_orders",
    "navigation.open_profile",
  ];

  for (const actionKey of actionKeys) {
    registry.register(actionKey, ({ payload }) => {
      if (actionKey === "search.submit") {
        const query = typeof payload === "object" && payload !== null &&
          "query" in payload && typeof payload.query === "string"
          ? payload.query.trim()
          : "";
        const route = query ? `/service?q=${encodeURIComponent(query)}` : "/service";
        window.dispatchEvent(new CustomEvent("xlb:customer:navigate", {
          detail: { actionKey, route, payload },
        }));
        window.history.pushState({ actionKey, payload }, "", route);
        return;
      }
      emitNavigation(actionKey, payload);
    });
  }

  return registry.seal();
}
