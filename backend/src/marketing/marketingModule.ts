import type { FastifyInstance } from "fastify";
import { registerMarketingRoutes } from "./marketingRoutes.js";

/** Phase 29 Marketing/Coupon route module. Registration is performed by the backend composition root. */
export async function registerMarketingModule(app: FastifyInstance): Promise<void> {
  await registerMarketingRoutes(app);
}
