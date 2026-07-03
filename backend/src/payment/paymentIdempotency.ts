import type { PaymentStatus } from "@xlb/types";

export function isPaymentAlreadyPaid(status: PaymentStatus): boolean {
  return status === "paid";
}

export function canProcessMockWebhook(status: PaymentStatus): boolean {
  return status === "pending" || status === "paid";
}
