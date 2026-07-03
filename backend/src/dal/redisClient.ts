import Redis from "ioredis";
import { loadEnv } from "@xlb/config";

let client: Redis | null = null;

export function createRedisClient(): Redis {
  const env = loadEnv();
  return new Redis({
    host: env.redisHost,
    port: env.redisPort,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
}

export function getRedisClient(): Redis {
  if (!client) {
    client = createRedisClient();
  }
  return client;
}

export async function pingRedis(): Promise<boolean> {
  const redis = getRedisClient();
  if (redis.status === "wait") {
    await redis.connect();
  }
  const pong = await redis.ping();
  return pong === "PONG";
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

export function resetRedisClientForTests(): void {
  client = null;
}
