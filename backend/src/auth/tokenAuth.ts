import { randomUUID } from "node:crypto";
import jwt, {
  type JwtPayload,
} from "jsonwebtoken";
import { loadEnv } from "@xlb/config";
import type { AppType, Role } from "@xlb/types";
import type { OaBackofficeContext } from "@xlb/types";

const APP_ROLES: Record<AppType, readonly Role[]> = {
  customer: ["customer"],
  worker: ["worker"],
  admin: ["admin", "operator", "auditor"],
  oa: ["admin", "operator", "auditor"],
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
  sid?: string;
  mid?: string;
  oid?: string;
  av?: number;
  demo?: "investor";
  city?: string;
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

function hasValidDemoBinding(payload: JwtPayload): boolean {
  const hasDemo = payload.demo !== undefined || payload.city !== undefined;
  if (!hasDemo) return true;
  return payload.demo === "investor"
    && typeof payload.city === "string"
    && /^[a-z0-9_-]{2,64}$/u.test(payload.city)
    && payload.city !== "__global__";
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
  const appType = payload.appType;
  const hasValidBackofficeBinding = appType !== "oa" || (
    typeof payload.sid === "string" && payload.sid.length > 0 && payload.sid.length <= 64 &&
    typeof payload.mid === "string" && payload.mid.length > 0 && payload.mid.length <= 64 &&
    typeof payload.oid === "string" && payload.oid.length > 0 && payload.oid.length <= 64 &&
    typeof payload.av === "number" && Number.isInteger(payload.av) && payload.av >= 0
  );
  if (
    typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128 ||
    !isRole(payload.role) || !isAppType(payload.appType) ||
    !hasValidRoleBinding(payload.appType, payload.role) ||
    payload.tokenUse !== "access" ||
    typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
    typeof payload.jti !== "string" || !/^[0-9a-f-]{36}$/iu.test(payload.jti) ||
    payload.iss !== issuer || payload.aud !== audience ||
    payload.exp <= payload.iat ||
    !hasValidBackofficeBinding ||
    !hasValidDemoBinding(payload)
  ) {
    return null;
  }
  return payload as TokenPayload;
}

function isEnabledStagingDemoPayload(payload: TokenPayload): boolean {
  if (payload.demo !== "investor") return true;
  const env = loadEnv();
  if (env.nodeEnv !== "staging" || payload.city !== env.stagingDemoCityCode) {
    return false;
  }
  if (payload.appType === "customer") {
    return env.stagingDemoCustomerAuthEnabled
      && payload.sub === "customer-demo-001"
      && payload.role === "customer";
  }
  if (payload.appType === "worker") {
    return env.stagingInvestorDemoAuthEnabled
      && payload.sub === env.stagingDemoWorkerId
      && payload.role === "worker";
  }
  if (payload.appType === "admin") {
    return env.stagingInvestorDemoAuthEnabled
      && payload.sub === env.stagingDemoAdminUserId
      && payload.role === "operator";
  }
  return false;
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
    if (!payload) return { ok: false, error: "invalid token payload" };
    if (!isEnabledStagingDemoPayload(payload)) {
      return { ok: false, error: "staging demo token is disabled" };
    }
    return { ok: true, payload };
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
  if (
    !sub || sub.length > 128 ||
    !isRole(role) ||
    !isAppType(appType) ||
    appType === "oa" ||
    !hasValidRoleBinding(appType, role)
  ) {
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

export function createStagingDemoToken(
  sub: string,
  role: string,
  appType: "customer" | "worker" | "admin",
  cityCode: string,
): string {
  const env = loadEnv();
  const allowed = env.nodeEnv === "staging"
    && cityCode === env.stagingDemoCityCode
    && (
      (
        appType === "customer"
        && role === "customer"
        && sub === "customer-demo-001"
        && env.stagingDemoCustomerAuthEnabled
      )
      || (
        appType === "worker"
        && role === "worker"
        && sub === env.stagingDemoWorkerId
        && env.stagingInvestorDemoAuthEnabled
      )
      || (
        appType === "admin"
        && role === "operator"
        && sub === env.stagingDemoAdminUserId
        && env.stagingInvestorDemoAuthEnabled
      )
    );
  if (!allowed) {
    throw new Error("cannot create staging demo token outside the configured staging identity");
  }
  if (!isRole(role) || !hasValidRoleBinding(appType, role)) {
    throw new Error("cannot create staging demo token for invalid role binding");
  }
  const signingKey = env.jwtKeys[env.jwtActiveKeyId];
  if (!signingKey) throw new Error("active JWT signing key is unavailable");

  return jwt.sign(
    {
      role,
      appType,
      tokenUse: "access",
      demo: "investor",
      city: cityCode,
    },
    signingKey,
    {
      algorithm: "HS256",
      header: { alg: "HS256", typ: "JWT", kid: env.jwtActiveKeyId },
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      subject: sub,
      jwtid: randomUUID(),
      expiresIn: env.stagingDemoTokenTtlSeconds,
    },
  );
}

export function createOaToken(
  sub: string,
  role: string,
  backoffice: Omit<OaBackofficeContext, "tokenJti">,
): { token: string; jti: string } {
  const env = loadEnv();
  if (
    !sub || sub.length > 128 ||
    !isRole(role) ||
    !hasValidRoleBinding("oa", role) ||
    !backoffice.sessionId || !backoffice.membershipId || !backoffice.organizationId ||
    !Number.isInteger(backoffice.authzVersion) || backoffice.authzVersion < 0
  ) {
    throw new Error("cannot create OA token for invalid identity or backoffice binding");
  }
  const signingKey = env.jwtKeys[env.jwtActiveKeyId];
  if (!signingKey) throw new Error("active JWT signing key is unavailable");
  const jti = randomUUID();
  const token = jwt.sign(
    {
      role,
      appType: "oa",
      tokenUse: "access",
      sid: backoffice.sessionId,
      mid: backoffice.membershipId,
      oid: backoffice.organizationId,
      av: backoffice.authzVersion,
    },
    signingKey,
    {
      algorithm: "HS256",
      header: { alg: "HS256", typ: "JWT", kid: env.jwtActiveKeyId },
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      subject: sub,
      jwtid: jti,
      expiresIn: env.jwtTtlSeconds,
    },
  );
  return { token, jti };
}
