import type { DispatchStreamMessage } from "@xlb/types";
import { dispatchStreamMessageSchema } from "@xlb/validators";
import { getRedisClient } from "../dal/redisClient.js";
import {
  DEFAULT_DISPATCH_CONSUMER_GROUP,
  getDispatchRetryHashName,
  getDispatchStreamName,
} from "./cityStreamNames.js";
import {
  DEFAULT_DISPATCH_DLQ_MAX_LENGTH,
  getDispatchDlqStreamName,
} from "./dlq.js";
import {
  dispatchStreamFailureRecorder,
  type DispatchStreamFailureRecorder,
} from "./dispatchStreamFailureRecorder.js";
import type { RedisStreamCommandClient } from "./dispatchStreamPublisher.js";
import {
  DEFAULT_STREAM_RETRY_STATE_TTL_SECONDS,
  defaultRetryPolicy,
  type RetryPolicy,
} from "./retryPolicy.js";

type RawEntry = { id: string; fields: Record<string, string> };

export type DispatchStreamDeliveryContext = {
  entryId: string;
  streamName: string;
  groupName: string;
  consumerName: string;
  reclaimed: boolean;
};

export type DispatchStreamHandler = (
  message: DispatchStreamMessage,
  context: DispatchStreamDeliveryContext,
) => Promise<void>;

export type DispatchStreamConsumeResult = {
  received: number;
  acknowledged: number;
  retryPending: number;
  deadLettered: number;
  persistenceBlocked: number;
};

function emptyResult(): DispatchStreamConsumeResult {
  return { received: 0, acknowledged: 0, retryPending: 0, deadLettered: 0, persistenceBlocked: 0 };
}

function asString(value: unknown): string {
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function parseEntry(value: unknown): RawEntry | null {
  if (!Array.isArray(value) || value.length < 2 || !Array.isArray(value[1])) return null;
  const fields: Record<string, string> = {};
  for (let index = 0; index < value[1].length; index += 2) {
    fields[asString(value[1][index])] = asString(value[1][index + 1]);
  }
  return { id: asString(value[0]), fields };
}

function parseReadResponse(value: unknown): RawEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: RawEntry[] = [];
  for (const stream of value) {
    if (!Array.isArray(stream) || !Array.isArray(stream[1])) continue;
    for (const raw of stream[1]) {
      const entry = parseEntry(raw);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

function parseClaimResponse(value: unknown): { nextCursor: string; entries: RawEntry[] } {
  if (!Array.isArray(value) || !Array.isArray(value[1])) {
    return { nextCursor: "0-0", entries: [] };
  }
  return {
    nextCursor: asString(value[0] ?? "0-0"),
    entries: value[1].map(parseEntry).filter((entry): entry is RawEntry => entry !== null),
  };
}

function decodeMessage(fields: Record<string, string>): DispatchStreamMessage {
  return dispatchStreamMessageSchema.parse({ ...fields, amount: Number(fields.amount) });
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "dispatch stream consumer failed")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 480);
}

export class DispatchStreamConsumer {
  private readonly claimCursors = new Map<string, string>();

  constructor(
    private readonly redis: RedisStreamCommandClient = getRedisClient() as unknown as RedisStreamCommandClient,
    private readonly failureRecorder: DispatchStreamFailureRecorder = dispatchStreamFailureRecorder,
    private readonly retryPolicy: RetryPolicy = defaultRetryPolicy,
  ) {}

  private async connect(): Promise<void> {
    if (this.redis.status === "wait" && this.redis.connect) await this.redis.connect();
  }

  async ensureGroup(cityCode: string, groupName = DEFAULT_DISPATCH_CONSUMER_GROUP): Promise<void> {
    await this.connect();
    try {
      await this.redis.call("XGROUP", "CREATE", getDispatchStreamName(cityCode), groupName, "0", "MKSTREAM");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) throw error;
    }
  }

  private async processEntries(input: {
    cityCode: string;
    groupName: string;
    consumerName: string;
    entries: RawEntry[];
    handler: DispatchStreamHandler;
    reclaimed: boolean;
  }): Promise<DispatchStreamConsumeResult> {
    const result = emptyResult();
    const streamName = getDispatchStreamName(input.cityCode);
    const retryHash = getDispatchRetryHashName(streamName, input.groupName);
    result.received = input.entries.length;

    for (const entry of input.entries) {
      let message: DispatchStreamMessage;
      try {
        message = decodeMessage(entry.fields);
        if (message.cityCode !== input.cityCode) throw new Error("stream message city scope mismatch");
        await input.handler(message, {
          entryId: entry.id,
          streamName,
          groupName: input.groupName,
          consumerName: input.consumerName,
          reclaimed: input.reclaimed,
        });
        await this.redis.call("XACK", streamName, input.groupName, entry.id);
        await this.redis.call("HDEL", retryHash, entry.id);
        result.acknowledged += 1;
      } catch (error) {
        const attempts = Number(await this.redis.call("HINCRBY", retryHash, entry.id, 1));
        await this.redis.call("EXPIRE", retryHash, DEFAULT_STREAM_RETRY_STATE_TTL_SECONDS);
        if (!Number.isFinite(attempts) || attempts < this.retryPolicy.maxAttempts) {
          result.retryPending += 1;
          continue;
        }

        try {
          message = decodeMessage(entry.fields);
        } catch {
          result.persistenceBlocked += 1;
          continue;
        }
        const persisted = await this.failureRecorder.recordFinalFailure({
          entryId: entry.id,
          groupName: input.groupName,
          attempts,
          message,
          error,
        });
        if (!persisted) {
          result.persistenceBlocked += 1;
          continue;
        }
        await this.redis.call(
          "XADD", getDispatchDlqStreamName(input.cityCode), "MAXLEN", "~",
          DEFAULT_DISPATCH_DLQ_MAX_LENGTH, "*",
          "sourceStream", streamName,
          "sourceEntryId", entry.id,
          "consumerGroup", input.groupName,
          "attempts", attempts,
          "error", safeError(error),
          "payload", JSON.stringify(entry.fields),
        );
        await this.redis.call("XACK", streamName, input.groupName, entry.id);
        await this.redis.call("HDEL", retryHash, entry.id);
        result.deadLettered += 1;
      }
    }
    return result;
  }

  async consumeNew(input: {
    cityCode: string;
    consumerName: string;
    handler: DispatchStreamHandler;
    groupName?: string;
    count?: number;
    blockMs?: number;
  }): Promise<DispatchStreamConsumeResult> {
    const groupName = input.groupName ?? DEFAULT_DISPATCH_CONSUMER_GROUP;
    const streamName = getDispatchStreamName(input.cityCode);
    const count = Math.max(1, Math.min(100, Math.trunc(input.count ?? 25)));
    const blockMs = Math.max(0, Math.min(5_000, Math.trunc(input.blockMs ?? 1_000)));
    await this.ensureGroup(input.cityCode, groupName);
    const args: Array<string | number> = [
      "GROUP", groupName, input.consumerName, "COUNT", count,
    ];
    if (blockMs > 0) args.push("BLOCK", blockMs);
    args.push("STREAMS", streamName, ">");
    const entries = parseReadResponse(await this.redis.call("XREADGROUP", ...args));
    return this.processEntries({ ...input, groupName, entries, reclaimed: false });
  }

  async reclaimStale(input: {
    cityCode: string;
    consumerName: string;
    handler: DispatchStreamHandler;
    groupName?: string;
    count?: number;
    minIdleMs?: number;
  }): Promise<DispatchStreamConsumeResult> {
    const groupName = input.groupName ?? DEFAULT_DISPATCH_CONSUMER_GROUP;
    const streamName = getDispatchStreamName(input.cityCode);
    const count = Math.max(1, Math.min(100, Math.trunc(input.count ?? 25)));
    const minIdleMs = Math.max(1_000, Math.trunc(input.minIdleMs ?? this.retryPolicy.delayMs));
    await this.ensureGroup(input.cityCode, groupName);
    const cursorKey = `${streamName}:${groupName}`;
    const response = await this.redis.call(
      "XAUTOCLAIM", streamName, groupName, input.consumerName, minIdleMs,
      this.claimCursors.get(cursorKey) ?? "0-0", "COUNT", count,
    );
    const claimed = parseClaimResponse(response);
    this.claimCursors.set(cursorKey, claimed.nextCursor);
    return this.processEntries({ ...input, groupName, entries: claimed.entries, reclaimed: true });
  }

  async getStreamLength(streamName: string): Promise<number> {
    await this.connect();
    return Number(await this.redis.call("XLEN", streamName));
  }

  async readLatestEntries(streamName: string, count = 10): Promise<unknown[]> {
    await this.connect();
    const response = await this.redis.call("XREVRANGE", streamName, "+", "-", "COUNT", count);
    return Array.isArray(response) ? response : [];
  }
}

export const dispatchStreamConsumer = new DispatchStreamConsumer();
