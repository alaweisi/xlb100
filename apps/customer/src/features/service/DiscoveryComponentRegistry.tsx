import {
  CustomerComponentRegistry,
} from "@xlb/customer-components";
import {
  DiscoveryCatalogScopeNote,
  DiscoveryBoundaryHeader,
  DiscoveryCategoryFilter,
  DiscoveryHeader,
  DiscoveryResultCount,
  DiscoverySearchField,
  DiscoveryServiceResultList,
  type CustomerDiscoveryComponentProps,
} from "./discoveryComponents.js";

export const CUSTOMER_DISCOVERY_CORE_COMPONENTS = [
  "header",
  "search-field",
  "category-filter",
  "result-count",
  "service-result-list",
] as const;

export const CUSTOMER_DISCOVERY_DISPLAY_COMPONENTS = [
  "catalog-scope-note",
] as const;

export type CustomerDiscoveryComponentType =
  | typeof CUSTOMER_DISCOVERY_CORE_COMPONENTS[number]
  | typeof CUSTOMER_DISCOVERY_DISPLAY_COMPONENTS[number];

export interface CustomerDiscoveryPresentationSlot {
  readonly type: typeof CUSTOMER_DISCOVERY_DISPLAY_COMPONENTS[number];
  readonly position: "before-results" | "after-results";
}

export interface CustomerDiscoveryPresentationPlan {
  readonly slots: readonly CustomerDiscoveryPresentationSlot[];
}

export function parseCustomerDiscoveryPresentationPlan(
  input: unknown,
): CustomerDiscoveryPresentationPlan {
  if (typeof input !== "object" || input === null) {
    return Object.freeze({ slots: Object.freeze([]) });
  }
  const slots = (input as { readonly slots?: unknown }).slots;
  if (!Array.isArray(slots) || slots.length > 2) {
    return Object.freeze({ slots: Object.freeze([]) });
  }

  const parsed: CustomerDiscoveryPresentationSlot[] = [];
  for (const slot of slots) {
    if (typeof slot !== "object" || slot === null) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    const candidate = slot as { readonly type?: unknown; readonly position?: unknown };
    if (
      candidate.type !== "catalog-scope-note" ||
      (candidate.position !== "before-results" && candidate.position !== "after-results")
    ) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    if (parsed.some((existing) => existing.position === candidate.position)) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    parsed.push(Object.freeze({
      type: candidate.type,
      position: candidate.position,
    }));
  }
  return Object.freeze({ slots: Object.freeze(parsed) });
}

export function createCustomerDiscoveryComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerDiscoveryComponentType,
    CustomerDiscoveryComponentProps
  >()
    .register("header", DiscoveryHeader)
    .register("search-field", DiscoverySearchField)
    .register("category-filter", DiscoveryCategoryFilter)
    .register("result-count", DiscoveryResultCount)
    .register("service-result-list", DiscoveryServiceResultList)
    .register("catalog-scope-note", DiscoveryCatalogScopeNote);
}

export function createCustomerDiscoveryBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", DiscoveryBoundaryHeader);
}
