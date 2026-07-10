import type { FastifyInstance } from "fastify";
import { registerRefundRoutes } from "./refund/refundRoutes.js";
import { registerAftersaleCaseRoutes } from "./case/aftersaleCaseRoutes.js";

export async function registerAftersaleModule(app: FastifyInstance): Promise<void> {
  await registerRefundRoutes(app);
  await registerAftersaleCaseRoutes(app);
}
