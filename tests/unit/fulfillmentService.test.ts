import { describe, it, expect } from "vitest";
import { FulfillmentService } from "../../backend/src/fulfillment/fulfillmentService.js";

describe("fulfillmentService", () => {
  it("lists fulfillments for worker", async () => {
    const service = new FulfillmentService({
      listByWorker: async () => [],
    } as never);
    const result = await service.listFulfillmentsForWorker("w1", "hangzhou");
    expect(result).toEqual([]);
  });
});
