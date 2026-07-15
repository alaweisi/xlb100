import { describe, expect, it, vi } from "vitest";
import type { DispatchTask } from "@xlb/types";
import {
  DispatchStreamConsumer,
  type DispatchStreamHandler,
} from "../../backend/src/streams/dispatchStreamConsumer.js";
import { DispatchStreamPublisher } from "../../backend/src/streams/dispatchStreamPublisher.js";
import { MysqlDispatchStreamFailureRecorder } from "../../backend/src/streams/dispatchStreamFailureRecorder.js";

const fields = [
  "dispatchTaskId", "dt_1",
  "orderId", "ord_1",
  "cityCode", "hangzhou",
  "customerId", "cust_1",
  "skuId", "sku_1",
  "amount", "120",
  "sourceEventId", "evt_1",
];

class FakeRedis {
  readonly calls: Array<Array<string | number>> = [];
  readonly responses = new Map<string, unknown[]>();

  queue(command: string, ...values: unknown[]): this {
    this.responses.set(command, values);
    return this;
  }

  async call(command: string, ...args: Array<string | number>): Promise<unknown> {
    this.calls.push([command, ...args]);
    const queue = this.responses.get(command);
    return queue?.shift() ?? "OK";
  }
}

function streamRead(id = "1-0") {
  return [["xlb:dispatch:hangzhou:orders", [[id, fields]]]];
}

describe("stage2c3 dispatch stream consumer", () => {
  it("ACKs only after the durable handler succeeds", async () => {
    const redis = new FakeRedis().queue("XREADGROUP", streamRead());
    const failureRecorder = { recordFinalFailure: vi.fn() };
    const handler: DispatchStreamHandler = vi.fn().mockResolvedValue(undefined);
    const consumer = new DispatchStreamConsumer(redis, failureRecorder, { maxAttempts: 3, delayMs: 1_000 });

    const result = await consumer.consumeNew({
      cityCode: "hangzhou", consumerName: "worker-a", handler, blockMs: 0,
    });

    expect(result).toEqual({
      received: 1, acknowledged: 1, retryPending: 0,
      deadLettered: 0, persistenceBlocked: 0,
    });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ dispatchTaskId: "dt_1", amount: 120 }),
      expect.objectContaining({ entryId: "1-0", reclaimed: false }),
    );
    expect(redis.calls.some((call) => call[0] === "XACK")).toBe(true);
    expect(failureRecorder.recordFinalFailure).not.toHaveBeenCalled();
  });

  it("leaves a failed delivery in PEL until retry budget is exhausted", async () => {
    const redis = new FakeRedis()
      .queue("XREADGROUP", streamRead())
      .queue("HINCRBY", 1);
    const failureRecorder = { recordFinalFailure: vi.fn() };
    const consumer = new DispatchStreamConsumer(redis, failureRecorder, { maxAttempts: 3, delayMs: 1_000 });

    const result = await consumer.consumeNew({
      cityCode: "hangzhou",
      consumerName: "worker-a",
      handler: vi.fn().mockRejectedValue(new Error("temporary")),
      blockMs: 0,
    });

    expect(result.retryPending).toBe(1);
    expect(redis.calls.some((call) => call[0] === "XACK")).toBe(false);
    expect(redis.calls.some((call) => call[0] === "XADD")).toBe(false);
  });

  it("persists final failure before diagnostic DLQ and ACK", async () => {
    const redis = new FakeRedis()
      .queue("XREADGROUP", streamRead())
      .queue("HINCRBY", 3)
      .queue("XADD", "2-0");
    const failureRecorder = { recordFinalFailure: vi.fn().mockResolvedValue(true) };
    const consumer = new DispatchStreamConsumer(redis, failureRecorder, { maxAttempts: 3, delayMs: 1_000 });

    const result = await consumer.consumeNew({
      cityCode: "hangzhou",
      consumerName: "worker-a",
      handler: vi.fn().mockRejectedValue(new Error("permanent")),
      blockMs: 0,
    });

    expect(result.deadLettered).toBe(1);
    expect(failureRecorder.recordFinalFailure).toHaveBeenCalledOnce();
    const dlqIndex = redis.calls.findIndex((call) => call[0] === "XADD");
    const ackIndex = redis.calls.findIndex((call) => call[0] === "XACK");
    expect(dlqIndex).toBeGreaterThan(-1);
    expect(ackIndex).toBeGreaterThan(dlqIndex);
  });

  it("refuses DLQ and ACK when MySQL final-failure persistence is blocked", async () => {
    const redis = new FakeRedis()
      .queue("XREADGROUP", streamRead())
      .queue("HINCRBY", 3);
    const consumer = new DispatchStreamConsumer(
      redis,
      { recordFinalFailure: vi.fn().mockResolvedValue(false) },
      { maxAttempts: 3, delayMs: 1_000 },
    );

    const result = await consumer.consumeNew({
      cityCode: "hangzhou",
      consumerName: "worker-a",
      handler: vi.fn().mockRejectedValue(new Error("permanent")),
      blockMs: 0,
    });

    expect(result.persistenceBlocked).toBe(1);
    expect(redis.calls.some((call) => call[0] === "XADD")).toBe(false);
    expect(redis.calls.some((call) => call[0] === "XACK")).toBe(false);
  });

  it("reclaims stale PEL entries with XAUTOCLAIM", async () => {
    const redis = new FakeRedis().queue("XAUTOCLAIM", ["0-0", [["4-0", fields]], []]);
    const handler = vi.fn().mockResolvedValue(undefined);
    const consumer = new DispatchStreamConsumer(
      redis,
      { recordFinalFailure: vi.fn() },
      { maxAttempts: 3, delayMs: 1_000 },
    );

    const result = await consumer.reclaimStale({
      cityCode: "hangzhou", consumerName: "worker-b", handler, minIdleMs: 1_000,
    });

    expect(result.acknowledged).toBe(1);
    expect(handler).toHaveBeenCalledWith(
      expect.any(Object), expect.objectContaining({ entryId: "4-0", reclaimed: true }),
    );
    expect(redis.calls.some((call) => call[0] === "XAUTOCLAIM")).toBe(true);
  });

  it("advances the XAUTOCLAIM cursor so large PELs cannot starve", async () => {
    const redis = new FakeRedis().queue(
      "XAUTOCLAIM",
      ["8-0", [], []],
      ["0-0", [], []],
    );
    const consumer = new DispatchStreamConsumer(
      redis,
      { recordFinalFailure: vi.fn() },
      { maxAttempts: 3, delayMs: 1_000 },
    );
    const input = {
      cityCode: "hangzhou", consumerName: "worker-b",
      handler: vi.fn().mockResolvedValue(undefined), minIdleMs: 1_000,
    };

    await consumer.reclaimStale(input);
    await consumer.reclaimStale(input);

    const claims = redis.calls.filter((call) => call[0] === "XAUTOCLAIM");
    expect(claims[0]).toContain("0-0");
    expect(claims[1]).toContain("8-0");
  });
});

describe("stage2c3 dispatch stream publisher", () => {
  const task: DispatchTask = {
    dispatchTaskId: "dt_1", orderId: "ord_1", cityCode: "hangzhou",
    customerId: "cust_1", skuId: "sku_1", amount: 120,
    sourceEventId: "evt_1", streamName: "xlb:dispatch:hangzhou:orders",
    streamEntryId: null, status: "queued",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("bounds normal stream publishing", async () => {
    const redis = new FakeRedis().queue("XADD", "1-0");
    const publisher = new DispatchStreamPublisher(redis, 50_000);
    await expect(publisher.publish(task)).resolves.toBe("1-0");
    expect(redis.calls[0]).toEqual(expect.arrayContaining(["XADD", "MAXLEN", "~", 50_000]));
  });

  it("uses an atomic run-scoped dedupe script for rebuild publishing", async () => {
    const redis = new FakeRedis().queue("EVAL", "9-0");
    const publisher = new DispatchStreamPublisher(redis, 50_000);
    await expect(publisher.publishRebuilt(task, "restore-20260715")).resolves.toBe("9-0");
    expect(redis.calls[0][0]).toBe("EVAL");
    expect(redis.calls[0]).toEqual(expect.arrayContaining([
      "xlb:dispatch:hangzhou:orders:rebuild:restore-20260715", "dt_1",
    ]));
  });
});

describe("stage2c3 MySQL terminal failure recorder", () => {
  it("persists a bounded failure reason against the city-scoped active task", async () => {
    const query = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
    const recorder = new MysqlDispatchStreamFailureRecorder(() => ({ query }) as never);

    await expect(recorder.recordFinalFailure({
      entryId: "1-0",
      groupName: "group-a",
      attempts: 3,
      message: {
        dispatchTaskId: "dt_1", orderId: "ord_1", cityCode: "hangzhou",
        customerId: "cust_1", skuId: "sku_1", amount: 120, sourceEventId: "evt_1",
      },
      error: new Error("terminal\nprovider failure"),
    })).resolves.toBe(true);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('pending','queued','offering'"),
      ["redis_consumer_exhausted:terminal provider failure", "hangzhou", "dt_1"],
    );
  });
});
