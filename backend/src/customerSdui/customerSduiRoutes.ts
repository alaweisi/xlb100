import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import { CustomerSduiError, customerSduiService } from "./customerSduiService.js";
import type { CustomerSduiService } from "./customerSduiService.js";

type RevisionParams = { pageId: string; revisionId: string };
type PageParams = { pageId: string };
type RevisionListQuery = { status?: string; cursor?: string; limit?: string };
type AuditListQuery = { revisionId?: string; action?: string; cursor?: string; limit?: string };

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

export function customerSduiManifestEtag(
  envelope: Awaited<ReturnType<CustomerSduiService["resolveManifest"]>>,
): string | null {
  if (envelope.resolutionReason !== "published" || envelope.manifest === null) return null;
  const canonicalize = (value: unknown): string => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
  };
  const publicationHash = createHash("sha256")
    .update(canonicalize(envelope.manifest))
    .digest("hex");
  return `"${envelope.manifest.revision}-${publicationHash}"`;
}

function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const value = Array.isArray(header) ? header.join(",") : header;
  return value.split(",").some((candidate) => {
    const normalized = candidate.trim();
    return normalized === "*" || normalized === etag || normalized === `W/${etag}`;
  });
}

export async function registerCustomerSduiRoutes(
  app: FastifyInstance,
  service: CustomerSduiService = customerSduiService,
): Promise<void> {
  const scoped = { preHandler: createRequestContextMiddleware({ requireCityCode: true }) };

  app.get<{ Params: PageParams; Querystring: { appVersion?: string; locale?: string } }>(
    "/api/customer/sdui/pages/:pageId/manifest", scoped, async (request, reply) => {
      const context = guard(request, reply);
      if (!context) return;
      try {
        const envelope = await service.resolveManifest(context, request.params.pageId, {
          appVersion: request.query.appVersion ?? "",
          locale: request.query.locale ?? "",
        });
        reply.header("Cache-Control", envelope.resolutionReason === "published"
          ? "private, max-age=0, must-revalidate"
          : "no-store");
        reply.header("Vary", "Authorization, X-XLB-City-Code");
        const etag = customerSduiManifestEtag(envelope);
        if (etag !== null) {
          reply.header("ETag", etag);
          if (etagMatches(request.headers["if-none-match"], etag)) {
            return reply.status(304).send();
          }
        }
        return envelope;
      } catch (error) { return sendError(reply, error); }
    },
  );

  app.get<{ Params: PageParams; Querystring: RevisionListQuery }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      reply.header("Cache-Control", "no-store");
      try { return await service.listRevisions(context, request.params.pageId, request.query); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.get<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      reply.header("Cache-Control", "no-store");
      try { return await service.getRevision(context, request.params.pageId, request.params.revisionId); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.get<{ Params: PageParams }>(
    "/api/internal/customer-sdui/pages/:pageId/kill-switch", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      reply.header("Cache-Control", "no-store");
      try { return await service.getKillSwitch(context, request.params.pageId); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.get<{ Params: PageParams; Querystring: AuditListQuery }>(
    "/api/internal/customer-sdui/pages/:pageId/audits", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      reply.header("Cache-Control", "no-store");
      try { return await service.listAudits(context, request.params.pageId, request.query); }
      catch (error) { return sendError(reply, error); }
    },
  );

  app.post<{ Params: PageParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await service.createDraft(context, request.params.pageId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.patch<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await service.updateDraft(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/review", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await service.review(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/publish", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await service.publish(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/unpublish", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await service.unpublish(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: RevisionParams }>(
    "/api/internal/customer-sdui/pages/:pageId/revisions/:revisionId/rollback", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await service.rollback(context, request.params.pageId, request.params.revisionId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
  app.post<{ Params: PageParams }>(
    "/api/internal/customer-sdui/pages/:pageId/kill-switch", scoped, async (request, reply) => {
      const context = guard(request, reply); if (!context) return;
      try { return await service.setKillSwitch(context, request.params.pageId, request.body); }
      catch (error) { return sendError(reply, error); }
    },
  );
}
