import type { FastifyInstance, FastifyReply } from "fastify";
import { createRequestContextMiddleware, getRequestContext } from "../context/requestContextMiddleware.js";
import { authorizeRequest } from "../gateway/authz.js";
import {
  MarketingAuthorizationError,
  MarketingConflictError,
  MarketingNotFoundError,
  MarketingValidationError,
  marketingService,
} from "./marketingService.js";

function sendMarketingError(reply: FastifyReply, error: unknown) {
  if (
    error instanceof MarketingValidationError || error instanceof MarketingAuthorizationError
    || error instanceof MarketingNotFoundError || error instanceof MarketingConflictError
  ) {
    return reply.status(error.statusCode).send({ ok: false, error: error.message });
  }
  throw error;
}

export async function registerMarketingRoutes(app: FastifyInstance): Promise<void> {
  const scoped = { preHandler: createRequestContextMiddleware({ requireCityCode: true }) };

  app.get("/api/customer/marketing/coupon-grants", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, couponGrants: await marketingService.listCustomerGrants(context, request.query) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/customer/marketing/discount-decisions", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, discountDecision: await marketingService.issueDiscountDecision(context, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.get("/api/admin/marketing/campaigns", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, campaigns: await marketingService.listCampaigns(context) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/campaigns", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, campaign: await marketingService.createCampaign(context, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/campaigns/:campaignId/review", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, campaign: await marketingService.reviewCampaign(context, (request.params as { campaignId: string }).campaignId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/campaigns/:campaignId/schedule", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, campaign: await marketingService.scheduleCampaign(context, (request.params as { campaignId: string }).campaignId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/campaigns/:campaignId/status", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, campaign: await marketingService.changeCampaignStatus(context, (request.params as { campaignId: string }).campaignId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.get("/api/admin/marketing/campaigns/:campaignId/rule-revisions", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, ruleRevisions: await marketingService.listRuleRevisions(context, (request.params as { campaignId: string }).campaignId) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/campaigns/:campaignId/rule-revisions", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, ruleRevision: await marketingService.createRuleRevision(context, (request.params as { campaignId: string }).campaignId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/rule-revisions/:ruleRevisionId/review", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, ruleRevision: await marketingService.reviewRuleRevision(context, (request.params as { ruleRevisionId: string }).ruleRevisionId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/rule-revisions/:ruleRevisionId/publish", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, ruleRevision: await marketingService.publishRuleRevision(context, (request.params as { ruleRevisionId: string }).ruleRevisionId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.get("/api/admin/marketing/coupon-definitions", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, couponDefinitions: await marketingService.listDefinitions(context) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/coupon-definitions", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, couponDefinition: await marketingService.createDefinition(context, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/coupon-definitions/:couponDefinitionId/status", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, couponDefinition: await marketingService.changeDefinitionStatus(context, (request.params as { couponDefinitionId: string }).couponDefinitionId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/coupon-grants", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, couponGrant: await marketingService.grantCoupon(context, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

  app.post("/api/admin/marketing/coupon-grants/:couponGrantId/revoke", scoped, async (request, reply) => {
    const context = getRequestContext(request);
    const authz = authorizeRequest(context);
    if (!authz.ok) return reply.status(authz.statusCode).send({ ok: false, error: authz.message });
    try { return { ok: true, couponGrant: await marketingService.revokeGrant(context, (request.params as { couponGrantId: string }).couponGrantId, request.body) }; }
    catch (error) { return sendMarketingError(reply, error); }
  });

}
