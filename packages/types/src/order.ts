import type { CityCode } from "./city.js";
import type { ServiceSkuProfile, ServiceStandard } from "./catalog.js";
import type { PriceQuoteBreakdown, PriceType } from "./pricing.js";

export type OrderStatus =
  | "draft"
  | "pending_dispatch"
  | "service_completed"
  | "pending_payment"
  | "paid"
  | "cancelled";
export type ScheduledTimeSlot = "morning" | "afternoon" | "evening";

export interface Order {
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
  quoteSnapshot: OrderPriceSnapshot | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderPriceSnapshot {
  priceRuleId: string;
  skuId: string;
  quantity: number;
  currency: string;
  priceText: string;
  priceType: PriceType;
  unitAmount: number;
  totalAmount: number;
  breakdown: PriceQuoteBreakdown;
  skuProfile: ServiceSkuProfile | null;
  standards: ServiceStandard[];
}
