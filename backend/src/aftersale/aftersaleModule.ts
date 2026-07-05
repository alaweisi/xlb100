import type { FastifyInstance } from "fastify";
import { registerRefundRoutes } from "./refund/refundRoutes.js";

export async function registerAftersaleModule(app: FastifyInstance): Promise<void> {
  await registerRefundRoutes(app);
}
