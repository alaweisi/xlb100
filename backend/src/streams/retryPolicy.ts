/** Phase 5A retry policy — placeholder for Phase 5B+ stream consumer retries */

export const DEFAULT_STREAM_RETRY_MAX = 3;
export const DEFAULT_STREAM_RETRY_DELAY_MS = 1000;

export type RetryPolicy = {
  maxAttempts: number;
  delayMs: number;
};

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: DEFAULT_STREAM_RETRY_MAX,
  delayMs: DEFAULT_STREAM_RETRY_DELAY_MS,
};
