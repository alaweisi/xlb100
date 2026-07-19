import type { ApiClient } from "./createApiClient.js";
import { validateLoginCodeResponse, validateLoginResponse } from "./responseValidators.js";

const AUTH_FAILURE_STATUSES = [400, 401, 403, 404, 429] as const;

// ── Response types ──

export interface LoginResponse {
  ok: true;
  token: string;
  userId: string;
  role: string;
}

export interface LoginError {
  ok: false;
  error: string;
  statusCode: number;
  attemptsLeft?: number;
  code?: "WORKER_ACCESS_SUSPENDED" | "WORKER_ACCESS_DISABLED";
  workerAccessStatus?: "suspended" | "disabled";
}

export interface LoginCodeResponse {
  ok: true;
  expiresAt: string;
  ttlSeconds: number;
  attemptsLeft: number;
}

export interface DebugLoginCodeResponse {
  ok: true;
  code: string;
  expiresAt: string;
  attemptsLeft: number;
}

// ── API ──

export function createAuthApi(client: ApiClient) {
  return {
    requestCustomerLoginCode(phone: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/customer/code", { phone }, { validate: validateLoginCodeResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    customerLogin(phone: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/customer/login", { phone, code }, { validate: validateLoginResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    getCustomerDebugCode(phone: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/customer/debug-code?${new URLSearchParams({ phone }).toString()}`,
      );
    },
    requestAdminLoginCode(username: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/admin/code", { username }, { validate: validateLoginCodeResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    adminLogin(username: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/admin/login", { username, code }, { validate: validateLoginResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    getAdminDebugCode(username: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/admin/debug-code?${new URLSearchParams({ username }).toString()}`,
      );
    },
    requestOaLoginCode(username: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/oa/code", { username }, { validate: validateLoginCodeResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    oaLogin(username: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/oa/login", { username, code }, { validate: validateLoginResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    getOaDebugCode(username: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/oa/debug-code?${new URLSearchParams({ username }).toString()}`,
      );
    },
    requestDashboardLoginCode(username: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/dashboard/code", { username }, { validate: validateLoginCodeResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    dashboardLogin(username: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/dashboard/login", { username, code }, { validate: validateLoginResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    getDashboardDebugCode(username: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/dashboard/debug-code?${new URLSearchParams({ username }).toString()}`,
      );
    },
    requestWorkerLoginCode(phone: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/worker/code", { phone }, { validate: validateLoginCodeResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    workerLogin(phone: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/worker/login", { phone, code }, { validate: validateLoginResponse, acceptedStatuses: AUTH_FAILURE_STATUSES });
    },
    getWorkerDebugCode(phone: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/worker/debug-code?${new URLSearchParams({ phone }).toString()}`,
      );
    },
  };
}

export const authApi = {
  forClient: createAuthApi,
};
