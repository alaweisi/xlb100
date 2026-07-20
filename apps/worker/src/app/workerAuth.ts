import { createApiClient, createAuthApi, workerApi, type LoginCodeResponse } from "@xlb/api-client";

const DEFAULT_WORKER_PHONE = "13800000001";
const WORKER_SESSION_KEY = "xlb.worker.session";
const CLOUD_TEST_MODE = (
  import.meta as ImportMeta & { env?: { VITE_XLB_CLOUD_TEST_MODE?: string } }
).env?.VITE_XLB_CLOUD_TEST_MODE === "true";

interface WorkerLoginCodeResult extends LoginCodeResponse {
  debugCode?: string;
}

export interface WorkerSession {
  token: string;
  userId: string;
  role: string;
  phone: string;
}

export type WorkerAccessStatus = "suspended" | "disabled";

export class WorkerAccessError extends Error {
  constructor(public readonly status: WorkerAccessStatus) {
    super(status === "suspended" ? "师傅账号当前已暂停" : "师傅账号当前已停用");
    this.name = "WorkerAccessError";
  }
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

function authErrorMessage(error: string, fallback: string): string {
  if (/invalid phone/i.test(error)) return "请输入正确的中国大陆手机号";
  if (/not found/i.test(error)) return "未找到对应的师傅账号";
  if (/too recently|cooldown/i.test(error)) return "验证码发送过于频繁，请稍后再试";
  if (/invalid|expired|verification code|otp/i.test(error)) return "验证码无效或已过期，请重新获取";
  return fallback;
}

export async function requestWorkerLoginCode(phone = DEFAULT_WORKER_PHONE): Promise<WorkerLoginCodeResult> {
  const auth = createWorkerAuthClient();
  const result = await auth.requestWorkerLoginCode(phone);
  if (!result.ok) throw new Error(authErrorMessage(result.error, "验证码发送失败，请稍后重试"));
  if (!CLOUD_TEST_MODE) return result;
  const debug = await auth.getWorkerDebugCode(phone);
  if (!debug.ok) throw new Error(authErrorMessage(debug.error, "云测验证码读取失败，请重新获取"));
  return { ...result, debugCode: debug.code };
}

export async function loginWorkerWithCode(phone: string, code: string): Promise<WorkerSession> {
  const auth = createWorkerAuthClient();
  const result = await auth.workerLogin(phone, code);
  if (!result.ok) {
    if (result.workerAccessStatus === "suspended" || result.workerAccessStatus === "disabled") {
      throw new WorkerAccessError(result.workerAccessStatus);
    }
    throw new Error(authErrorMessage(result.error, "师傅登录失败，请核对验证码后重试"));
  }
  const session = {
    token: result.token,
    userId: result.userId,
    role: result.role,
    phone,
  };
  storeWorkerSession(session);
  return session;
}

export function readStoredWorkerSession(): WorkerSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKER_SESSION_KEY) ?? "null") as Partial<WorkerSession> | null;
    return parsed?.token && parsed.userId && parsed.role && parsed.phone ? parsed as WorkerSession : null;
  } catch {
    return null;
  }
}

export function storeWorkerSession(session: WorkerSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(session));
}

export function clearWorkerSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WORKER_SESSION_KEY);
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
