import type { OrderReverseStatus } from "@xlb/types";

const TRANSITIONS: Record<OrderReverseStatus, OrderReverseStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["applied"],
  rejected: [],
  applied: [],
};

export class InvalidOrderReverseTransitionError extends Error {
  readonly statusCode = 409;

  constructor(from: OrderReverseStatus, to: OrderReverseStatus) {
    super(`Invalid order reverse transition: ${from} -> ${to}`);
    this.name = "InvalidOrderReverseTransitionError";
  }
}

export function assertOrderReverseTransition(from: OrderReverseStatus, to: OrderReverseStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new InvalidOrderReverseTransitionError(from, to);
  }
}
