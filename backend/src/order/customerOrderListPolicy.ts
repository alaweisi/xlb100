import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@xlb/config";
import type {
  CustomerOrderListFilter,
  CustomerOrderListQuery,
  RequestContext,
} from "@xlb/types";
import { customerOrderListQuerySchema } from "@xlb/validators";

export interface CustomerOrderListScope {
  cityCode: string;
  customerId: string;
}

export interface CustomerOrderListCursorPosition {
  createdAt: string;
  orderId: string;
}

type CursorPayload = CustomerOrderListCursorPosition & {
  version: 1;
  filter: CustomerOrderListFilter;
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

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function scopeDigest(scope: CustomerOrderListScope, filter: CustomerOrderListFilter): string {
  return createHmac("sha256", secret())
    .update(`customer-order-list-scope-v1\0${scope.cityCode}\0${scope.customerId}\0${filter}`)
    .digest("base64url");
}

function cursorSignature(body: string): string {
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
  return { cityCode: context.cityCode, customerId: context.userId };
}

export function parseCustomerOrderListQuery(
  input: unknown,
): Required<Pick<CustomerOrderListQuery, "limit" | "filter">> &
  Pick<CustomerOrderListQuery, "cursor"> {
  const value = (input ?? {}) as Record<string, unknown>;
  const normalized = {
    ...value,
    ...(value.limit === undefined ? {} : { limit: Number(value.limit) }),
  };
  const parsed = customerOrderListQuerySchema.safeParse(normalized);
  if (!parsed.success) throw new CustomerOrderListValidationError();
  return {
    cursor: parsed.data.cursor,
    limit: parsed.data.limit ?? 20,
    filter: parsed.data.filter ?? "all",
  };
}

export function encodeCustomerOrderListCursor(
  scope: CustomerOrderListScope,
  filter: CustomerOrderListFilter,
  position: CustomerOrderListCursorPosition,
): string {
  const payload: CursorPayload = {
    version: 1,
    filter,
    scopeHash: scopeDigest(scope, filter),
    createdAt: position.createdAt,
    orderId: position.orderId,
  };
  const body = base64Url(JSON.stringify(payload));
  return base64Url(`${body}.${cursorSignature(body)}`);
}

export function decodeCustomerOrderListCursor(
  cursor: string | undefined,
  scope: CustomerOrderListScope,
  filter: CustomerOrderListFilter,
): CustomerOrderListCursorPosition | undefined {
  if (!cursor) return undefined;
  try {
    const envelope = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = envelope.lastIndexOf(".");
    if (separator < 1) throw new Error("cursor envelope");
    const body = envelope.slice(0, separator);
    const signature = envelope.slice(separator + 1);
    if (!safeEqual(signature, cursorSignature(body))) throw new Error("cursor signature");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      payload.version !== 1 ||
      payload.filter !== filter ||
      payload.scopeHash !== scopeDigest(scope, filter) ||
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
    throw new CustomerOrderListValidationError("invalid customer order list cursor");
  }
}
