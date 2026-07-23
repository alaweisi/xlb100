import type {
  CustomerOrderListFilter,
  CustomerOrderSummary,
  OrderStatus,
} from "@xlb/types";

export const CUSTOMER_ORDER_CENTER_FILTERS = [
  "all",
  "active",
  "completed",
  "cancelled",
] as const satisfies readonly CustomerOrderListFilter[];

export interface CustomerOrderCenterRouteInput {
  readonly filter: CustomerOrderListFilter;
  readonly cursor: string | null;
}

export interface CustomerOrderCenterNotice {
  readonly kind: "error" | "safe";
  readonly message: string;
}

export interface CustomerOrderCenterViewModel {
  readonly filter: CustomerOrderListFilter;
  readonly items: readonly CustomerOrderSummary[];
  readonly nextCursor: string | null;
  readonly refreshing: boolean;
  readonly loadingMore: boolean;
  readonly notice: CustomerOrderCenterNotice | null;
}

export interface CustomerOrderCenterActions {
  readonly onSelectFilter: (filter: CustomerOrderListFilter) => void;
  readonly onRefresh: () => void;
  readonly onLoadMore: () => void;
  readonly onOpenOrder: (orderId: string) => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerOrderCenterTemplateReadyData {
  readonly viewModel: CustomerOrderCenterViewModel;
  readonly actions: CustomerOrderCenterActions;
}

export function orderCenterFilterForStatus(
  status: OrderStatus,
): Exclude<CustomerOrderListFilter, "all"> {
  switch (status) {
    case "draft":
    case "pending_dispatch":
    case "service_completed":
    case "pending_payment":
      return "active";
    case "paid":
      return "completed";
    case "cancelled":
      return "cancelled";
  }
}

function newerSummary(
  current: CustomerOrderSummary,
  incoming: CustomerOrderSummary,
): CustomerOrderSummary {
  const currentUpdatedAt = Date.parse(current.updatedAt);
  const incomingUpdatedAt = Date.parse(incoming.updatedAt);
  return Number.isFinite(incomingUpdatedAt) &&
      (!Number.isFinite(currentUpdatedAt) || incomingUpdatedAt >= currentUpdatedAt)
    ? incoming
    : current;
}

export function mergeCustomerOrderSummaries(
  current: readonly CustomerOrderSummary[],
  incoming: readonly CustomerOrderSummary[],
): readonly CustomerOrderSummary[] {
  const merged: CustomerOrderSummary[] = [];
  const indexes = new Map<string, number>();

  for (const item of [...current, ...incoming]) {
    const existingIndex = indexes.get(item.orderId);
    if (existingIndex === undefined) {
      indexes.set(item.orderId, merged.length);
      merged.push(item);
      continue;
    }
    merged[existingIndex] = newerSummary(merged[existingIndex]!, item);
  }

  return Object.freeze(merged);
}
