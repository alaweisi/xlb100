import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../../context/requestContextMiddleware.js";
import { issueRealtimeTicket } from "./supportRealtimeTicket.js";
import {
  supportConversationService,
  SupportConversationError,
} from "./supportConversationService.js";

type ConversationParams = {
  conversationId: string;
};

type MessageListQuery = {
  afterSeq?: string | number;
  limit?: string | number;
};

const fail = (error: unknown, reply: FastifyReply) => error instanceof SupportConversationError
  ? reply.status(error.statusCode).send({ ok: false, error: error.message })
  : Promise.reject(error);

export async function registerSupportConversationRoutes(app: FastifyInstance) {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });

  app.post("/api/support/realtime-ticket", { preHandler }, async (request, reply) => {
    try {
      return { ok: true, ...await issueRealtimeTicket(getRequestContext(request)) };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/support/conversations", { preHandler }, async (request, reply) => {
    try {
      return {
        ok: true,
        conversation: await supportConversationService.create(
          getRequestContext(request),
          request.body,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/support/conversations/:conversationId/messages", { preHandler }, async (request, reply) => {
    try {
      const query = request.query as MessageListQuery;
      const params = request.params as ConversationParams;
      return {
        ok: true,
        messages: await supportConversationService.messages(
          getRequestContext(request),
          params.conversationId,
          Number(query.afterSeq ?? 0),
          Number(query.limit ?? 100),
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/support/conversations/:conversationId/messages", { preHandler }, async (request, reply) => {
    try {
      return {
        ok: true,
        message: await supportConversationService.send(
          getRequestContext(request),
          (request.params as ConversationParams).conversationId,
          request.body,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/internal/support/conversations/:conversationId/accept", { preHandler }, async (request, reply) => {
    try {
      return {
        ok: true,
        conversation: await supportConversationService.accept(
          getRequestContext(request),
          (request.params as ConversationParams).conversationId,
          request.body,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/internal/support/conversations/:conversationId/transfer", { preHandler }, async (request, reply) => {
    try {
      return {
        ok: true,
        conversation: await supportConversationService.transfer(
          getRequestContext(request),
          (request.params as ConversationParams).conversationId,
          request.body,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/internal/support/conversations/:conversationId/close", { preHandler }, async (request, reply) => {
    try {
      return {
        ok: true,
        conversation: await supportConversationService.close(
          getRequestContext(request),
          (request.params as ConversationParams).conversationId,
          request.body,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });
}
