import { randomBytes } from "node:crypto";

export function generateOrderId(): string {
  return `ord_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generatePaymentOrderId(): string {
  return `pay_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateEventId(): string {
  return `evt_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateDispatchTaskId(): string {
  return `dpt_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateCertificationId(): string {
  return `cert_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateQualificationRuleId(): string {
  return `rule_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateAcceptanceId(): string {
  return `acc_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateFulfillmentId(): string {
  return `ful_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateLedgerAccountId(): string {
  return `lac_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateLedgerEntryId(): string {
  return `len_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateLedgerAccrualId(): string {
  return `lar_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export function generateRefundId(): string {
  return `rfd_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}
