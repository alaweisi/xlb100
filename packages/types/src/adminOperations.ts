import type { CityCode } from "./city.js";
import type { OrderStatus } from "./order.js";

export interface AdminOrderSummary {
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  skuId: string;
  skuName: string;
  status: OrderStatus;
  totalAmount: number;
  scheduledAt: string;
  createdAt: string;
}

export interface AdminSkuOperationsRow {
  skuId: string;
  cityCode: CityCode;
  categoryName: string;
  itemName: string;
  skuName: string;
  unit: string;
  isEnabled: boolean;
  basePrice: number | null;
  priceType: string | null;
  warrantyDays: number | null;
  supportsEnterprise: boolean | null;
}
