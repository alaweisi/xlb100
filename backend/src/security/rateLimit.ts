import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { loadEnv } from "@xlb/config";
import {
  recordRateLimitBackendFailure,
  recordRateLimitRejection,
} from "../observability/metrics.js";
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from "./rateLimitStore.js";

type RateLimitRule = {
  id: string;
  matches: (path: string) => boolean;
  limit: number;
  windowMs: number;
};

export type RateLimitOptions = {
  rules?: RateLimitRule[];
  now?: () => number;
  store?: RateLimitStore;
};

const otpCodeRoutes = new Set([
  "/api/auth/customer/code",
  "/api/auth/admin/code",
  "/api/auth/worker/code",
]);

const authLoginRoutes = new Set([
  "/api/auth/customer/login",
  "/api/auth/admin/login",
  "/api/auth/worker/login",
]);

const defaultRules: RateLimitRule[] = [
  {
    id: "otp",
    matches: path => otpCodeRoutes.has(path),
    limit: 10,
    windowMs: 60_000,
  },
  {
    id: "auth_login",
    matches: path => authLoginRoutes.has(path),
    limit: 20,
    windowMs: 60_000,
  },
  { id: "openapi", matches: path => path.startsWith("/openapi/"), limit: 120, windowMs: 60_000 },
  { id: "evidence", matches: path => path.includes("/evidence"), limit: 30, windowMs: 60_000 },
];

export function createRateLimitGuard(options: RateLimitOptions = {}) {
  const rules = options.rules ?? defaultRules;
  const now = options.now ?? Date.now;
  for (const rule of rules) {
    if (!Number.isInteger(rule.limit) || rule.limit <= 0) {
      throw new Error(`rate limit rule ${rule.id} must have a positive integer limit`);
    }
    if (!Number.isInteger(rule.windowMs) || rule.windowMs <= 0) {
      throw new Error(`rate limit rule ${rule.id} must have a positive integer windowMs`);
    }
  }
  const store = options.store ?? (
    loadEnv().rateLimitBackend === "redis"
      ? new RedisRateLimitStore()
      : new InMemoryRateLimitStore(now)
  );

  return async function rateLimitGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const path = request.url.split("?", 1)[0] ?? request.url;
    const rule = rules.find(candidate => candidate.matches(path));
    if (!rule) return;

    const key = createHash("sha256")
      .update(`${rule.id}\0${request.ip}`)
      .digest("hex");
    let consumption;
    try {
      consumption = await store.consume(key, rule.windowMs);
    } catch (error) {
      recordRateLimitBackendFailure();
      request.log.error({ err: error, rule: rule.id }, "rate limit backend unavailable");
      reply.header("Retry-After", 1);
      return reply.status(503).send({ ok: false, error: "rate limit unavailable", rule: rule.id });
    }

    reply.header("X-RateLimit-Limit", rule.limit);
    reply.header("X-RateLimit-Remaining", Math.max(0, rule.limit - consumption.count));
    if (consumption.count <= rule.limit) return;

    recordRateLimitRejection();
    reply.header("Retry-After", Math.max(1, Math.ceil(consumption.resetInMs / 1000)));
    return reply.status(429).send({ ok: false, error: "rate limit exceeded", rule: rule.id });
  };
}
