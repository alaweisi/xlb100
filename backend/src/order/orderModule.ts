import type { FastifyInstance } from "fastify";
import { registerOrderModule as registerOrderRoutes } from "./orderRoutes.js";
import { registerOrderReverseRoutes } from "./reverse/orderReverseRoutes.js";

export async function registerOrderModule(app: FastifyInstance): Promise<void> {
  await registerOrderRoutes(app);
  await registerOrderReverseRoutes(app);
}
