import type { Order } from "@xlb/types";
import type { PaymentOrderMetadata } from "@xlb/types";

export function buildPaymentMetadata(order: Order): PaymentOrderMetadata {
  return {
    orderId: order.orderId,
    cityCode: order.cityCode,
    skuId: order.skuId,
    priceRuleId: order.priceRuleId,
    customerId: order.customerId,
  };
}
