import type { OrderCreatedEventPayload, OrderPaidEventPayload, PaymentPaidEventPayload } from "@xlb/types";

export function buildOrderCreatedPayload(input: {
  orderId: string;
  cityCode: OrderCreatedEventPayload["cityCode"];
  customerId: string;
  skuId: string;
  totalAmount: number;
  createdAt: string;
}): OrderCreatedEventPayload {
  return {
    orderId: input.orderId,
    cityCode: input.cityCode,
    customerId: input.customerId,
    skuId: input.skuId,
    totalAmount: input.totalAmount,
    createdAt: input.createdAt,
  };
}

export function buildOrderPaidPayload(input: {
  orderId: string;
  cityCode: OrderPaidEventPayload["cityCode"];
  customerId: string;
  skuId: string;
  amount: number;
  paidAt: string;
}): OrderPaidEventPayload {
  return {
    orderId: input.orderId,
    cityCode: input.cityCode,
    customerId: input.customerId,
    skuId: input.skuId,
    amount: input.amount,
    paidAt: input.paidAt,
  };
}

export function buildPaymentPaidPayload(input: {
  paymentOrderId: string;
  orderId: string;
  cityCode: PaymentPaidEventPayload["cityCode"];
  amount: number;
  providerTradeNo: string;
  paidAt: string;
}): PaymentPaidEventPayload {
  return {
    paymentOrderId: input.paymentOrderId,
    orderId: input.orderId,
    cityCode: input.cityCode,
    amount: input.amount,
    providerTradeNo: input.providerTradeNo,
    paidAt: input.paidAt,
  };
}
