import { createHmac, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@xlb/config";

export interface TokenPayload {
  sub: string;
  role: string;
  appType: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function sign(payload: TokenPayload, secret: string): string {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signature = base64UrlEncode(
    createHmac("sha256", secret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${signature}`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function extractBearerToken(
  headers: Record<string, string | string[] | undefined>,
): { ok: true; token: string } | { ok: false; error: string } {
  const raw =
    headers.authorization ??
    headers.Authorization ??
    Object.entries(headers).find(([name]) => name.toLowerCase() === "authorization")?.[1];
  const authHeader = Array.isArray(raw) ? raw[0] : raw;
  if (!authHeader) {
    return { ok: false, error: "authorization bearer token required" };
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) {
    return { ok: false, error: "invalid authorization header format" };
  }
  return { ok: true, token: match[1] };
}

export function verifyToken(
  token: string,
): { ok: true; payload: TokenPayload } | { ok: false; error: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, error: "invalid token format" };

    const [headerB64, bodyB64, sigB64] = parts;
    const env = loadEnv();
    const expectedSig = base64UrlEncode(
      createHmac("sha256", env.jwtSecret).update(`${headerB64}.${bodyB64}`).digest(),
    );

    if (!safeEqual(sigB64, expectedSig)) {
      return { ok: false, error: "invalid token signature" };
    }

    const payload = JSON.parse(base64UrlDecode(bodyB64)) as TokenPayload;
    if (!payload.sub || !payload.role || !payload.appType) {
      return { ok: false, error: "invalid token payload" };
    }

    if (payload.exp && Date.now() > payload.exp * 1000) {
      return { ok: false, error: "token expired" };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, error: "malformed token" };
  }
}

export function createToken(sub: string, role: string, appType: string): string {
  const env = loadEnv();
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub,
      role,
      appType,
      iat: now,
      exp: now + 86400,
    },
    env.jwtSecret,
  );
}
