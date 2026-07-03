import { getRedisClient } from "../dal/redisClient.js";

/** Phase 5A skeleton — reads stream length only; no worker consumption */
export class DispatchStreamConsumer {
  async getStreamLength(streamName: string): Promise<number> {
    const redis = getRedisClient();
    if (redis.status === "wait") {
      await redis.connect();
    }
    return redis.xlen(streamName);
  }

  async readLatestEntries(streamName: string, count = 10): Promise<unknown[]> {
    const redis = getRedisClient();
    if (redis.status === "wait") {
      await redis.connect();
    }
    const entries = await redis.xrevrange(streamName, "+", "-", "COUNT", count);
    return entries;
  }
}

export const dispatchStreamConsumer = new DispatchStreamConsumer();
