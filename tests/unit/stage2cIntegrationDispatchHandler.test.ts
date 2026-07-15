import { describe, expect, it, vi } from "vitest";
import { createDispatchStreamDurableHandler } from "../../backend/src/streams/dispatchStreamDurableHandler.js";

const message = {
  dispatchTaskId: "dispatch-1",
  orderId: "order-1",
  cityCode: "hangzhou",
  customerId: "customer-1",
  skuId: "sku-1",
  amount: 88.5,
  sourceEventId: "event-1",
};

describe("stage 2C integrated dispatch stream handler", () => {
  it("accepts an exact durable MySQL projection", async () => {
    const query = vi.fn().mockResolvedValue([[
      {
        dispatch_task_id: "dispatch-1",
        order_id: "order-1",
        city_code: "hangzhou",
        customer_id: "customer-1",
        sku_id: "sku-1",
        amount: "88.50",
        source_event_id: "event-1",
      },
    ]]);
    const handler = createDispatchStreamDurableHandler(() => ({ query }) as never);
    await expect(handler(message, {
      entryId: "1-0",
      streamName: "xlb:dispatch:hangzhou:orders",
      groupName: "xlb-dispatch-workers",
      consumerName: "worker-test",
      reclaimed: false,
    })).resolves.toBeUndefined();
  });

  it("blocks ACK when MySQL is absent or inconsistent", async () => {
    const missing = createDispatchStreamDurableHandler(() => ({
      query: vi.fn().mockResolvedValue([[]]),
    }) as never);
    await expect(missing(message, {} as never)).rejects.toThrow("missing");

    const mismatched = createDispatchStreamDurableHandler(() => ({
      query: vi.fn().mockResolvedValue([[
        {
          dispatch_task_id: "dispatch-1",
          order_id: "wrong-order",
          city_code: "hangzhou",
          customer_id: "customer-1",
          sku_id: "sku-1",
          amount: "88.50",
          source_event_id: "event-1",
        },
      ]]),
    }) as never);
    await expect(mismatched(message, {} as never)).rejects.toThrow("does not match");
  });
});
