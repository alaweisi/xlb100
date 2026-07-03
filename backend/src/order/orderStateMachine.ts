import type { OrderStatus } from "@xlb/types";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: ["pending_payment"],
  pending_payment: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export class InvalidOrderTransitionError extends Error {
  readonly statusCode = 409;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order transition: ${from} -> ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === "paid" || status === "cancelled";
}
