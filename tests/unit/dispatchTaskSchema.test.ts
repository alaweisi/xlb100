import { describe, it, expect } from "vitest";
import { dispatchTaskSchema, dispatchStreamMessageSchema } from "@xlb/validators";

describe("dispatchTaskSchema", () => {
  const validTask = {
    dispatchTaskId: "dpt_test_001",
    cityCode: "hangzhou",
    orderId: "ord_test_001",
    customerId: "customer-001",
    skuId: "sku_home_daily_2h",
    amount: 89,
    sourceEventId: "evt_test_001",
    streamName: "xlb:dispatch:hangzhou:orders",
    streamEntryId: "1234-0",
    status: "queued" as const,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
  };

  it("accepts valid dispatch task", () => {
    expect(dispatchTaskSchema.parse(validTask)).toEqual(validTask);
  });

  it("rejects __global__ cityCode", () => {
    expect(() =>
      dispatchTaskSchema.parse({ ...validTask, cityCode: "__global__" }),
    ).toThrow();
  });

  it("requires non-empty orderId and sourceEventId", () => {
    expect(() =>
      dispatchTaskSchema.parse({ ...validTask, orderId: "" }),
    ).toThrow();
    expect(() =>
      dispatchTaskSchema.parse({ ...validTask, sourceEventId: "" }),
    ).toThrow();
  });

  it("validates dispatch stream message", () => {
    const msg = {
      dispatchTaskId: "dpt_test_001",
      orderId: "ord_test_001",
      cityCode: "hangzhou",
      customerId: "customer-001",
      skuId: "sku_home_daily_2h",
      amount: 89,
      sourceEventId: "evt_test_001",
    };
    expect(dispatchStreamMessageSchema.parse(msg)).toEqual(msg);
  });
});
