import { createApiClient, createAuthApi, createOaApi } from "@xlb/api-client";
import type { OaLoginResponse } from "@xlb/api-client";

const SESSION_KEY = "xlb.oa.session";

function normalizeApiBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

const viteEnv = (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env;
const apiBase = normalizeApiBase(viteEnv?.VITE_API_BASE);

export interface OaSession extends OaLoginResponse {
  username: string;
}

export function readOaSession(): OaSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OaSession>;
    if (!parsed.token || !parsed.userId || !parsed.membershipId || !parsed.organizationId) {
      return null;
    }
    return parsed as OaSession;
  } catch {
    return null;
  }
}

function storeOaSession(session: OaSession): void {
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearOaSession(): void {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
}

function client() {
  return createApiClient({
    baseUrl: apiBase,
    headers: (): Record<string, string> => {
      const session = readOaSession();
      return session?.token ? { Authorization: `Bearer ${session.token}` } : {};
    },
  });
}

export const oa = createOaApi(client());

export async function requestLoginCode(username: string) {
  const auth = createAuthApi(createApiClient({ baseUrl: apiBase }));
  const result = await auth.requestOaLoginCode(username);
  if (!result.ok) throw new Error(result.error);
  return result;
}

export async function readDebugLoginCode(username: string): Promise<string | null> {
  try {
    const auth = createAuthApi(createApiClient({ baseUrl: apiBase }));
    const result = await auth.getOaDebugCode(username);
    return result.ok ? result.code : null;
  } catch {
    return null;
  }
}

export async function login(username: string, code: string): Promise<OaSession> {
  const auth = createAuthApi(createApiClient({ baseUrl: apiBase }));
  const result = await auth.oaLogin(username, code);
  if (!result.ok) throw new Error(result.error);
  const session = { ...result, username };
  storeOaSession(session);
  return session;
}
