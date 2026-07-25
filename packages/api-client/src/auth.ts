import type { ApiClient } from "./createApiClient.js";
import { validateLoginCodeResponse, validateLoginResponse } from "./responseValidators.js";

// ── Response types ──

export interface LoginResponse {
  ok: true;
  token: string;
  userId: string;
  role: string;
}

export interface OaLoginResponse extends LoginResponse {
  sessionId: string;
  membershipId: string;
  organizationId: string;
  organizationName: string;
  organizationType: "headquarters" | "branch";
  expiresAt: string;
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
      return client.post<LoginCodeResponse | LoginError>("/api/auth/customer/code", { phone }, { validate: validateLoginCodeResponse });
    },
    customerLogin(phone: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/customer/login", { phone, code }, { validate: validateLoginResponse });
    },
    getCustomerDebugCode(phone: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/customer/debug-code?${new URLSearchParams({ phone }).toString()}`,
      );
    },
    requestAdminLoginCode(username: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/admin/code", { username }, { validate: validateLoginCodeResponse });
    },
    adminLogin(username: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/admin/login", { username, code }, { validate: validateLoginResponse });
    },
    getAdminDebugCode(username: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/admin/debug-code?${new URLSearchParams({ username }).toString()}`,
      );
    },
    requestWorkerLoginCode(phone: string) {
      return client.post<LoginCodeResponse | LoginError>("/api/auth/worker/code", { phone }, { validate: validateLoginCodeResponse });
    },
    workerLogin(phone: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/worker/login", { phone, code }, { validate: validateLoginResponse });
    },
    getWorkerDebugCode(phone: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/worker/debug-code?${new URLSearchParams({ phone }).toString()}`,
      );
    },
    requestOaLoginCode(username: string) {
      return client.post<LoginCodeResponse | LoginError>(
        "/api/auth/oa/code",
        { username },
        { validate: validateLoginCodeResponse },
      );
    },
    oaLogin(username: string, code: string) {
      return client.post<OaLoginResponse | LoginError>(
        "/api/auth/oa/login",
        { username, code },
        {
          validate: (value) => {
            const common = validateLoginResponse(value);
            if (!common.ok) return common;
            if (typeof value !== "object" || value === null) {
              throw new TypeError("OA login response must be an object");
            }
            const response = value as Record<string, unknown>;
            for (const key of [
              "sessionId",
              "membershipId",
              "organizationId",
              "organizationName",
              "organizationType",
              "expiresAt",
            ]) {
              if (typeof response[key] !== "string" || response[key] === "") {
                throw new TypeError(`OA login response.${key} must be a non-empty string`);
              }
            }
            if (response.organizationType !== "headquarters" && response.organizationType !== "branch") {
              throw new TypeError("OA login response.organizationType is unsupported");
            }
            return value as OaLoginResponse;
          },
        },
      );
    },
    getOaDebugCode(username: string) {
      return client.get<DebugLoginCodeResponse | LoginError>(
        `/api/auth/oa/debug-code?${new URLSearchParams({ username }).toString()}`,
      );
    },
  };
}

export const authApi = {
  forClient: createAuthApi,
};
