import type { FastifyInstance } from "fastify";
import {
  createQueuedDispatchTask,
  workerHangzhouHeaders,
} from "./acceptTestHelper.js";

export async function createAcceptedFulfillment(app: FastifyInstance): Promise<{
  dispatchTaskId: string;
  fulfillmentId: string;
  orderId: string;
}> {
  const dispatchTaskId = await createQueuedDispatchTask(app);
  const response = await app.inject({
    method: "POST",
    url: `/api/worker/tasks/${dispatchTaskId}/accept`,
    headers: workerHangzhouHeaders,
    payload: {},
  });
  if (response.statusCode !== 200) {
    throw new Error(`Failed to create accepted fulfillment: ${response.body}`);
  }
  const fulfillment = response.json().fulfillment as {
    fulfillmentId: string;
    orderId: string;
  };
  return {
    dispatchTaskId,
    fulfillmentId: fulfillment.fulfillmentId,
    orderId: fulfillment.orderId,
  };
}
