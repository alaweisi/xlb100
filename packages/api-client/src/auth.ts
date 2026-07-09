import type { ApiClient } from "./createApiClient.js";

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
      return client.post<LoginCodeResponse | LoginError>("/api/auth/customer/code", {
        phone,
      });
    },
    customerLogin(phone: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/customer/login", {
        phone,
        code,
      });
    },
    getCustomerDebugCode(phone: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/customer/debug-code?${new URLSearchParams({ phone }).toString()}`,
      );
    },
    requestAdminLoginCode(username: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/admin/code", {
        username,
      });
    },
    adminLogin(username: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/admin/login", {
        username,
        code,
      });
    },
    getAdminDebugCode(username: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/admin/debug-code?${new URLSearchParams({ username }).toString()}`,
      );
    },
    requestWorkerLoginCode(phone: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/worker/code", {
        phone,
      });
    },
    workerLogin(phone: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/worker/login", {
        phone,
        code,
      });
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
