import type { DispatchStreamMessage, DispatchTask } from "@xlb/types";
import { dispatchStreamMessageSchema } from "@xlb/validators";
import { getRedisClient } from "../dal/redisClient.js";
import { getDispatchStreamName } from "./cityStreamNames.js";

export const DEFAULT_DISPATCH_STREAM_MAX_LENGTH = 250_000;

export interface RedisStreamCommandClient {
  status?: string;
  connect?: () => Promise<unknown>;
  call(command: string, ...args: Array<string | number>): Promise<unknown>;
}

export class DispatchStreamPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchStreamPublishError";
  }
}

export class DispatchStreamPublisher {
  constructor(
    private readonly redis: RedisStreamCommandClient = getRedisClient() as unknown as RedisStreamCommandClient,
    private readonly maxLength = DEFAULT_DISPATCH_STREAM_MAX_LENGTH,
  ) {}

  private fields(task: DispatchTask): string[] {
    const message: DispatchStreamMessage = {
      dispatchTaskId: task.dispatchTaskId,
      orderId: task.orderId,
      cityCode: task.cityCode,
      customerId: task.customerId,
      skuId: task.skuId,
      amount: task.amount,
      sourceEventId: task.sourceEventId,
    };
    dispatchStreamMessageSchema.parse(message);
    return [
      "dispatchTaskId", message.dispatchTaskId,
      "orderId", message.orderId,
      "cityCode", message.cityCode,
      "customerId", message.customerId,
      "skuId", message.skuId,
      "amount", String(message.amount),
      "sourceEventId", message.sourceEventId,
    ];
  }

  private async connect(): Promise<void> {
    if (this.redis.status === "wait" && this.redis.connect) await this.redis.connect();
  }

  async publish(task: DispatchTask): Promise<string> {
    const streamName = getDispatchStreamName(task.cityCode);
    await this.connect();
    const entryId = await this.redis.call(
      "XADD", streamName, "MAXLEN", "~", this.maxLength, "*", ...this.fields(task),
    );

    if (typeof entryId !== "string" || !entryId) {
      throw new DispatchStreamPublishError("Redis XADD returned no entry id");
    }

    return entryId;
  }

  /** Atomic and resumable rebuild publish. Reuse runId when resuming a rebuild. */
  async publishRebuilt(task: DispatchTask, runId: string): Promise<string> {
    if (!/^[A-Za-z0-9._:-]{1,96}$/.test(runId)) {
      throw new DispatchStreamPublishError("invalid rebuild run id");
    }
    const streamName = getDispatchStreamName(task.cityCode);
    const dedupeHash = `${streamName}:rebuild:${runId}`;
    const script = `
      local existing = redis.call('HGET', KEYS[2], ARGV[1])
      if existing then return existing end
      local entry = redis.call('XADD', KEYS[1], 'MAXLEN', '~', ARGV[2], '*', unpack(ARGV, 3))
      redis.call('HSET', KEYS[2], ARGV[1], entry)
      redis.call('EXPIRE', KEYS[2], 604800)
      return entry
    `;
    await this.connect();
    const entryId = await this.redis.call(
      "EVAL", script, 2, streamName, dedupeHash, task.dispatchTaskId,
      this.maxLength, ...this.fields(task),
    );
    if (typeof entryId !== "string" || !entryId) {
      throw new DispatchStreamPublishError("Redis rebuild publish returned no entry id");
    }
    return entryId;
  }
}

export const dispatchStreamPublisher = new DispatchStreamPublisher();
