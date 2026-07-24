import type { CustomerSessionSnapshot } from "../../platform/slices/index.js";

const SESSION_STORAGE_KEY = "xlb.customer.session.v1";
const LEGACY_TOKEN_STORAGE_KEY = "xlb.customer.token";
const MAX_TOKEN_LENGTH = 4_096;
const MAX_ACTOR_ID_LENGTH = 128;

export interface CustomerStorage {
  readonly length: number;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
}

export interface CustomerAuthenticatedSession {
  readonly token: string;
  readonly actor: Extract<CustomerSessionSnapshot, { readonly status: "authenticated" }>["actor"];
}

interface StoredCustomerSession {
  readonly formatVersion: 1;
  readonly token: string;
  readonly actor: CustomerAuthenticatedSession["actor"];
}

export interface CustomerSessionRestoreResult {
  readonly session: CustomerAuthenticatedSession | null;
  readonly persistence: "persistent" | "memory";
  readonly discardedInvalidSession: boolean;
}

export class MemoryCustomerStorage implements CustomerStorage {
  readonly #values = new Map<string, string>();

  get length(): number {
    return this.#values.size;
  }

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }

  key(index: number): string | null {
    return [...this.#values.keys()][index] ?? null;
  }
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padding = (4 - value.length % 4) % 4;
  const encoded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat(padding);
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * This is a client-side shape check, not signature verification. It prevents
 * cross-app tokens from entering Customer state; every protected API request
 * remains subject to the backend's signature and actor verification.
 */
export function readCustomerActorFromAccessToken(
  token: string,
  nowMs = Date.now(),
): CustomerAuthenticatedSession["actor"] | null {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) return null;
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const headerText = decodeBase64Url(segments[0] ?? "");
  const payloadText = decodeBase64Url(segments[1] ?? "");
  if (headerText === null || payloadText === null) return null;

  try {
    const header = object(JSON.parse(headerText));
    const payload = object(JSON.parse(payloadText));
    if (
      header === null ||
      payload === null ||
      header.alg !== "HS256" ||
      header.typ !== "JWT" ||
      typeof header.kid !== "string" ||
      header.kid.length === 0 ||
      payload.appType !== "customer" ||
      payload.role !== "customer" ||
      payload.tokenUse !== "access" ||
      typeof payload.sub !== "string" ||
      payload.sub.length === 0 ||
      payload.sub.length > MAX_ACTOR_ID_LENGTH ||
      typeof payload.exp !== "number" ||
      !Number.isFinite(payload.exp) ||
      payload.exp * 1_000 <= nowMs
    ) {
      return null;
    }
    return Object.freeze({
      appType: "customer",
      role: "customer",
      userId: payload.sub,
    });
  } catch {
    return null;
  }
}

export function createCustomerSessionFromLogin(
  response: {
    readonly ok: true;
    readonly token: string;
    readonly userId: string;
    readonly role: string;
  },
  nowMs = Date.now(),
): CustomerAuthenticatedSession | null {
  if (response.role !== "customer") return null;
  const actor = readCustomerActorFromAccessToken(response.token, nowMs);
  if (actor === null || actor.userId !== response.userId) return null;
  return Object.freeze({ token: response.token, actor });
}

function parseStoredSession(
  serialized: string,
  nowMs: number,
): CustomerAuthenticatedSession | null {
  try {
    const raw = object(JSON.parse(serialized));
    const actor = object(raw?.actor);
    if (
      raw?.formatVersion !== 1 ||
      typeof raw.token !== "string" ||
      actor?.appType !== "customer" ||
      actor.role !== "customer" ||
      typeof actor.userId !== "string"
    ) {
      return null;
    }
    const tokenActor = readCustomerActorFromAccessToken(raw.token, nowMs);
    if (tokenActor === null || tokenActor.userId !== actor.userId) return null;
    return Object.freeze({ token: raw.token, actor: tokenActor });
  } catch {
    return null;
  }
}

export function resolveBrowserCustomerStorage(): CustomerStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class CustomerSessionRepository {
  #storage: CustomerStorage;
  readonly #memory = new MemoryCustomerStorage();
  #persistent: boolean;

  constructor(storage: CustomerStorage | null = resolveBrowserCustomerStorage()) {
    this.#storage = storage ?? this.#memory;
    this.#persistent = storage !== null;
  }

  get persistence(): CustomerSessionRestoreResult["persistence"] {
    return this.#persistent ? "persistent" : "memory";
  }

  restore(nowMs = Date.now()): CustomerSessionRestoreResult {
    let serialized: string | null;
    try {
      serialized = this.#storage.getItem(SESSION_STORAGE_KEY);
    } catch {
      this.#fallBackToMemory();
      serialized = this.#storage.getItem(SESSION_STORAGE_KEY);
    }
    if (serialized === null) {
      let legacyToken: string | null = null;
      try {
        legacyToken = this.#storage.getItem(LEGACY_TOKEN_STORAGE_KEY);
      } catch {
        this.#fallBackToMemory();
      }
      if (legacyToken !== null) {
        const actor = readCustomerActorFromAccessToken(legacyToken, nowMs);
        if (actor !== null) {
          const session = Object.freeze({ token: legacyToken, actor });
          this.save(session);
          return Object.freeze({
            session,
            persistence: this.persistence,
            discardedInvalidSession: false,
          });
        }
        this.#remove(LEGACY_TOKEN_STORAGE_KEY);
        return Object.freeze({
          session: null,
          persistence: this.persistence,
          discardedInvalidSession: true,
        });
      }
      return Object.freeze({
        session: null,
        persistence: this.persistence,
        discardedInvalidSession: false,
      });
    }
    const session = parseStoredSession(serialized, nowMs);
    if (session === null) this.clear();
    return Object.freeze({
      session,
      persistence: this.persistence,
      discardedInvalidSession: session === null,
    });
  }

  save(session: CustomerAuthenticatedSession): CustomerSessionRestoreResult["persistence"] {
    const record: StoredCustomerSession = {
      formatVersion: 1,
      token: session.token,
      actor: session.actor,
    };
    this.#write(SESSION_STORAGE_KEY, JSON.stringify(record));
    // P10 Home reads this key until final route integration moves it to the
    // shared shell runtime.
    this.#write(LEGACY_TOKEN_STORAGE_KEY, session.token);
    return this.persistence;
  }

  clear(): void {
    this.#remove(SESSION_STORAGE_KEY);
    this.#remove(LEGACY_TOKEN_STORAGE_KEY);
  }

  #write(key: string, value: string): void {
    try {
      this.#storage.setItem(key, value);
    } catch {
      this.#fallBackToMemory();
      this.#storage.setItem(key, value);
    }
  }

  #remove(key: string): void {
    try {
      this.#storage.removeItem(key);
    } catch {
      this.#fallBackToMemory();
      this.#storage.removeItem(key);
    }
  }

  #fallBackToMemory(): void {
    this.#storage = this.#memory;
    this.#persistent = false;
  }
}
