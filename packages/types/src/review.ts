import type { CityCode } from "./city.js";

export type OrderReviewStatus = "created";

export interface OrderReview {
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

export interface CreateOrderReview {
  rating: number;
  comment: string;
}
