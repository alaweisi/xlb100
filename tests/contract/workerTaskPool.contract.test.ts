import { describe, it, expect } from "vitest";
import { workerTaskPoolItemSchema } from "@xlb/validators";

describe("workerTaskPool contract", () => {
  it("task pool item schema requires cityCode", () => {
    const item = {
      dispatchTaskId: "dpt_1",
      cityCode: "hangzhou",
      orderId: "ord_1",
      skuId: "sku_1",
      amount: 89,
      streamName: "xlb:dispatch:hangzhou:orders",
      status: "queued" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(workerTaskPoolItemSchema.parse(item)).toEqual(item);
  });
});
