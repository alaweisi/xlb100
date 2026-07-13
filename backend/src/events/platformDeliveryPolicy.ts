export const PLATFORM_DELIVERY_DEVELOPMENT_DEFAULTS = Object.freeze({
  leaseSeconds: 30,
  maxAttempts: 5,
  maxClaimBatch: 25,
});

export const PLATFORM_DELIVERY_CANONICAL_ERRORS = Object.freeze({
  PLATFORM_DELIVERY_ERROR: "platform delivery failed",
  INVALID_EVENT_PAYLOAD: "event payload does not exactly match the approved implicit-v0 compatibility shape",
  UNSUPPORTED_EVENT_TYPE: "event type has no approved implicit-v0 compatibility shape",
  UNSUPPORTED_EVENT_VERSION: "source compatibility major does not match exact subscription major",
  CITY_SCOPE_MISMATCH: "source event city scope mismatch",
  LEASE_EXPIRED: "platform delivery processing lease expired",
} as const);

export type PlatformDeliveryCanonicalErrorCode = keyof typeof PLATFORM_DELIVERY_CANONICAL_ERRORS;

export interface PlatformDeliveryErrorProjection {
  code: PlatformDeliveryCanonicalErrorCode;
  message: (typeof PLATFORM_DELIVERY_CANONICAL_ERRORS)[PlatformDeliveryCanonicalErrorCode];
}

/**
 * Only code-authored internal failures may retain an approved canonical code.
 * The persisted message is always derived from the closed catalog, never from
 * the Error instance.
 */
export class PlatformDeliveryCanonicalError extends Error {
  readonly code: PlatformDeliveryCanonicalErrorCode;

  constructor(code: PlatformDeliveryCanonicalErrorCode) {
    super(PLATFORM_DELIVERY_CANONICAL_ERRORS[code]);
    this.name = "PlatformDeliveryCanonicalError";
    this.code = code;
  }
}

/**
 * Safe local defaults only. Subscription rows must persist explicit policy
 * values, and production Operations approval remains a later Gate.
 */
export function platformRetryDelaySeconds(attemptCount: number): number {
  const exponent = Math.max(0, Math.min(8, Math.trunc(attemptCount) - 1));
  return Math.min(300, 2 ** exponent);
}

export function projectPlatformDeliveryError(error: unknown): PlatformDeliveryErrorProjection {
  const code = error instanceof PlatformDeliveryCanonicalError
    && Object.prototype.hasOwnProperty.call(PLATFORM_DELIVERY_CANONICAL_ERRORS, error.code)
    ? error.code
    : "PLATFORM_DELIVERY_ERROR";
  return {
    code,
    message: PLATFORM_DELIVERY_CANONICAL_ERRORS[code],
  };
}
