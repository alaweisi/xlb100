import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@xlb/config";
import type { CustomerOrderListQuery, RequestContext } from "@xlb/types";
import { customerOrderListQuerySchema } from "@xlb/validators";

export interface CustomerOrderListScope {
  cityCode: string;
  customerId: string;
  traceId: string;
}

export interface CustomerOrderListCursorPosition {
  createdAt: string;
  orderId: string;
}

type CursorPayload = CustomerOrderListCursorPosition & {
  version: 1;
  scopeHash: string;
};

export class CustomerOrderListValidationError extends Error {
  readonly statusCode = 400;

  constructor(message = "invalid customer order list request") {
    super(message);
    this.name = "CustomerOrderListValidationError";
  }
}

export class CustomerOrderListForbiddenError extends Error {
  readonly statusCode = 403;

  constructor() {
    super("customer order list requires the authenticated customer app role");
    this.name = "CustomerOrderListForbiddenError";
  }
}

function secret(): string {
  return loadEnv().jwtSecret;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function scopeDigest(scope: CustomerOrderListScope): string {
  return createHmac("sha256", secret())
    .update(`customer-order-list-scope-v1\0${scope.cityCode}\0${scope.customerId}`)
    .digest("base64url");
}

function signature(body: string): string {
  return createHmac("sha256", secret())
    .update(`customer-order-list-cursor-v1\0${body}`)
    .digest("base64url");
}

export function requireCustomerOrderListScope(context: RequestContext): CustomerOrderListScope {
  if (
    context.appType !== "customer" ||
    context.role !== "customer" ||
    !context.userId ||
    !context.cityCode ||
    context.cityCode === "__global__"
  ) {
    throw new CustomerOrderListForbiddenError();
  }
  return { cityCode: context.cityCode, customerId: context.userId, traceId: context.traceId };
}

export function parseCustomerOrderListQuery(
  input: unknown,
): Required<Pick<CustomerOrderListQuery, "limit">> & Pick<CustomerOrderListQuery, "cursor"> {
  const value = (input ?? {}) as Record<string, unknown>;
  const parsed = customerOrderListQuerySchema.safeParse({
    ...value,
    ...(value.limit === undefined ? {} : { limit: Number(value.limit) }),
  });
  if (!parsed.success) throw new CustomerOrderListValidationError();
  return { cursor: parsed.data.cursor, limit: parsed.data.limit ?? 20 };
}

export function encodeCustomerOrderListCursor(
  scope: CustomerOrderListScope,
  position: CustomerOrderListCursorPosition,
): string {
  const payload: CursorPayload = {
    version: 1,
    scopeHash: scopeDigest(scope),
    createdAt: position.createdAt,
    orderId: position.orderId,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return Buffer.from(`${body}.${signature(body)}`).toString("base64url");
}

export function decodeCustomerOrderListCursor(
  cursor: string | undefined,
  scope: CustomerOrderListScope,
): CustomerOrderListCursorPosition | undefined {
  if (!cursor) return undefined;
  try {
    const envelope = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = envelope.lastIndexOf(".");
    if (separator < 1) throw new Error("cursor envelope");
    const body = envelope.slice(0, separator);
    const suppliedSignature = envelope.slice(separator + 1);
    if (!safeEqual(suppliedSignature, signature(body))) throw new Error("cursor signature");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      payload.version !== 1 ||
      payload.scopeHash !== scopeDigest(scope) ||
      typeof payload.createdAt !== "string" ||
      !Number.isFinite(Date.parse(payload.createdAt)) ||
      typeof payload.orderId !== "string" ||
      payload.orderId.length < 1 ||
      payload.orderId.length > 64
    ) {
      throw new Error("cursor payload");
    }
    return { createdAt: payload.createdAt, orderId: payload.orderId };
  } catch {
    throw new CustomerOrderListValidationError("invalid customer order cursor");
  }
}
