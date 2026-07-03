import type { FulfillmentStatus } from "@xlb/types";

const ALLOWED_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  accepted: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export class InvalidFulfillmentTransitionError extends Error {
  readonly statusCode = 409;

  constructor(from: FulfillmentStatus, to: FulfillmentStatus) {
    super(`Invalid fulfillment transition: ${from} -> ${to}`);
    this.name = "InvalidFulfillmentTransitionError";
  }
}

export function canTransitionFulfillment(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertFulfillmentTransition(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): void {
  if (!canTransitionFulfillment(from, to)) {
    throw new InvalidFulfillmentTransitionError(from, to);
  }
}
