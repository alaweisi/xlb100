export const DEFAULT_STREAM_RETRY_MAX = 3;
export const DEFAULT_STREAM_RETRY_DELAY_MS = 30_000;
export const DEFAULT_STREAM_RETRY_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;

export type RetryPolicy = {
  maxAttempts: number;
  delayMs: number;
};

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: DEFAULT_STREAM_RETRY_MAX,
  delayMs: DEFAULT_STREAM_RETRY_DELAY_MS,
};
