import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { loadEnv } from "@xlb/config";
import { getRedisClient } from "../dal/redisClient.js";

export type LoginOtpScope = "customer" | "admin" | "worker";

type OtpRecord = {
  code: string;
  attemptsLeft: number;
  issuedAt: string;
  expiresAt: string;
};

export type IssueLoginOtpResult =
  | { ok: true; code: string; expiresAt: string; ttlSeconds: number; attemptsLeft: number }
  | { ok: false; error: string; statusCode: 429 };

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

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function safeCodeEqual(input: string, expected: string): boolean {
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function redis() {
  const client = getRedisClient();
  if (client.status === "wait") {
    await client.connect();
  }
  return client;
}

function parseRecord(raw: string | null): OtpRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OtpRecord;
    if (!parsed.code || !parsed.expiresAt || typeof parsed.attemptsLeft !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function issueLoginOtp(
  scope: LoginOtpScope,
  identifier: string,
): Promise<IssueLoginOtpResult> {
  const env = loadEnv();
  const ttlSeconds = Math.max(60, env.authOtpTtlSeconds);
  const maxAttempts = Math.max(1, env.authOtpMaxAttempts);
  const client = await redis();

  const locked = await client.exists(lockKey(scope, identifier));
  if (locked) {
    return { ok: false, error: "verification code locked after too many attempts", statusCode: 429 };
  }

  const code = generateCode();
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString();
  const record: OtpRecord = {
    code,
    attemptsLeft: maxAttempts,
    issuedAt: issuedAt.toISOString(),
    expiresAt,
  };

  await client.set(otpKey(scope, identifier), JSON.stringify(record), "EX", ttlSeconds);
  return { ok: true, code, expiresAt, ttlSeconds, attemptsLeft: maxAttempts };
}

export async function verifyLoginOtp(
  scope: LoginOtpScope,
  identifier: string,
  code: string,
): Promise<VerifyLoginOtpResult> {
  const env = loadEnv();
  const client = await redis();
  const key = otpKey(scope, identifier);

  if (await client.exists(lockKey(scope, identifier))) {
    return { ok: false, error: "verification code locked after too many attempts", statusCode: 429 };
  }

  const record = parseRecord(await client.get(key));
  if (!record) {
    return { ok: false, error: "verification code expired or not requested", statusCode: 401 };
  }

  if (safeCodeEqual(code, record.code)) {
    await client.del(key);
    return { ok: true };
  }

  const attemptsLeft = record.attemptsLeft - 1;
  if (attemptsLeft <= 0) {
    await client.del(key);
    await client.set(lockKey(scope, identifier), "1", "EX", Math.max(60, env.authOtpTtlSeconds));
    return {
      ok: false,
      error: "verification code locked after too many attempts",
      statusCode: 429,
      attemptsLeft: 0,
    };
  }

  const ttl = await client.ttl(key);
  await client.set(
    key,
    JSON.stringify({ ...record, attemptsLeft } satisfies OtpRecord),
    "EX",
    ttl > 0 ? ttl : Math.max(60, env.authOtpTtlSeconds),
  );
  return { ok: false, error: "invalid verification code", statusCode: 401, attemptsLeft };
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
  if (!record) {
    return { ok: false, error: "verification code not found", statusCode: 404 };
  }

  return {
    ok: true,
    code: record.code,
    expiresAt: record.expiresAt,
    attemptsLeft: record.attemptsLeft,
  };
}
