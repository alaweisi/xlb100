import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../../context/requestContextMiddleware.js";
import {
  supportQualityService,
  SupportQualityError,
} from "./supportQualityService.js";
const fail = (e: unknown, r: FastifyReply) => {
  if (e instanceof SupportQualityError) return r.status(e.statusCode).send({ ok: false, error: e.message });
  const databaseError = e as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  if (["ER_DUP_ENTRY", "ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(databaseError.code ?? "") || [1062, 1205, 1213].includes(databaseError.errno ?? 0)
    || databaseError.cause?.code === "ER_DUP_ENTRY" || databaseError.cause?.errno === 1062) {
    return r.status(409).send({ ok: false, error: "quality target already exists" });
  }
  return Promise.reject(e);
};
export async function registerSupportQualityRoutes(app: FastifyInstance) {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });
  for (const target of ["tickets", "conversations"] as const)
    app.post(
      `/api/support/${target}/:targetId/csat`,
      { preHandler },
      async (req, rep) => {
        try {
          return {
            ok: true,
            csat: await supportQualityService.submitCsat(
              getRequestContext(req),
              target === "tickets" ? "ticket" : "conversation",
              (req.params as { targetId: string }).targetId,
              req.body,
            ),
          };
        } catch (e) {
          return fail(e, rep);
        }
      },
    );
  app.post(
    "/api/internal/support/quality/rubrics",
    { preHandler },
    async (req, rep) => {
      try {
        return {
          ok: true,
          rubric: await supportQualityService.createRubric(
            getRequestContext(req),
            req.body,
          ),
        };
      } catch (e) {
        return fail(e, rep);
      }
    },
  );
  app.post(
    "/api/internal/support/quality/reviews",
    { preHandler },
    async (req, rep) => {
      try {
        return {
          ok: true,
          review: await supportQualityService.review(
            getRequestContext(req),
            req.body,
          ),
        };
      } catch (e) {
        return fail(e, rep);
      }
    },
  );
  app.get(
    "/api/internal/support/quality/dashboard",
    { preHandler },
    async (req, rep) => {
      try {
        return {
          ok: true,
          dashboard: await supportQualityService.dashboard(
            getRequestContext(req),
          ),
        };
      } catch (e) {
        return fail(e, rep);
      }
    },
  );
}
