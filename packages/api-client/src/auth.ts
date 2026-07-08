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
}

// ── API ──

export function createAuthApi(client: ApiClient) {
  return {
    customerLogin(phone: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/customer/login", {
        phone,
        code,
      });
    },
    adminLogin(username: string, code: string) {
      return client.post<LoginResponse | LoginError>("/api/auth/admin/login", {
        username,
        code,
      });
    },
  };
}

export const authApi = {
  forClient: createAuthApi,
};
