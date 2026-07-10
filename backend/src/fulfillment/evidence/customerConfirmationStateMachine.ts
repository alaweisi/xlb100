import type { CustomerConfirmationStatus } from "@xlb/types";

export class InvalidCustomerConfirmationTransitionError extends Error {
  readonly statusCode = 409;
  constructor(from: CustomerConfirmationStatus, to: CustomerConfirmationStatus) {
    super(`Invalid customer confirmation transition: ${from} -> ${to}`);
    this.name = "InvalidCustomerConfirmationTransitionError";
  }
}

export function assertCustomerConfirmationTransition(
  from: CustomerConfirmationStatus,
  to: CustomerConfirmationStatus,
): void {
  if (from !== "pending" || (to !== "confirmed" && to !== "disputed")) {
    throw new InvalidCustomerConfirmationTransitionError(from, to);
  }
}
