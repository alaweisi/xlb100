import { describe, it, expect } from "vitest";
import { getDispatchStreamName } from "../../backend/src/streams/cityStreamNames.js";
import { dispatchTaskSchema } from "@xlb/validators";

describe("dispatchStream contract", () => {
  it("stream name follows xlb:dispatch:{cityCode}:orders", () => {
    expect(getDispatchStreamName("shanghai")).toBe("xlb:dispatch:shanghai:orders");
  });

  it("stream message schema requires cityCode and sourceEventId", () => {
    const result = dispatchTaskSchema.safeParse({
      dispatchTaskId: "dpt_1",
      cityCode: "hangzhou",
      orderId: "ord_1",
      customerId: "c1",
      skuId: "sku_1",
      amount: 1,
      sourceEventId: "evt_1",
      streamName: "xlb:dispatch:hangzhou:orders",
      streamEntryId: null,
      status: "pending",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
