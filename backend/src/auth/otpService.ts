import { createHash, createHmac, randomInt } from "node:crypto";
import { loadEnv } from "@xlb/config";
import { getRedisClient } from "../dal/redisClient.js";

export type LoginOtpScope = "customer" | "admin" | "oa" | "dashboard" | "worker";

type OtpRecord = {
  codeHash: string;
  debugCode?: string;
  attemptsLeft: number;
  issuedAt: string;
  expiresAt: string;
};

export type IssueLoginOtpResult =
  | { ok: true; code: string; expiresAt: string; ttlSeconds: number; attemptsLeft: number }
  | { ok: false; error: string; statusCode: 429; retryAfterSeconds?: number };

export type VerifyLoginOtpResult =
  | { ok: true }
  | { ok: false; error: string; statusCode: 401 | 429; attemptsLeft?: number };

export type DebugLoginOtpResult =
  | { ok: true; code: string; expiresAt: string; attemptsLeft: number }
  | { ok: false; error: string; statusCode: 403 | 404 | 429 };

function identityDigest(scope: LoginOtpScope, identifier: string): string {
  return createHash("sha256").update(`${scope}:${identifier}`).digest("hex");
}

function otpKey(scope: LoginOtpScope, identifier: string): string {
  return `xlb:auth:otp:${scope}:${identityDigest(scope, identifier)}`;
}

function lockKey(scope: LoginOtpScope, identifier: string): string {
  return `xlb:auth:otp-lock:${scope}:${identityDigest(scope, identifier)}`;
}

function cooldownKey(scope: LoginOtpScope, identifier: string): string {
  return `xlb:auth:otp-cooldown:${scope}:${identityDigest(scope, identifier)}`;
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function codeDigest(scope: LoginOtpScope, identifier: string, code: string, pepper: string): string {
  return createHmac("sha256", pepper)
    .update(`xlb:auth:otp:v2:${scope}:${identityDigest(scope, identifier)}:${code}`, "utf8")
    .digest("hex");
}

async function redis() {
  const client = getRedisClient();
  if (client.status === "wait") await client.connect();
  return client;
}

function parseRecord(raw: string | null): OtpRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OtpRecord;
    if (
      !/^[a-f0-9]{64}$/u.test(parsed.codeHash) ||
      !parsed.expiresAt ||
      typeof parsed.attemptsLeft !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const ISSUE_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return {-1, redis.call("TTL", KEYS[2])}
end
local cooldown_ttl = redis.call("TTL", KEYS[3])
if cooldown_ttl > 0 then
  return {0, cooldown_ttl}
end
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("SET", KEYS[3], "1", "EX", ARGV[3])
return {1, 0}
`;

const VERIFY_SCRIPT = `
if redis.call("EXISTS", KEYS[2]) == 1 then
  return {-2, 0}
end
local raw = redis.call("GET", KEYS[1])
if not raw then
  return {-1, 0}
end
local ok, record = pcall(cjson.decode, raw)
if not ok or not record.codeHash or not record.attemptsLeft then
  redis.call("DEL", KEYS[1])
  return {-1, 0}
end
if record.codeHash == ARGV[1] then
  redis.call("DEL", KEYS[1])
  redis.call("DEL", KEYS[3])
  return {1, record.attemptsLeft}
end
local attempts = tonumber(record.attemptsLeft) - 1
if attempts <= 0 then
  redis.call("DEL", KEYS[1])
  redis.call("DEL", KEYS[3])
  redis.call("SET", KEYS[2], "1", "EX", ARGV[2])
  return {-2, 0}
end
record.attemptsLeft = attempts
local ttl = redis.call("TTL", KEYS[1])
if ttl <= 0 then
  redis.call("DEL", KEYS[1])
  return {-1, 0}
end
redis.call("SET", KEYS[1], cjson.encode(record), "EX", ttl)
return {0, attempts}
`;

function resultPair(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("invalid Redis OTP response");
  }
  const status = Number(value[0]);
  const detail = Number(value[1]);
  if (!Number.isFinite(status) || !Number.isFinite(detail)) {
    throw new Error("invalid Redis OTP response");
  }
  return [status, detail];
}

export async function issueLoginOtp(
  scope: LoginOtpScope,
  identifier: string,
): Promise<IssueLoginOtpResult> {
  const env = loadEnv();
  const ttlSeconds = Math.max(60, env.authOtpTtlSeconds);
  const maxAttempts = Math.max(1, env.authOtpMaxAttempts);
  const code = generateCode();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString();
  const record: OtpRecord = {
    codeHash: codeDigest(scope, identifier, code, env.authOtpPepper),
    ...(env.nodeEnv !== "production" && env.authDebugCodeEnabled ? { debugCode: code } : {}),
    attemptsLeft: maxAttempts,
    issuedAt: issuedAt.toISOString(),
    expiresAt,
  };

  const client = await redis();
  const [status, retryAfterSeconds] = resultPair(await client.eval(
    ISSUE_SCRIPT,
    3,
    otpKey(scope, identifier),
    lockKey(scope, identifier),
    cooldownKey(scope, identifier),
    JSON.stringify(record),
    String(ttlSeconds),
    String(env.authOtpResendCooldownSeconds),
  ));
  if (status === -1) {
    return {
      ok: false,
      error: "verification code locked after too many attempts",
      statusCode: 429,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }
  if (status === 0) {
    return {
      ok: false,
      error: "verification code was requested too recently",
      statusCode: 429,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }
  return { ok: true, code, expiresAt, ttlSeconds, attemptsLeft: maxAttempts };
}

export async function verifyLoginOtp(
  scope: LoginOtpScope,
  identifier: string,
  code: string,
): Promise<VerifyLoginOtpResult> {
  const env = loadEnv();
  const client = await redis();
  const [status, attemptsLeft] = resultPair(await client.eval(
    VERIFY_SCRIPT,
    3,
    otpKey(scope, identifier),
    lockKey(scope, identifier),
    cooldownKey(scope, identifier),
    codeDigest(scope, identifier, code, env.authOtpPepper),
    String(env.authOtpLockSeconds),
  ));
  if (status === 1) return { ok: true };
  if (status === -2) {
    return {
      ok: false,
      error: "verification code locked after too many attempts",
      statusCode: 429,
      attemptsLeft: 0,
    };
  }
  if (status === -1) {
    return { ok: false, error: "verification code expired or not requested", statusCode: 401 };
  }
  return {
    ok: false,
    error: "invalid verification code",
    statusCode: 401,
    attemptsLeft: Math.max(0, attemptsLeft),
  };
}

export async function readDebugLoginOtp(
  scope: LoginOtpScope,
  identifier: string,
): Promise<DebugLoginOtpResult> {
  const env = loadEnv();
  if (env.nodeEnv === "production" || !env.authDebugCodeEnabled) {
    return { ok: false, error: "debug verification code endpoint is disabled", statusCode: 403 };
  }

  const client = await redis();
  if (await client.exists(lockKey(scope, identifier))) {
    return { ok: false, error: "verification code locked after too many attempts", statusCode: 429 };
  }

  const record = parseRecord(await client.get(otpKey(scope, identifier)));
  if (!record?.debugCode) {
    return { ok: false, error: "verification code not found", statusCode: 404 };
  }
  return {
    ok: true,
    code: record.debugCode,
    expiresAt: record.expiresAt,
    attemptsLeft: record.attemptsLeft,
  };
}
