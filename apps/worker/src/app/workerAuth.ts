import {
  type ApiClient,
  createApiClient,
  createAuthApi,
  workerApi,
} from "@xlb/api-client";
import {
  IS_WORKER_INVESTOR_DEMO,
  WORKER_DEMO_SESSION_TTL_MS,
} from "../investorDemo";

const DEFAULT_WORKER_PHONE = "13800000001";
export const WORKER_SESSION_EXPIRED_EVENT = "xlb-worker-session-expired";

export interface WorkerSession {
  token: string;
  userId: string;
  role: string;
  phone: string;
  expiresAt?: number;
}

function normalizeApiBase(value: string | undefined): string {
  const raw = (value || "").trim().replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw.slice(0, -4) : raw;
}

export function getWorkerApiBase(): string {
  return normalizeApiBase(
    (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE,
  );
}

function createWorkerAuthClient() {
  return createAuthApi(createApiClient({ baseUrl: getWorkerApiBase() }));
}

function assertOk<T extends { ok: true } | { ok: false; error: string }>(
  result: T,
  fallback: string,
): Extract<T, { ok: true }> {
  if (!result.ok) {
    throw new Error(result.error || fallback);
  }
  return result as Extract<T, { ok: true }>;
}

export async function requestWorkerLoginCode(phone = DEFAULT_WORKER_PHONE) {
  const auth = createWorkerAuthClient();
  return assertOk(await auth.requestWorkerLoginCode(phone), "Worker login code request failed");
}

export async function readWorkerDebugCode(phone = DEFAULT_WORKER_PHONE) {
  const auth = createWorkerAuthClient();
  return assertOk(await auth.getWorkerDebugCode(phone), "Worker debug code unavailable");
}

export async function loginWorkerWithCode(phone: string, code: string): Promise<WorkerSession> {
  const auth = createWorkerAuthClient();
  const result = assertOk(await auth.workerLogin(phone, code), "Worker login failed");
  return {
    token: result.token,
    userId: result.userId,
    role: result.role,
    phone,
    ...(IS_WORKER_INVESTOR_DEMO
      ? { expiresAt: Date.now() + WORKER_DEMO_SESSION_TTL_MS }
      : {}),
  };
}

export async function loginWorker(phone = DEFAULT_WORKER_PHONE): Promise<WorkerSession> {
  await requestWorkerLoginCode(phone);
  const debugCode = await readWorkerDebugCode(phone);
  return loginWorkerWithCode(phone, debugCode.code);
}

async function guardWorkerRequest<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (isUnauthorizedError(error) && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(WORKER_SESSION_EXPIRED_EVENT));
    }
    throw error;
  }
}

function withWorkerSessionGuard(client: ApiClient): ApiClient {
  return {
    get: (path, options) => guardWorkerRequest(client.get(path, options)),
    post: (path, body, options) =>
      guardWorkerRequest(client.post(path, body, options)),
    patch: (path, body, options) =>
      guardWorkerRequest(client.patch(path, body, options)),
    delete: (path, body, options) =>
      guardWorkerRequest(client.delete(path, body, options)),
    postBinary: (path, body, binaryOptions, options) =>
      guardWorkerRequest(
        client.postBinary(path, body, binaryOptions, options),
      ),
  };
}

export function createWorkerApiClient(cityCode: string, session: WorkerSession) {
  return workerApi.create(
    withWorkerSessionGuard(
      createApiClient({
        baseUrl: getWorkerApiBase(),
        headers: {
          "x-xlb-city-code": cityCode,
          Authorization: `Bearer ${session.token}`,
        },
      }),
    ),
  );
}

export function isUnauthorizedError(error: unknown): boolean {
  const status = error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : undefined;
  return status === 401 || (error instanceof Error && /\b401\b/.test(error.message));
}

export function workerVisibleError(error: unknown, fallback: string): string {
  const status = error && typeof error === "object" && "status" in error
    ? Number(error.status)
    : undefined;
  const message = error instanceof Error ? error.message : "";
  if (status === 401 || /\b401\b/u.test(message)) return "演示登录已过期，请重新登录。";
  if (status === 403 || /\b403\b/u.test(message)) return "当前演示账号没有执行此操作的权限。";
  if (status === 404 || /\b404\b/u.test(message)) return "演示服务正在同步，请稍后重试。";
  if (status === 409 || /\b409\b/u.test(message)) return "任务状态已更新，请刷新后再试。";
  if (/network|fetch|timeout|offline|连接|网络/iu.test(message)) {
    return "网络连接不稳定，请检查网络后重试。";
  }
  return fallback;
}
