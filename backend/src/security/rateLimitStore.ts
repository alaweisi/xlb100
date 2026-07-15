import type Redis from "ioredis";
import { getRedisClient } from "../dal/redisClient.js";

export type RateLimitConsumption = {
  count: number;
  resetInMs: number;
};

export interface RateLimitStore {
  consume(key: string, windowMs: number): Promise<RateLimitConsumption>;
}

type MemoryWindow = {
  count: number;
  expiresAt: number;
};

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, MemoryWindow>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 10_000,
  ) {
    if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
      throw new Error("rate limit memory store maxEntries must be a positive integer");
    }
  }

  async consume(key: string, windowMs: number): Promise<RateLimitConsumption> {
    const timestamp = this.now();
    let window = this.windows.get(key);
    if (window && window.expiresAt <= timestamp) {
      this.windows.delete(key);
      window = undefined;
    }

    if (!window) {
      if (this.windows.size >= this.maxEntries) this.removeExpired(timestamp);
      if (this.windows.size >= this.maxEntries) {
        throw new Error("rate limit memory store capacity exceeded");
      }
      window = { count: 0, expiresAt: timestamp + windowMs };
      this.windows.set(key, window);
    }

    window.count += 1;
    return {
      count: window.count,
      resetInMs: Math.max(1, window.expiresAt - timestamp),
    };
  }

  private removeExpired(timestamp: number): void {
    for (const [key, window] of this.windows) {
      if (window.expiresAt <= timestamp) this.windows.delete(key);
    }
  }
}

type RedisRateLimitClient = Pick<Redis, "eval">;

const CONSUME_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
local ttl = redis.call("PTTL", KEYS[1])
if count == 1 or ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly client: RedisRateLimitClient = getRedisClient()) {}

  async consume(key: string, windowMs: number): Promise<RateLimitConsumption> {
    const result = await this.client.eval(CONSUME_SCRIPT, 1, `xlb:rate-limit:v1:${key}`, String(windowMs));
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error("invalid Redis rate limit response");
    }
    const count = Number(result[0]);
    const resetInMs = Number(result[1]);
    if (!Number.isFinite(count) || !Number.isFinite(resetInMs) || count < 1 || resetInMs < 0) {
      throw new Error("invalid Redis rate limit counters");
    }
    return { count, resetInMs: Math.max(1, Math.ceil(resetInMs)) };
  }
}
