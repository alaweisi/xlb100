import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DispatchTask } from "@xlb/types";
import { createRedisClient } from "../../backend/src/dal/redisClient.js";
import { DispatchStreamConsumer } from "../../backend/src/streams/dispatchStreamConsumer.js";
import { DispatchStreamPublisher } from "../../backend/src/streams/dispatchStreamPublisher.js";
import { getDispatchDlqStreamName } from "../../backend/src/streams/dlq.js";
import { getDispatchStreamName } from "../../backend/src/streams/cityStreamNames.js";

const redisPort = Number(process.env.XLB_STAGE2C3_REDIS_PORT ?? 0);
const runRedis = Number.isInteger(redisPort) && redisPort > 0;

function task(id: string): DispatchTask {
  return {
    dispatchTaskId: id,
    orderId: `ord_${id}`,
    cityCode: "hangzhou",
    customerId: "cust_1",
    skuId: "sku_1",
    amount: 120,
    sourceEventId: `evt_${id}`,
    streamName: getDispatchStreamName("hangzhou"),
    streamEntryId: null,
    status: "queued",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe.skipIf(!runRedis)("stage2c3 isolated Redis Stream reliability", () => {
  let redis: ReturnType<typeof createRedisClient>;
  const groupName = "stage2c3-integration-v1";

  beforeAll(async () => {
    redis = createRedisClient();
    await redis.connect();
    await redis.flushdb();
  });

  afterAll(async () => {
    if (redis) {
      await redis.flushdb();
      await redis.quit();
    }
  });

  it("executes ACK, PEL reclaim, durable-failure-before-DLQ and idempotent rebuild", async () => {
    const publisher = new DispatchStreamPublisher(redis, 1_000);
    const recorder = { recordFinalFailure: vi.fn().mockResolvedValue(true) };
    const consumer = new DispatchStreamConsumer(redis, recorder, { maxAttempts: 2, delayMs: 1_000 });
    const streamName = getDispatchStreamName("hangzhou");

    await publisher.publish(task("dt_success"));
    const success = await consumer.consumeNew({
      cityCode: "hangzhou", groupName, consumerName: "consumer-a",
      handler: vi.fn().mockResolvedValue(undefined), blockMs: 0,
    });
    expect(success.acknowledged).toBe(1);
    expect(await redis.xpending(streamName, groupName)).toEqual([0, null, null, null]);

    await publisher.publish(task("dt_retry"));
    const failed = await consumer.consumeNew({
      cityCode: "hangzhou", groupName, consumerName: "consumer-a",
      handler: vi.fn().mockRejectedValue(new Error("temporary")), blockMs: 0,
    });
    expect(failed.retryPending).toBe(1);
    expect((await redis.xpending(streamName, groupName))[0]).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 1_050));
    const reclaimed = await consumer.reclaimStale({
      cityCode: "hangzhou", groupName, consumerName: "consumer-b",
      handler: vi.fn().mockResolvedValue(undefined), minIdleMs: 1_000,
    });
    expect(reclaimed.acknowledged).toBe(1);
    expect((await redis.xpending(streamName, groupName))[0]).toBe(0);

    const terminalConsumer = new DispatchStreamConsumer(redis, recorder, { maxAttempts: 1, delayMs: 1_000 });
    await publisher.publish(task("dt_terminal"));
    const terminal = await terminalConsumer.consumeNew({
      cityCode: "hangzhou", groupName, consumerName: "consumer-a",
      handler: vi.fn().mockRejectedValue(new Error("permanent")), blockMs: 0,
    });
    expect(terminal.deadLettered).toBe(1);
    expect(recorder.recordFinalFailure).toHaveBeenCalled();
    expect(await redis.xlen(getDispatchDlqStreamName("hangzhou"))).toBe(1);

    const before = await redis.xlen(streamName);
    const first = await publisher.publishRebuilt(task("dt_rebuild"), "restore-run-1");
    const second = await publisher.publishRebuilt(task("dt_rebuild"), "restore-run-1");
    expect(second).toBe(first);
    expect(await redis.xlen(streamName)).toBe(before + 1);
  });
});
