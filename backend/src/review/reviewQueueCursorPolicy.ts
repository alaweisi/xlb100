import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@xlb/config";
import type { CityCode } from "@xlb/types";

export type ReviewQueueKind = "moderation" | "appeal";
export type ReviewQueueRole = "admin" | "operator" | "auditor";

export interface ReviewQueueCursorScope {
  kind: ReviewQueueKind;
  cityCode: CityCode;
  role: ReviewQueueRole;
  filter: string;
}

export interface ReviewQueueCursorPosition {
  createdAt: string;
  entityId: string;
}

type CursorPayload = ReviewQueueCursorPosition & {
  version: 1;
  scopeHash: string;
};

export class ReviewQueueCursorValidationError extends Error {
  readonly statusCode = 400;

  constructor(message = "invalid review queue cursor") {
    super(message);
    this.name = "ReviewQueueCursorValidationError";
  }
}

function secret(): string {
  return loadEnv().jwtSecret;
}

function hmac(domain: string, value: string): string {
  return createHmac("sha256", secret()).update(`${domain}\0${value}`).digest("base64url");
}

function scopeHash(scope: ReviewQueueCursorScope): string {
  return hmac(
    "review-queue-scope-v1",
    `${scope.kind}\0${scope.cityCode}\0${scope.role}\0${scope.filter}`,
  );
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function encodeReviewQueueCursor(
  scope: ReviewQueueCursorScope,
  position: ReviewQueueCursorPosition,
): string {
  const payload: CursorPayload = {
    version: 1,
    scopeHash: scopeHash(scope),
    createdAt: position.createdAt,
    entityId: position.entityId,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = hmac("review-queue-cursor-v1", body);
  return Buffer.from(`${body}.${signature}`, "utf8").toString("base64url");
}

export function decodeReviewQueueCursor(
  cursor: unknown,
  scope: ReviewQueueCursorScope,
): ReviewQueueCursorPosition | undefined {
  if (cursor === undefined || cursor === "") return undefined;
  if (typeof cursor !== "string" || cursor.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new ReviewQueueCursorValidationError();
  }
  try {
    const envelope = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = envelope.lastIndexOf(".");
    if (separator < 1) throw new Error("cursor envelope");
    const body = envelope.slice(0, separator);
    const signature = envelope.slice(separator + 1);
    if (!safeEqual(signature, hmac("review-queue-cursor-v1", body))) {
      throw new Error("cursor signature");
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      payload.version !== 1
      || payload.scopeHash !== scopeHash(scope)
      || typeof payload.createdAt !== "string"
      || !Number.isFinite(Date.parse(payload.createdAt))
      || typeof payload.entityId !== "string"
      || payload.entityId.length < 1
      || payload.entityId.length > 64
    ) {
      throw new Error("cursor payload");
    }
    return { createdAt: payload.createdAt, entityId: payload.entityId };
  } catch (error) {
    if (error instanceof ReviewQueueCursorValidationError) throw error;
    throw new ReviewQueueCursorValidationError();
  }
}
