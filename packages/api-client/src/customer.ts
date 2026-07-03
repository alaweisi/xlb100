import type { ApiClient } from "./createApiClient.js";

export interface CreateOrderBody {
  customerId: string;
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
  cityCode: string;
  customerId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  unit: string;
  priceRuleId: string;
  priceText: string;
  priceType: string;
  basePrice: number;
  currency: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentOrderResponse {
  paymentOrderId: string;
  orderId: string;
  cityCode: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerTradeNo: string | null;
  metadata: {
    orderId: string;
    cityCode: string;
    skuId: string;
    priceRuleId: string;
    customerId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export function createCustomerOrderApi(client: ApiClient) {
  return {
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
