import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

export const orderReviewStatusSchema = z.enum(["created"]);
export const reviewVisibilitySchema = z.enum(["pending_moderation", "visible", "hidden"]);
export const reviewAppealStatusSchema = z.enum(["open", "upheld", "rejected", "withdrawn"]);
export const reviewAppealSubjectTypeSchema = z.enum(["customer", "worker"]);

export const createOrderReviewSchema = z.object({
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

export const createReviewAppealRequestSchema = z.object({
  moderationVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1_000),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const moderateReviewRequestSchema = z.object({
  decision: z.enum(["visible", "hidden"]),
  reasonCode: z.string().trim().regex(/^[a-z][a-z0-9_]{1,63}$/),
  reason: z.string().trim().min(1).max(1_000),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const resolveReviewAppealRequestSchema = z.object({
  resolution: z.enum(["upheld", "rejected"]),
  reason: z.string().trim().min(1).max(1_000),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export const withdrawReviewAppealRequestSchema = z.object({
  moderationVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(8).max(128),
}).strict();

export type CreateOrderReviewInput = z.infer<typeof createOrderReviewSchema>;
export type OrderReviewInput = z.infer<typeof orderReviewSchema>;
export type CreateReviewAppealRequestInput = z.infer<typeof createReviewAppealRequestSchema>;
export type ModerateReviewRequestInput = z.infer<typeof moderateReviewRequestSchema>;
export type ResolveReviewAppealRequestInput = z.infer<typeof resolveReviewAppealRequestSchema>;
export type WithdrawReviewAppealRequestInput = z.infer<typeof withdrawReviewAppealRequestSchema>;
