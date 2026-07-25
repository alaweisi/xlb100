import {
  ApiClientError,
  createApiClient,
  createAuthApi,
  createOaApi,
} from "@xlb/api-client";
import type { OaLoginResponse } from "@xlb/api-client";

const SESSION_KEY = "xlb.oa.session";

function normalizeApiBase(value: string | undefined): string {
  const base = (value ?? "").trim().replace(/\/+$/, "");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

const viteEnv = (import.meta as ImportMeta & {
  env?: { VITE_API_BASE?: string; VITE_ADMIN_ORIGIN?: string };
}).env;
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

function adminOrigin(): string {
  const configured = viteEnv?.VITE_ADMIN_ORIGIN?.trim().replace(/\/+$/u, "");
  if (configured) return configured;
  const url = new URL(window.location.href);
  if (url.hostname.startsWith("oa.")) {
    url.hostname = `admin.${url.hostname.slice(3)}`;
  }
  return url.origin;
}

export async function createOaAdminHandoffUrl(input: {
  targetPath: string;
  permissionKey: Parameters<typeof oa.createAdminHandoff>[0]["permissionKey"];
  cityCode: Parameters<typeof oa.createAdminHandoff>[0]["cityCode"];
}): Promise<string> {
  const handoff = await oa.createAdminHandoff(input);
  const target = new URL(handoff.targetPath, adminOrigin());
  const hashPath = target.hash.replace(/^#/u, "") || "/";
  const queryIndex = hashPath.indexOf("?");
  const route = queryIndex >= 0 ? hashPath.slice(0, queryIndex) : hashPath;
  const params = new URLSearchParams(queryIndex >= 0 ? hashPath.slice(queryIndex + 1) : "");
  params.set("identity", "oa");
  params.set("cityCode", handoff.cityCode);
  params.set("handoff", handoff.ticket);
  target.hash = `${route}?${params.toString()}`;
  return target.toString();
}

export type OaRealtimeState = "live" | "stale" | "disconnected";

export function isUnauthorizedOaError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function subscribeOaEvents(input: {
  onRefresh: () => void;
  onState: (state: OaRealtimeState) => void;
  onUnauthorized: () => void;
}): () => void {
  let stopped = false;
  let activeController: AbortController | undefined;
  let reconnectTimer: number | undefined;
  let reconnectAttempt = 0;
  let lastSignalAt = 0;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return;
    input.onState("disconnected");
    const delay = Math.min(1_000 * 2 ** reconnectAttempt, 15_000);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  };

  const dispatchBlock = (block: string) => {
    let event = "message";
    for (const line of block.split(/\r?\n/u)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
    }
    if (event === "ready" || event === "heartbeat") {
      lastSignalAt = Date.now();
      reconnectAttempt = 0;
      input.onState("live");
    } else if (event === "refresh") {
      lastSignalAt = Date.now();
      reconnectAttempt = 0;
      input.onState("live");
      input.onRefresh();
    } else if (event === "session-invalid") {
      input.onUnauthorized();
    }
  };

  const connect = async () => {
    if (stopped) return;
    const session = readOaSession();
    if (!session?.token) {
      input.onUnauthorized();
      return;
    }
    const controller = new AbortController();
    activeController?.abort();
    activeController = controller;
    lastSignalAt = Date.now();
    input.onState(reconnectAttempt === 0 ? "stale" : "disconnected");
    try {
      const response = await fetch(`${apiBase}/api/oa/events`, {
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${session.token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        input.onUnauthorized();
        return;
      }
      if (!response.ok || !response.body) {
        throw new Error(`OA event stream failed: ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!stopped) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        let boundary = buffer.search(/\r?\n\r?\n/u);
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          const separatorLength = buffer.slice(boundary).startsWith("\r\n\r\n") ? 4 : 2;
          buffer = buffer.slice(boundary + separatorLength);
          dispatchBlock(block);
          boundary = buffer.search(/\r?\n\r?\n/u);
        }
      }
      if (!stopped) scheduleReconnect();
    } catch {
      if (!stopped) scheduleReconnect();
    } finally {
      if (activeController === controller) activeController = undefined;
    }
  };

  const watchdog = window.setInterval(() => {
    if (stopped || lastSignalAt === 0) return;
    const silenceMs = Date.now() - lastSignalAt;
    if (silenceMs >= 45_000) {
      input.onState("disconnected");
      activeController?.abort();
    } else if (silenceMs >= 25_000) {
      input.onState("stale");
    }
  }, 5_000);

  void connect();
  return () => {
    stopped = true;
    if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
    window.clearInterval(watchdog);
    activeController?.abort();
  };
}

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
