import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const orderReviewStatusSchema = z.enum(["created"]);

export const createOrderReviewSchema = z.object({
  workerId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(500),
}).strict();

export const orderReviewSchema = z.object({
  reviewId: z.string().min(1).max(64),
  cityCode: cityCodeSchema,
  orderId: z.string().min(1).max(64),
  customerId: z.string().min(1).max(64),
  workerId: z.string().min(1).max(64),
  fulfillmentId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(1).max(500),
  status: orderReviewStatusSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();

export type CreateOrderReviewInput = z.infer<typeof createOrderReviewSchema>;
export type OrderReviewInput = z.infer<typeof orderReviewSchema>;
