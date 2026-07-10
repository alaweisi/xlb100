import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../../context/requestContextMiddleware.js";
import { authorizeRequest } from "../../gateway/authz.js";
import { InvalidOrderTransitionError } from "../orderStateMachine.js";
import {
  orderReverseService,
  OrderReverseConflictError,
  OrderReverseForbiddenError,
  OrderReverseNotFoundError,
  OrderReverseValidationError,
} from "./orderReverseService.js";
import { InvalidOrderReverseTransitionError } from "./orderReverseStateMachine.js";

function mapError(error: unknown, reply: FastifyReply) {
  if (error instanceof OrderReverseValidationError) {
    return reply.status(400).send({ ok: false, error: error.message });
  }
  if (error instanceof OrderReverseForbiddenError) {
    return reply.status(403).send({ ok: false, error: error.message });
  }
  if (error instanceof OrderReverseNotFoundError) {
    return reply.status(404).send({ ok: false, error: error.message });
  }
  if (
    error instanceof OrderReverseConflictError ||
    error instanceof InvalidOrderReverseTransitionError ||
    error instanceof InvalidOrderTransitionError
  ) {
    return reply.status(409).send({ ok: false, error: error.message });
  }
  throw error;
}

export async function registerOrderReverseRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });

  app.post("/api/orders/:orderId/reverse-requests", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    if (context.appType !== "customer" || context.role !== "customer") {
      return reply.status(403).send({ ok: false, error: "reverse request requires customer role" });
    }
    try {
      return {
        ok: true,
        ...(await orderReverseService.create(
          context,
          (request.params as { orderId: string }).orderId,
          request.body,
        )),
      };
    } catch (error) {
      return mapError(error, reply);
    }
  });

  app.get("/api/orders/:orderId/reverse-requests", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    if (context.appType !== "customer" || context.role !== "customer") {
      return reply.status(403).send({ ok: false, error: "reverse request list requires customer role" });
    }
    try {
      return {
        ok: true,
        reverseRequests: await orderReverseService.listForCustomer(
          context,
          (request.params as { orderId: string }).orderId,
        ),
      };
    } catch (error) {
      return mapError(error, reply);
    }
  });

  app.get("/api/internal/aftersale/reverse-requests", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    if (context.appType !== "admin" || !["admin", "operator"].includes(context.role)) {
      return reply.status(403).send({ ok: false, error: "reverse operations require admin operator" });
    }
    const query = request.query as { status?: string; reverseType?: string };
    return { ok: true, reverseRequests: await orderReverseService.listForAdmin(context, query) };
  });

  app.post(
    "/api/internal/aftersale/reverse-requests/:reverseRequestId/review",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeRequest(context);
      if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      if (context.appType !== "admin" || !["admin", "operator"].includes(context.role)) {
        return reply.status(403).send({ ok: false, error: "reverse review requires admin operator" });
      }
      try {
        return {
          ok: true,
          ...(await orderReverseService.review(
            context,
            (request.params as { reverseRequestId: string }).reverseRequestId,
            request.body,
          )),
        };
      } catch (error) {
        return mapError(error, reply);
      }
    },
  );

  app.post(
    "/api/internal/aftersale/reverse-requests/:reverseRequestId/apply",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const authz = authorizeRequest(context);
      if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
      if (context.appType !== "admin" || !["admin", "operator"].includes(context.role)) {
        return reply.status(403).send({ ok: false, error: "reverse apply requires admin operator" });
      }
      try {
        return {
          ok: true,
          ...(await orderReverseService.apply(
            context,
            (request.params as { reverseRequestId: string }).reverseRequestId,
          )),
        };
      } catch (error) {
        return mapError(error, reply);
      }
    },
  );
}
