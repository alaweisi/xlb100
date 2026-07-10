import type { FastifyReply, FastifyRequest } from "fastify";
import { recordRateLimitRejection } from "../observability/metrics.js";

type RateLimitRule = {
  id: string;
  matches: (path: string) => boolean;
  limit: number;
  windowMs: number;
};

export type RateLimitOptions = {
  rules?: RateLimitRule[];
  now?: () => number;
};

const defaultRules: RateLimitRule[] = [
  { id: "otp", matches: path => path === "/api/auth/otp/request", limit: 10, windowMs: 60_000 },
  { id: "openapi", matches: path => path.startsWith("/openapi/"), limit: 120, windowMs: 60_000 },
  { id: "evidence", matches: path => path.includes("/evidence"), limit: 30, windowMs: 60_000 },
];

export function createRateLimitGuard(options: RateLimitOptions = {}) {
  const rules = options.rules ?? defaultRules;
  const now = options.now ?? Date.now;
  const windows = new Map<string, { startedAt: number; count: number }>();

  return async function rateLimitGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const path = request.url.split("?", 1)[0] ?? request.url;
    const rule = rules.find(candidate => candidate.matches(path));
    if (!rule) return;

    const key = `${rule.id}:${request.ip}`;
    const timestamp = now();
    const current = windows.get(key);
    const window = !current || timestamp - current.startedAt >= rule.windowMs
      ? { startedAt: timestamp, count: 0 }
      : current;
    window.count += 1;
    windows.set(key, window);

    reply.header("X-RateLimit-Limit", rule.limit);
    reply.header("X-RateLimit-Remaining", Math.max(0, rule.limit - window.count));
    if (window.count <= rule.limit) return;

    recordRateLimitRejection();
    reply.header("Retry-After", Math.max(1, Math.ceil((window.startedAt + rule.windowMs - timestamp) / 1000)));
    return reply.status(429).send({ ok: false, error: "rate limit exceeded", rule: rule.id });
  };
}
