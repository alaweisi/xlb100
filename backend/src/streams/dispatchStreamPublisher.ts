import type { DispatchStreamMessage, DispatchTask } from "@xlb/types";
import { dispatchStreamMessageSchema } from "@xlb/validators";
import { getRedisClient } from "../dal/redisClient.js";
import { getDispatchStreamName } from "./cityStreamNames.js";

export class DispatchStreamPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchStreamPublishError";
  }
}

export class DispatchStreamPublisher {
  async publish(task: DispatchTask): Promise<string> {
    const streamName = getDispatchStreamName(task.cityCode);
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

    const redis = getRedisClient();
    if (redis.status === "wait") {
      await redis.connect();
    }

    const entryId = await redis.xadd(
      streamName,
      "*",
      "dispatchTaskId",
      message.dispatchTaskId,
      "orderId",
      message.orderId,
      "cityCode",
      message.cityCode,
      "customerId",
      message.customerId,
      "skuId",
      message.skuId,
      "amount",
      String(message.amount),
      "sourceEventId",
      message.sourceEventId,
    );

    if (!entryId) {
      throw new DispatchStreamPublishError("Redis XADD returned no entry id");
    }

    return entryId;
  }
}

export const dispatchStreamPublisher = new DispatchStreamPublisher();
