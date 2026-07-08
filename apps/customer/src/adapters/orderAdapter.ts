import type { Order } from "@xlb/types";

export interface OrderStatusViewModel {
  id: string;
  skuName: string;
  quantity: number;
  unit: string;
  cityCode: string;
  totalAmount: number;
  currency: string;
  status: string;
  statusTone: "success" | "warning" | "danger" | "muted";
  createdAt: string;
}

export function toOrderStatusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") {
    return "success";
  }

  if (status === "cancelled" || status === "failed" || status === "closed") {
    return "danger";
  }

  if (
    status === "pending" ||
    status === "pending_payment" ||
    status === "pending_dispatch" ||
    status === "service_completed" ||
    status === "draft"
  ) {
    return "warning";
  }

  return "muted";
}

export function toOrderStatusViewModel(order: Order): OrderStatusViewModel {
  return {
    id: order.orderId,
    skuName: order.skuName,
    quantity: order.quantity,
    unit: order.unit,
    cityCode: order.cityCode,
    totalAmount: order.totalAmount,
    currency: order.currency,
    status: order.status,
    statusTone: toOrderStatusTone(order.status),
    createdAt: order.createdAt,
  };
}

export function toOrderStatusListViewModel(orders: Order[]): OrderStatusViewModel[] {
  return orders.map((order) => toOrderStatusViewModel(order));
}
