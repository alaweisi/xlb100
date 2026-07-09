import { createApiClient, createAuthApi, workerApi } from "@xlb/api-client";

const DEFAULT_WORKER_PHONE = "13800000001";

export interface WorkerSession {
  token: string;
  userId: string;
  role: string;
  phone: string;
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
  };
}

export async function loginWorker(phone = DEFAULT_WORKER_PHONE): Promise<WorkerSession> {
  await requestWorkerLoginCode(phone);
  const debugCode = await readWorkerDebugCode(phone);
  return loginWorkerWithCode(phone, debugCode.code);
}

export function createWorkerApiClient(cityCode: string, session: WorkerSession) {
  return workerApi.create(
    createApiClient({
      baseUrl: getWorkerApiBase(),
      headers: {
        "x-xlb-city-code": cityCode,
        Authorization: `Bearer ${session.token}`,
      },
    }),
  );
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && /\b401\b/.test(error.message);
}
