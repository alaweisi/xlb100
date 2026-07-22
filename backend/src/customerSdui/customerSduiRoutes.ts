import type { FastifyInstance, FastifyReply } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import { CustomerSduiError, customerSduiService } from "./customerSduiService.js";

type RevisionParams = { pageId: string; revisionId: string };
type PageParams = { pageId: string };

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof CustomerSduiError) {
    return reply.status(error.statusCode).send({ ok: false, error: error.message });
  }
  throw error;
}

function guard(request: Parameters<typeof getRequestContext>[0], reply: FastifyReply) {
  const context = getRequestContext(request);
  const authz = authorizeRequest(context);
  if (!authz.ok) {
    reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    return null;
  }
  return context;
}

export async function registerCustomerSduiRoutes(app: FastifyInstance): Promise<void> {
  const scoped = { preHandler: createRequestContextMiddleware({ requireCityCode: true }) };

  app.get<{ Params: PageParams; Querystring: { appVersion?: string; locale?: string } }>(
    "/api/customer/sdui/pages/:pageId/manifest", scoped, async (request, reply) => {
      const context = guard(request, reply);
      if (!context) return;
      try {
        const envelope = await customerSduiService.resolveManifest(context, request.params.pageId, {
          appVersion: request.query.appVersion ?? "",
          locale: request.query.locale ?? "",
        });
        reply.header("Cache-Control", envelope.cacheTtlSeconds > 0
          ? `private, max-age=${envelope.cacheTtlSeconds}`
          : "no-store");
        return envelope;
      } catch (error) { return sendError(reply, error); }
    },
  );

  app.post<{ Params: PageParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await customerSduiService.createDraft(context, request.params.pageId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.patch<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await customerSduiService.updateDraft(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/review", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await customerSduiService.review(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/publish", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await customerSduiService.publish(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/unpublish", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await customerSduiService.unpublish(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/rollback", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await customerSduiService.rollback(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: PageParams }>(
    "/api/internal/customer-sdui/pages/:pageId/kill-switch", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await customerSduiService.setKillSwitch(context, request.params.pageId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
}
