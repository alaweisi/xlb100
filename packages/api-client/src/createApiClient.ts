export type ApiClientErrorKind =
  | "network"
  | "timeout"
  | "cancelled"
  | "http"
  | "response_format";

export type ResponseValidator<T> = (value: unknown) => T;
export type RetryMode = "none" | "idempotent";

export interface ApiRequestOptions<T> {
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: RetryMode;
  validate?: ResponseValidator<T>;
  /** HTTP statuses whose JSON body is an expected, validated business response. */
  acceptedStatuses?: readonly number[];
}

export interface ApiClientOptions {
  baseUrl: string;
  headers?: Record<string, string> | ((path: string, method: string) => Record<string, string>);
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  maxRetryAfterMs?: number;
  onUnauthorized?: (error: ApiClientError) => void;
}

export interface ApiClient {
  get<T>(path: string, options?: ApiRequestOptions<T>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions<T>): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: ApiRequestOptions<T>): Promise<T>;
  delete<T>(path: string, body?: unknown, options?: ApiRequestOptions<T>): Promise<T>;
  postBinary<T>(
    path: string,
    body: Blob,
    options: { contentType: string; fileName: string },
    requestOptions?: ApiRequestOptions<T>,
  ): Promise<T>;
}

const ERROR_BODY_LIMIT = 2_048;

export class ApiClientError extends Error {
  readonly kind: ApiClientErrorKind;
  readonly method: string;
  readonly path: string;
  readonly status?: number;
  readonly responseBody?: string;
  readonly retryAfterMs?: number;

  constructor(input: {
    kind: ApiClientErrorKind;
    message: string;
    method: string;
    path: string;
    status?: number;
    responseBody?: string;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "ApiClientError";
    this.kind = input.kind;
    this.method = input.method;
    this.path = input.path;
    this.status = input.status;
    this.responseBody = input.responseBody;
    this.retryAfterMs = input.retryAfterMs;
  }
}

function sanitizeErrorBody(raw: string): string {
  return raw
    .slice(0, ERROR_BODY_LIMIT)
    .replace(/(authorization|token|password|secret|code)(["'\s:=]+)([^,}\s"]+)/gi, "$1$2[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[REDACTED_PHONE]")
    .slice(0, ERROR_BODY_LIMIT);
}

function parseRetryAfter(value: string | null, maxMs: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  const requested = Number.isFinite(seconds)
    ? Math.max(0, seconds * 1_000)
    : Math.max(0, Date.parse(value) - Date.now());
  if (!Number.isFinite(requested)) return undefined;
  return Math.min(requested, maxMs);
}

function isRetryable(error: ApiClientError): boolean {
  return error.kind === "network" ||
    error.kind === "timeout" ||
    (error.kind === "http" && error.status !== undefined &&
      (error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(done, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    function done() {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const {
    baseUrl,
    headers = {},
    timeoutMs: defaultTimeoutMs = 10_000,
    maxRetries = 2,
    retryDelayMs = 100,
    maxRetryAfterMs = 5_000,
    onUnauthorized,
  } = options;

  function resolveHeaders(path: string, method: string): Record<string, string> {
    return typeof headers === "function" ? headers(path, method) : headers;
  }

  async function attempt<T>(
    method: string,
    path: string,
    body: BodyInit | undefined,
    contentHeaders: Record<string, string>,
    requestOptions: ApiRequestOptions<T>,
  ): Promise<T> {
    if (requestOptions.signal?.aborted) {
      throw new ApiClientError({ kind: "cancelled", message: `API ${method} ${path} cancelled`, method, path });
    }

    const controller = new AbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort(requestOptions.signal?.reason);
    requestOptions.signal?.addEventListener("abort", onExternalAbort, { once: true });
    const effectiveTimeout = requestOptions.timeoutMs ?? defaultTimeoutMs;
    const timer = effectiveTimeout > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort(new Error("request timeout"));
        }, effectiveTimeout)
      : undefined;

    try {
      const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: { ...contentHeaders, ...resolveHeaders(path, method) },
          body,
          signal: controller.signal,
        });
      } catch (cause) {
        const kind: ApiClientErrorKind = timedOut
          ? "timeout"
          : requestOptions.signal?.aborted
            ? "cancelled"
            : "network";
        throw new ApiClientError({ kind, message: `API ${method} ${path} ${kind}`, method, path, cause });
      }

      let text: string;
      try {
        text = await response.text();
      } catch (cause) {
        const kind: ApiClientErrorKind = timedOut
          ? "timeout"
          : requestOptions.signal?.aborted
            ? "cancelled"
            : "network";
        throw new ApiClientError({ kind, message: `API ${method} ${path} ${kind}`, method, path, cause });
      }
      if (!response.ok && !requestOptions.acceptedStatuses?.includes(response.status)) {
        const error = new ApiClientError({
          kind: "http",
          message: `API ${method} ${path} failed: ${response.status}`,
          method,
          path,
          status: response.status,
          responseBody: sanitizeErrorBody(text),
          retryAfterMs: parseRetryAfter(response.headers.get("Retry-After"), maxRetryAfterMs),
        });
        if (response.status === 401) onUnauthorized?.(error);
        throw error;
      }

      let parsed: unknown;
      try {
        parsed = text === "" ? null : JSON.parse(text);
      } catch (cause) {
        throw new ApiClientError({
          kind: "response_format",
          message: `API ${method} ${path} returned invalid JSON`,
          method,
          path,
          cause,
        });
      }

      try {
        return requestOptions.validate ? requestOptions.validate(parsed) : parsed as T;
      } catch (cause) {
        if (cause instanceof ApiClientError) throw cause;
        throw new ApiClientError({
          kind: "response_format",
          message: `API ${method} ${path} response failed validation`,
          method,
          path,
          cause,
        });
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      requestOptions.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  async function request<T>(
    method: string,
    path: string,
    body: BodyInit | undefined,
    contentHeaders: Record<string, string>,
    requestOptions: ApiRequestOptions<T> = {},
  ): Promise<T> {
    const retryAllowed = requestOptions.retry !== "none" &&
      (method === "GET" || requestOptions.retry === "idempotent");
    for (let attemptNumber = 0; ; attemptNumber += 1) {
      try {
        return await attempt(method, path, body, contentHeaders, requestOptions);
      } catch (error) {
        const apiError = error instanceof ApiClientError
          ? error
          : new ApiClientError({ kind: "network", message: `API ${method} ${path} network`, method, path, cause: error });
        if (!retryAllowed || attemptNumber >= maxRetries || !isRetryable(apiError)) throw apiError;
        try {
          await wait(apiError.retryAfterMs ?? Math.min(retryDelayMs * 2 ** attemptNumber, maxRetryAfterMs), requestOptions.signal);
        } catch (cause) {
          throw new ApiClientError({ kind: "cancelled", message: `API ${method} ${path} cancelled`, method, path, cause });
        }
      }
    }
  }

  return {
    get: <T>(path: string, requestOptions?: ApiRequestOptions<T>) =>
      request<T>("GET", path, undefined, { "Content-Type": "application/json" }, requestOptions),
    post: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions<T>) =>
      request<T>("POST", path, body !== undefined ? JSON.stringify(body) : undefined, { "Content-Type": "application/json" }, requestOptions),
    patch: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions<T>) =>
      request<T>("PATCH", path, body !== undefined ? JSON.stringify(body) : undefined, { "Content-Type": "application/json" }, requestOptions),
    delete: <T>(path: string, body?: unknown, requestOptions?: ApiRequestOptions<T>) =>
      request<T>("DELETE", path, body !== undefined ? JSON.stringify(body) : undefined, { "Content-Type": "application/json" }, requestOptions),
    postBinary: <T>(path: string, body: Blob, binaryOptions: { contentType: string; fileName: string }, requestOptions?: ApiRequestOptions<T>) =>
      request<T>("POST", path, body, {
        "Content-Type": binaryOptions.contentType,
        "X-File-Name": encodeURIComponent(binaryOptions.fileName),
      }, requestOptions),
  };
}
