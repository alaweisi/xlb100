import type { FastifyInstance } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  pricingService,
  PricingNotFoundError,
  PricingValidationError,
} from "./pricingService.js";

export async function registerPricingModule(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/pricing/quote",
    { preHandler: createRequestContextMiddleware({ requireCityCode: true }) },
    async (request, reply) => {
      const context = getRequestContext(request);

      const authz = authorizeRequest(context);
      if (!authz.ok) {
        return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      }

      const skuId = (request.query as { skuId?: string }).skuId;
      if (!skuId) {
        return reply.status(400).send({ ok: false, error: "skuId query parameter required" });
      }

      try {
        const quote = await pricingService.getQuote(context, skuId);
        return { ok: true, quote };
      } catch (error) {
        if (error instanceof PricingValidationError) {
          return reply.status(400).send({ ok: false, error: error.message });
        }
        if (error instanceof PricingNotFoundError) {
          return reply.status(404).send({ ok: false, error: error.message });
        }
        throw error;
      }
    },
  );
}
