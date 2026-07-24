import type {
  CustomerOrderListFilter,
  CustomerOrderSummary,
} from "@xlb/types";

const SAFE_ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export interface CustomerOrderCenterNavigation {
  showFilter(filter: CustomerOrderListFilter): void;
  openRoute(route: `/orders/${string}`): void;
}

export type CustomerOrderCenterOpenResult =
  | {
      readonly status: "navigated";
      readonly route: `/orders/${string}`;
    }
  | {
      readonly status: "rejected";
      readonly reasonCode: "invalid_order_id" | "stale_order_reference";
    };

export function safeCustomerOrderDetailRoute(
  orderId: string,
): `/orders/${string}` | null {
  return SAFE_ORDER_ID.test(orderId) ? `/orders/${orderId}` : null;
}

export class CustomerOrderCenterActionController {
  readonly #navigation: CustomerOrderCenterNavigation;

  constructor(navigation: CustomerOrderCenterNavigation) {
    this.#navigation = navigation;
  }

  showFilter(filter: CustomerOrderListFilter): void {
    this.#navigation.showFilter(filter);
  }

  openOrder(
    orderId: string,
    summaries: readonly CustomerOrderSummary[],
  ): CustomerOrderCenterOpenResult {
    if (!summaries.some((summary) => summary.orderId === orderId)) {
      return Object.freeze({
        status: "rejected",
        reasonCode: "stale_order_reference",
      });
    }
    const route = safeCustomerOrderDetailRoute(orderId);
    if (route === null) {
      return Object.freeze({
        status: "rejected",
        reasonCode: "invalid_order_id",
      });
    }
    this.#navigation.openRoute(route);
    return Object.freeze({ status: "navigated", route });
  }
}
