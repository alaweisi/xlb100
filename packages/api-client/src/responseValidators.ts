import type { LoginCodeResponse, LoginError, LoginResponse } from "./auth.js";
import type { OrderResponse, PaymentOrderResponse } from "./customer.js";
import type { AcceptTaskResponse, FulfillmentDetailResponse, FulfillmentLifecycleResponse, FulfillmentListResponse, WorkerTaskPoolResponse } from "./worker.js";

type JsonObject = Record<string, unknown>;
function object(value: unknown, label: string): JsonObject { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`); return value as JsonObject; }
function string(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`); return value; }
function number(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`); return value; }
function integer(value: unknown, label: string, minimum = 0): number { const parsed = number(value, label); if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new TypeError(`${label} must be a safe integer`); return parsed; }
function boolean(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean`); return value; }
function oneOf(value: unknown, allowed: readonly string[], label: string): string { const parsed = string(value, label); if (!allowed.includes(parsed)) throw new TypeError(`${label} has an unsupported value`); return parsed; }
function ok(value: unknown, label: string): JsonObject { const result = object(value, label); if (result.ok !== true) throw new TypeError(`${label}.ok must be true`); return result; }

function order(value: unknown): void {
  const item = object(value, "order");
  string(item.orderId, "order.orderId"); string(item.cityCode, "order.cityCode");
  string(item.customerId, "order.customerId"); string(item.skuId, "order.skuId");
  oneOf(item.status, ["draft", "pending_dispatch", "service_completed", "pending_payment", "paid", "cancelled"], "order.status");
  number(item.totalAmount, "order.totalAmount"); string(item.currency, "order.currency");
  if (item.quoteSnapshot === null || item.quoteSnapshot === undefined) return;
  const snapshot = object(item.quoteSnapshot, "order.quoteSnapshot");
  if (snapshot.pricingSource !== "marketing") return;
  const gross = integer(snapshot.grossAmountMinor, "order.quoteSnapshot.grossAmountMinor", 2);
  const discount = integer(snapshot.discountAmountMinor, "order.quoteSnapshot.discountAmountMinor", 1);
  const net = integer(snapshot.netAmountMinor, "order.quoteSnapshot.netAmountMinor", 1);
  if (gross !== discount + net) throw new TypeError("Marketing Order money invariant is invalid");
  if (Math.abs(Number(item.totalAmount) * 100 - net) > 1e-6) throw new TypeError("Marketing Order totalAmount must equal netAmountMinor");
  const evidence = object(snapshot.marketingDecision, "order.quoteSnapshot.marketingDecision");
  ["decisionId", "ruleRevisionId", "couponDefinitionId", "grantId", "reservationId", "redemptionId", "issuedAt", "expiresAt", "acceptedAt"]
    .forEach((key) => string(evidence[key], `order.quoteSnapshot.marketingDecision.${key}`));
  integer(evidence.decisionRevision, "order.quoteSnapshot.marketingDecision.decisionRevision", 1);
  const ruleHash = string(evidence.ruleContentHash, "order.quoteSnapshot.marketingDecision.ruleContentHash");
  const fingerprint = string(evidence.requestFingerprint, "order.quoteSnapshot.marketingDecision.requestFingerprint");
  if (!/^[a-f0-9]{64}$/.test(ruleHash) || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new TypeError("Marketing Order hash evidence is invalid");
  }
}
function payment(value: unknown): void { const item = object(value, "paymentOrder"); string(item.paymentOrderId, "paymentOrder.paymentOrderId"); string(item.orderId, "paymentOrder.orderId"); string(item.cityCode, "paymentOrder.cityCode"); oneOf(item.status, ["pending", "paid", "failed", "closed"], "paymentOrder.status"); number(item.amount, "paymentOrder.amount"); string(item.currency, "paymentOrder.currency"); }
function task(value: unknown): void { const item = object(value, "task"); string(item.dispatchTaskId, "task.dispatchTaskId"); string(item.orderId, "task.orderId"); string(item.cityCode, "task.cityCode"); string(item.skuId, "task.skuId"); oneOf(item.status, ["pending", "queued", "offering", "accepted", "expired", "reassigning", "completed", "rejected", "timeout", "no_match", "manual_review", "failed", "cancelled"], "task.status"); number(item.amount, "task.amount"); }
function fulfillment(value: unknown): void { const item = object(value, "fulfillment"); string(item.fulfillmentId, "fulfillment.fulfillmentId"); string(item.acceptanceId, "fulfillment.acceptanceId"); string(item.dispatchTaskId, "fulfillment.dispatchTaskId"); string(item.orderId, "fulfillment.orderId"); string(item.workerId, "fulfillment.workerId"); string(item.cityCode, "fulfillment.cityCode"); string(item.skuId, "fulfillment.skuId"); oneOf(item.status, ["accepted", "in_progress", "completed", "cancelled"], "fulfillment.status"); }

export function validateLoginResponse(value: unknown): LoginResponse | LoginError { const result = object(value, "login response"); if (result.ok === false) { string(result.error, "login response.error"); number(result.statusCode, "login response.statusCode"); return value as LoginError; } if (result.ok !== true) throw new TypeError("login response.ok must be boolean"); string(result.token, "login response.token"); string(result.userId, "login response.userId"); string(result.role, "login response.role"); return value as LoginResponse; }
export function validateLoginCodeResponse(value: unknown): LoginCodeResponse | LoginError { const result = object(value, "login code response"); if (result.ok === false) { string(result.error, "login code response.error"); number(result.statusCode, "login code response.statusCode"); return value as LoginError; } if (result.ok !== true) throw new TypeError("login code response.ok must be boolean"); string(result.expiresAt, "login code response.expiresAt"); number(result.ttlSeconds, "login code response.ttlSeconds"); number(result.attemptsLeft, "login code response.attemptsLeft"); return value as LoginCodeResponse; }
export function validateOrderResponse(value: unknown): { ok: true; order: OrderResponse } { order(ok(value, "order response").order); return value as { ok: true; order: OrderResponse }; }
export function validateCustomerOrderListResponse(value: unknown): { ok: true; orders: OrderResponse[]; nextCursor: string | null } { const result = ok(value, "customer order list response"); if (!Array.isArray(result.orders)) throw new TypeError("customer order list response.orders must be an array"); result.orders.forEach(order); if (result.nextCursor !== null) string(result.nextCursor, "customer order list response.nextCursor"); return value as { ok: true; orders: OrderResponse[]; nextCursor: string | null }; }
export function validatePaymentOrderResponse(value: unknown): { ok: true; paymentOrder: PaymentOrderResponse } { payment(ok(value, "payment response").paymentOrder); return value as { ok: true; paymentOrder: PaymentOrderResponse }; }
export function validatePaymentMutationResponse(value: unknown): { ok: true; paymentOrder: PaymentOrderResponse; orderId: string; idempotent: boolean } { const result = ok(value, "payment mutation response"); payment(result.paymentOrder); string(result.orderId, "payment mutation response.orderId"); boolean(result.idempotent, "payment mutation response.idempotent"); return value as { ok: true; paymentOrder: PaymentOrderResponse; orderId: string; idempotent: boolean }; }
export function validateWorkerTaskPoolResponse(value: unknown): WorkerTaskPoolResponse { const result = ok(value, "worker task pool response"); string(result.cityCode, "worker task pool response.cityCode"); if (!Array.isArray(result.tasks)) throw new TypeError("worker task pool response.tasks must be an array"); result.tasks.forEach(task); return value as WorkerTaskPoolResponse; }
export function validateAcceptTaskResponse(value: unknown): AcceptTaskResponse { const result = ok(value, "accept task response"); const acceptance = object(result.acceptance, "acceptance"); string(acceptance.acceptanceId, "acceptance.acceptanceId"); string(acceptance.dispatchTaskId, "acceptance.dispatchTaskId"); string(acceptance.workerId, "acceptance.workerId"); fulfillment(result.fulfillment); boolean(result.idempotent, "accept task response.idempotent"); return value as AcceptTaskResponse; }
export function validateFulfillmentListResponse(value: unknown): FulfillmentListResponse { const result = ok(value, "fulfillment list response"); string(result.cityCode, "fulfillment list response.cityCode"); if (!Array.isArray(result.fulfillments)) throw new TypeError("fulfillments must be an array"); result.fulfillments.forEach(fulfillment); return value as FulfillmentListResponse; }
export function validateFulfillmentDetailResponse(value: unknown): FulfillmentDetailResponse { const result = ok(value, "fulfillment detail response"); fulfillment(result.fulfillment); return value as FulfillmentDetailResponse; }
export function validateFulfillmentLifecycleResponse(value: unknown): FulfillmentLifecycleResponse { const result = ok(value, "fulfillment lifecycle response"); fulfillment(result.fulfillment); boolean(result.idempotent, "fulfillment lifecycle response.idempotent"); return value as FulfillmentLifecycleResponse; }
