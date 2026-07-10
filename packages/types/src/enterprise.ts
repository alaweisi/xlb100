import type { CityCode } from "./city.js";
import type { Order } from "./order.js";

export type BusinessClientStatus = "active" | "suspended" | "closed";
export type BusinessBillingMode = "single" | "monthly";

export interface BusinessClient {
  businessClientId: string;
  cityCode: CityCode;
  clientCode: string;
  name: string;
  status: BusinessClientStatus;
  billingMode: BusinessBillingMode;
  billingCustomerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessClientContact {
  contactId: string;
  businessClientId: string;
  cityCode: CityCode;
  name: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  createdAt: string;
}

export type BusinessApiScope =
  | "enterprise:orders:read"
  | "enterprise:orders:write"
  | "enterprise:webhooks:read"
  | "enterprise:webhooks:write";

export interface BusinessApiCredential {
  credentialId: string;
  businessClientId: string;
  cityCode: CityCode;
  name: string;
  keyPrefix: string;
  scopes: BusinessApiScope[];
  status: "active" | "revoked";
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface BusinessAgreementPrice {
  agreementPriceId: string;
  businessClientId: string;
  cityCode: CityCode;
  skuId: string;
  unitPrice: number;
  currency: "CNY";
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "active" | "disabled";
  createdAt: string;
}

export interface BusinessOrder {
  businessOrderId: string;
  businessClientId: string;
  cityCode: CityCode;
  externalOrderId: string;
  idempotencyKey: string;
  orderId: string;
  agreementPriceId: string | null;
  pricingSource: "public" | "agreement";
  requestHash: string;
  order: Order;
  createdAt: string;
}

export interface CreateBusinessOrderRequest {
  externalOrderId: string;
  idempotencyKey: string;
  skuId: string;
  quantity: number;
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  detailAddress: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  scheduledTimeSlot: "morning" | "afternoon" | "evening";
}

export const BUSINESS_WEBHOOK_EVENT_TYPES = [
  "order.created",
  "order.paid",
  "fulfillment.started",
  "fulfillment.completed",
  "fulfillment.evidence.created",
  "fulfillment.customer_confirmation.confirmed",
  "fulfillment.customer_confirmation.disputed",
  "aftersale.complaint.submitted",
  "aftersale.complaint.resolved",
] as const;

export type BusinessWebhookEventType = (typeof BUSINESS_WEBHOOK_EVENT_TYPES)[number];

export interface BusinessWebhookSubscription {
  subscriptionId: string;
  businessClientId: string;
  cityCode: CityCode;
  callbackUrl: string;
  eventTypes: BusinessWebhookEventType[];
  status: "active" | "paused";
  signingSecretLast4: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookProviderEnvelope {
  provider: "mock" | "https";
  providerStatus: "delivered_mock" | "delivered_https" | "failed_mock" | "failed_https";
  externalProviderExecuted: boolean;
  httpStatus: number | null;
  responseBody: string | null;
  attemptedAt: string;
}

export interface BusinessWebhookDelivery {
  deliveryId: string;
  subscriptionId: string;
  businessClientId: string;
  cityCode: CityCode;
  eventId: string;
  eventType: BusinessWebhookEventType;
  status: "pending" | "delivered" | "retry_wait" | "dead_letter";
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  payload: Record<string, unknown>;
  payloadSha256: string;
  signature: string;
  providerEnvelope: WebhookProviderEnvelope | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseBillSnapshot {
  billId: string;
  businessClientId: string;
  cityCode: CityCode;
  periodStart: string;
  periodEnd: string;
  currency: "CNY";
  orderCount: number;
  totalAmount: number;
  status: "draft" | "issued";
  snapshot: Array<{ businessOrderId: string; externalOrderId: string; orderId: string; amount: number; orderStatus: string }>;
  createdAt: string;
  issuedAt: string | null;
}

export interface BusinessApiContext {
  credentialId: string;
  businessClientId: string;
  cityCode: CityCode;
  billingCustomerId: string;
  scopes: BusinessApiScope[];
  traceId: string;
}
