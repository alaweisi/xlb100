import type { ApiClient } from "./createApiClient.js";

type CityCode = string;
type PriceType = "fixed" | "range" | "from" | "estimate_from" | "onsite_quote";
type OrderStatus =
  | "draft"
  | "pending_dispatch"
  | "service_completed"
  | "pending_payment"
  | "paid"
  | "cancelled";
type ScheduledTimeSlot = "morning" | "afternoon" | "evening";
type PaymentStatus = "pending" | "paid" | "failed" | "closed";
type PaymentProvider = "mock";
type RefundRequestStatus = "requested" | "approved";
type OrderReviewStatus = "created";

export interface CatalogSnapshotResponse {
  cityCode: CityCode;
  categories: Array<{
    categoryId: string;
    cityCode: CityCode;
    name: string;
    sortOrder: number;
    isEnabled: boolean;
    items: Array<{
      itemId: string;
      categoryId: string;
      cityCode: CityCode;
      name: string;
      sortOrder: number;
      isEnabled: boolean;
      skus: Array<{
        skuId: string;
        itemId: string;
        cityCode: CityCode;
        name: string;
        unit: string;
        sortOrder: number;
        isEnabled: boolean;
      }>;
    }>;
  }>;
}

export interface PriceQuoteResponse {
  cityCode: CityCode;
  skuId: string;
  basePrice: number;
  currency: string;
  priceText: string;
  priceType: PriceType;
  minPrice: number | null;
  maxPrice: number | null;
  pricingNote: string | null;
  priceRuleId: string;
  version: number;
}

export interface CreateOrderBody {
  customerId?: string; // Phase 14: optional — backend derives from auth token/context
  skuId: string;
  quantity: number;
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  detailAddress: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  scheduledTimeSlot: ScheduledTimeSlot;
}

export interface CreatePaymentOrderBody {
  orderId: string;
}

export interface MockPaySuccessBody {
  paymentOrderId: string;
  providerTradeNo: string;
  status: "paid";
}

export interface CreateRefundRequestBody {
  orderId: string;
  amount?: number;
  reason?: string;
}

export interface CreateOrderReviewBody {
  orderId: string;
  workerId: string;
  rating: number;
  comment: string;
}

export interface OrderResponse {
  orderId: string;
  cityCode: CityCode;
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  detailAddress: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  scheduledTimeSlot: ScheduledTimeSlot;
  customerId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  unit: string;
  priceRuleId: string;
  priceText: string;
  priceType: PriceType;
  basePrice: number;
  currency: string;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentOrderResponse {
  paymentOrderId: string;
  orderId: string;
  cityCode: CityCode;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerTradeNo: string | null;
  metadata: {
    orderId: string;
    cityCode: CityCode;
    skuId: string;
    priceRuleId: string;
    customerId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RefundRequestResponse {
  refundId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  fulfillmentId: string;
  paymentOrderId: string;
  amount: number;
  currency: "CNY";
  reason: string | null;
  status: RefundRequestStatus;
  requestedAt: string;
  approvedAt: string | null;
  approvedByAdminId: string | null;
}

export interface OrderReviewResponse {
  reviewId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  workerId: string;
  fulfillmentId: string;
  rating: number;
  comment: string;
  status: OrderReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export function createCustomerOrderApi(client: ApiClient) {
  return {
    getCatalog() {
      return client.get<{ ok: true; catalog: CatalogSnapshotResponse }>("/api/catalog");
    },
    getPriceQuote(skuId: string) {
      const query = new URLSearchParams({ skuId }).toString();
      return client.get<{ ok: true; quote: PriceQuoteResponse }>(`/api/pricing/quote?${query}`);
    },
    createOrder(body: CreateOrderBody) {
      return client.post<{ ok: true; order: OrderResponse }>("/api/orders", body);
    },
    getOrder(orderId: string) {
      return client.get<{ ok: true; order: OrderResponse }>(`/api/orders/${orderId}`);
    },
    confirmService(orderId: string) {
      return client.post<{ ok: true; order: OrderResponse }>(
        `/api/orders/${encodeURIComponent(orderId)}/confirm-service`,
        {},
      );
    },
    createPaymentOrder(body: CreatePaymentOrderBody) {
      return client.post<{ ok: true; paymentOrder: PaymentOrderResponse }>(
        "/api/payments/orders",
        body,
      );
    },
    mockPaySuccess(body: MockPaySuccessBody) {
      return client.post<{
        ok: true;
        paymentOrder: PaymentOrderResponse;
        orderId: string;
        idempotent: boolean;
      }>("/api/payments/mock-webhook", body);
    },
    createRefundRequest(body: CreateRefundRequestBody) {
      return client.post<{
        ok: true;
        refund: RefundRequestResponse;
        idempotent: boolean;
      }>("/api/aftersale/refunds", body);
    },
    createOrderReview({ orderId, ...body }: CreateOrderReviewBody) {
      return client.post<{
        ok: true;
        review: OrderReviewResponse;
        idempotent: boolean;
      }>(`/api/orders/${encodeURIComponent(orderId)}/reviews`, body);
    },
  };
}

/** Phase 4 customer API helpers — pass city headers via createApiClient */
export const customerApi = {
  forClient: createCustomerOrderApi,
};
