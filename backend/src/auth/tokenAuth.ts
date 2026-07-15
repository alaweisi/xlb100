import { randomUUID } from "node:crypto";
import jwt, {
  type JwtPayload,
} from "jsonwebtoken";
import { loadEnv } from "@xlb/config";
import type { AppType, Role } from "@xlb/types";

const APP_ROLES: Record<AppType, readonly Role[]> = {
  customer: ["customer"],
  worker: ["worker"],
  admin: ["admin", "operator", "auditor"],
  oa: ["admin", "operator"],
  dashboard: ["admin", "operator", "auditor"],
};

const APP_TYPES = new Set<AppType>(["customer", "worker", "admin", "oa", "dashboard"]);
const ROLES = new Set<Role>(["customer", "worker", "admin", "operator", "auditor"]);
const MAX_TOKEN_LENGTH = 4_096;

export interface TokenPayload extends JwtPayload {
  sub: string;
  role: Role;
  appType: AppType;
  iat: number;
  exp: number;
  jti: string;
  iss: string;
  aud: string;
  tokenUse: "access";
}

function isAppType(value: unknown): value is AppType {
  return typeof value === "string" && APP_TYPES.has(value as AppType);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLES.has(value as Role);
}

function hasValidRoleBinding(appType: AppType, role: Role): boolean {
  return APP_ROLES[appType].includes(role);
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

  const match = /^Bearer ([A-Za-z0-9._~-]+)$/u.exec(authHeader);
  if (!match || match[1].length > MAX_TOKEN_LENGTH) {
    return { ok: false, error: "invalid authorization header format" };
  }
  return { ok: true, token: match[1] };
}

function validatePayload(payload: JwtPayload, issuer: string, audience: string): TokenPayload | null {
  if (
    typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128 ||
    !isRole(payload.role) || !isAppType(payload.appType) ||
    !hasValidRoleBinding(payload.appType, payload.role) ||
    payload.tokenUse !== "access" ||
    typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
    typeof payload.jti !== "string" || !/^[0-9a-f-]{36}$/iu.test(payload.jti) ||
    payload.iss !== issuer || payload.aud !== audience ||
    payload.exp <= payload.iat
  ) {
    return null;
  }
  return payload as TokenPayload;
}

export function verifyToken(
  token: string,
): { ok: true; payload: TokenPayload } | { ok: false; error: string } {
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, error: "invalid token format" };
  }

  try {
    const env = loadEnv();
    const decoded = jwt.decode(token, { complete: true });
    if (
      !decoded || typeof decoded === "string" ||
      decoded.header.alg !== "HS256" || decoded.header.typ !== "JWT" ||
      typeof decoded.header.kid !== "string"
    ) {
      return { ok: false, error: "invalid token header" };
    }

    const verificationKey = env.jwtKeys[decoded.header.kid];
    if (!verificationKey) {
      return { ok: false, error: "unknown token signing key" };
    }

    const verified = jwt.verify(token, verificationKey, {
      algorithms: ["HS256"],
      audience: env.jwtAudience,
      issuer: env.jwtIssuer,
      clockTolerance: 5,
      maxAge: env.jwtTtlSeconds,
    });
    if (typeof verified === "string") {
      return { ok: false, error: "invalid token payload" };
    }
    const payload = validatePayload(verified, env.jwtIssuer, env.jwtAudience);
    return payload
      ? { ok: true, payload }
      : { ok: false, error: "invalid token payload" };
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "";
    if (errorName === "TokenExpiredError") return { ok: false, error: "token expired" };
    if (errorName === "NotBeforeError") return { ok: false, error: "token not active" };
    if (errorName === "JsonWebTokenError") return { ok: false, error: "invalid token" };
    return { ok: false, error: "malformed token" };
  }
}

export function createToken(sub: string, role: string, appType: string): string {
  const env = loadEnv();
  if (!sub || sub.length > 128 || !isRole(role) || !isAppType(appType) || !hasValidRoleBinding(appType, role)) {
    throw new Error("cannot create token for invalid subject, role, or app binding");
  }
  const signingKey = env.jwtKeys[env.jwtActiveKeyId];
  if (!signingKey) throw new Error("active JWT signing key is unavailable");

  return jwt.sign(
    { role, appType, tokenUse: "access" },
    signingKey,
    {
      algorithm: "HS256",
      header: { alg: "HS256", typ: "JWT", kid: env.jwtActiveKeyId },
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      subject: sub,
      jwtid: randomUUID(),
      expiresIn: env.jwtTtlSeconds,
    },
  );
}
