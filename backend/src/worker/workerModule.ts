import type { FastifyInstance } from "fastify";
import { registerTaskPoolRoutes } from "./taskPoolRoutes.js";
import { registerWorkerAcceptRoutes } from "./workerAcceptRoutes.js";
import { registerFulfillmentRoutes } from "../fulfillment/fulfillmentRoutes.js";

export async function registerWorkerModule(app: FastifyInstance): Promise<void> {
  await registerTaskPoolRoutes(app);
  await registerWorkerAcceptRoutes(app);
  await registerFulfillmentRoutes(app);
}

export const workerModule = registerWorkerModule;
