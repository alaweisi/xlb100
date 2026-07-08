import type { ApiClient } from "./createApiClient.js";

type CityCode = string;
type PriceType = "fixed" | "range" | "from" | "estimate_from" | "onsite_quote";
type OrderStatus = "draft" | "pending_payment" | "paid" | "cancelled";
type PaymentStatus = "pending" | "paid" | "failed" | "closed";
type PaymentProvider = "mock";

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
}

export interface CreatePaymentOrderBody {
  orderId: string;
}

export interface MockPaySuccessBody {
  paymentOrderId: string;
  providerTradeNo: string;
  status: "paid";
}

export interface OrderResponse {
  orderId: string;
  cityCode: CityCode;
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
  };
}

/** Phase 4 customer API helpers — pass city headers via createApiClient */
export const customerApi = {
  forClient: createCustomerOrderApi,
};
