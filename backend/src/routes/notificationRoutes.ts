import type { FastifyInstance, FastifyReply } from "fastify";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import {
  notificationInboxService,
  NotificationInboxConflictError,
  NotificationInboxForbiddenError,
  NotificationInboxNotFoundError,
  NotificationInboxValidationError,
} from "../notification/notificationInboxService.js";
import type { NotificationInboxAppType } from "../notification/notificationInboxPolicy.js";

function sendNotificationError(error: unknown, reply: FastifyReply) {
  if (
    error instanceof NotificationInboxValidationError ||
    error instanceof NotificationInboxForbiddenError ||
    error instanceof NotificationInboxNotFoundError ||
    error instanceof NotificationInboxConflictError
  ) {
    return reply.status(error.statusCode).send({ ok: false, error: error.message });
  }
  return reply.status(500).send({ ok: false, error: "notification inbox failed" });
}

function registerRecipientRoutes(app: FastifyInstance, appType: NotificationInboxAppType): void {
  const preHandler = createRequestContextMiddleware({ requireCityCode: true });
  const base = `/api/${appType}/notifications`;

  app.get(base, { preHandler }, async (request, reply) => {
    try {
      return await notificationInboxService.list(getRequestContext(request), appType, request.query);
    } catch (error) {
      return sendNotificationError(error, reply);
    }
  });

  app.get(`${base}/unread-count`, { preHandler }, async (request, reply) => {
    try {
      return await notificationInboxService.unreadCount(getRequestContext(request), appType);
    } catch (error) {
      return sendNotificationError(error, reply);
    }
  });

  app.post(`${base}/:notificationId/read`, { preHandler }, async (request, reply) => {
    const { notificationId } = request.params as { notificationId: string };
    try {
      return await notificationInboxService.markRead(
        getRequestContext(request),
        appType,
        notificationId,
        request.body,
      );
    } catch (error) {
      return sendNotificationError(error, reply);
    }
  });

  app.post(`${base}/:notificationId/archive`, { preHandler }, async (request, reply) => {
    const { notificationId } = request.params as { notificationId: string };
    try {
      return await notificationInboxService.archive(
        getRequestContext(request),
        appType,
        notificationId,
        request.body,
      );
    } catch (error) {
      return sendNotificationError(error, reply);
    }
  });
}

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  registerRecipientRoutes(app, "customer");
  registerRecipientRoutes(app, "worker");
}
