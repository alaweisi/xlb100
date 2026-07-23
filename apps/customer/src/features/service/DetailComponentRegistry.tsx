import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  DetailBoundaryHeader,
  DetailCatalogVerificationNote,
  DetailFeeBreakdown,
  DetailHeader,
  DetailPriceQuotePanel,
  DetailQuoteRefreshNote,
  DetailServiceIdentity,
  DetailServiceStandards,
  DetailStickyTaskAction,
  type CustomerServiceDetailComponentProps,
} from "./detailComponents.js";

export const CUSTOMER_SERVICE_DETAIL_CORE_COMPONENTS = [
  "header",
  "service-identity",
  "price-quote-panel",
  "fee-breakdown",
  "service-standards",
  "sticky-task-action",
] as const;

export const CUSTOMER_SERVICE_DETAIL_DISPLAY_COMPONENTS = [
  "catalog-verification-note",
  "quote-refresh-note",
] as const;

export type CustomerServiceDetailComponentType =
  | typeof CUSTOMER_SERVICE_DETAIL_CORE_COMPONENTS[number]
  | typeof CUSTOMER_SERVICE_DETAIL_DISPLAY_COMPONENTS[number];

export interface CustomerServiceDetailPresentationSlot {
  readonly type: typeof CUSTOMER_SERVICE_DETAIL_DISPLAY_COMPONENTS[number];
  readonly position: "after-price" | "before-standards";
}

export interface CustomerServiceDetailPresentationPlan {
  readonly slots: readonly CustomerServiceDetailPresentationSlot[];
}

export function parseCustomerServiceDetailPresentationPlan(
  input: unknown,
): CustomerServiceDetailPresentationPlan {
  if (typeof input !== "object" || input === null) {
    return Object.freeze({ slots: Object.freeze([]) });
  }
  const slots = (input as { readonly slots?: unknown }).slots;
  if (!Array.isArray(slots) || slots.length > 2) {
    return Object.freeze({ slots: Object.freeze([]) });
  }

  const parsed: CustomerServiceDetailPresentationSlot[] = [];
  for (const slot of slots) {
    if (typeof slot !== "object" || slot === null) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    const candidate = slot as { readonly type?: unknown; readonly position?: unknown };
    if (
      (candidate.type !== "catalog-verification-note" &&
        candidate.type !== "quote-refresh-note") ||
      (candidate.position !== "after-price" &&
        candidate.position !== "before-standards") ||
      parsed.some((existing) =>
        existing.type === candidate.type || existing.position === candidate.position)
    ) {
      return Object.freeze({ slots: Object.freeze([]) });
    }
    parsed.push(Object.freeze({
      type: candidate.type,
      position: candidate.position,
    }));
  }
  return Object.freeze({ slots: Object.freeze(parsed) });
}

export function createCustomerServiceDetailComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerServiceDetailComponentType,
    CustomerServiceDetailComponentProps
  >()
    .register("header", DetailHeader)
    .register("service-identity", DetailServiceIdentity)
    .register("price-quote-panel", DetailPriceQuotePanel)
    .register("fee-breakdown", DetailFeeBreakdown)
    .register("service-standards", DetailServiceStandards)
    .register("sticky-task-action", DetailStickyTaskAction)
    .register("catalog-verification-note", DetailCatalogVerificationNote)
    .register("quote-refresh-note", DetailQuoteRefreshNote);
}

export function createCustomerServiceDetailBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", DetailBoundaryHeader);
}
