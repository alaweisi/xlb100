import type { FastifyInstance, FastifyReply } from "fastify";
import type { OaTaskStatus } from "@xlb/types";
import {
  createOaApprovalRequestSchema,
  createOaTaskRequestSchema,
  oaActivityQuerySchema,
  oaApprovalActionRequestSchema,
  oaApprovalDecisionRequestSchema,
  oaApprovalListQuerySchema,
  oaAuditQuerySchema,
  oaTaskActionRequestSchema,
  oaTaskListQuerySchema,
} from "@xlb/validators";
import {
  createRequestContextMiddleware,
  getRequestContext,
} from "../context/requestContextMiddleware.js";
import { oaIdentityService } from "./oaIdentityService.js";
import {
  OaAuthorizationError,
  oaAuthorizationService,
} from "./oaAuthorizationService.js";
import {
  OaCollaborationError,
  oaCollaborationService,
} from "./oaCollaborationService.js";
import { oaNotificationService } from "./oaNotificationService.js";

function fail(error: unknown, reply: FastifyReply) {
  if (error instanceof OaAuthorizationError || error instanceof OaCollaborationError) {
    return reply.status(error.statusCode).send({
      ok: false,
      error: error.message,
      ...("reasonCode" in error ? { reasonCode: error.reasonCode } : {}),
    });
  }
  throw error;
}

function invalid(reply: FastifyReply, details: unknown) {
  return reply.status(400).send({ ok: false, error: "Invalid OA request", details });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function registerOaRoutes(app: FastifyInstance): Promise<void> {
  const preHandler = createRequestContextMiddleware({ requireCityCode: false });

  app.get("/api/oa/me", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.workbench.read");
      return { ok: true, principal };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/logout", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.workbench.read");
      await oaIdentityService.revokeSession(principal.sessionId, principal.membershipId);
      await oaAuthorizationService.recordAudit(context, {
        organizationId: principal.organization.organizationId,
        action: "oa.session.logout",
        targetType: "oa_session",
        targetId: principal.sessionId,
        decision: "allowed",
        reasonCode: "user_logout",
      });
      return { ok: true };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/scopes", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.read");
      return {
        ok: true,
        scope: {
          organization: principal.organization,
          cityCodes: principal.cityCodes,
          permissions: principal.permissions,
        },
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/organizations", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.organization.read");
      return {
        ok: true,
        organizations: await oaAuthorizationService.listOrganizations(principal),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/workbench", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.workbench.read");
      const scopedPrincipal = (permission: typeof principal.permissions[number]) => {
        const cityCodes = principal.permissionCityCodes[permission] ?? [];
        return cityCodes.length > 0 ? { ...principal, cityCodes } : null;
      };
      const taskPrincipal = scopedPrincipal("oa.task.read");
      const approvalPrincipal = scopedPrincipal("oa.approval.read");
      const activityPrincipal = scopedPrincipal("oa.activity.read");
      const [tasks, approvals, activities] = await Promise.all([
        taskPrincipal
          ? oaCollaborationService.listTasks(taskPrincipal, { assignee: "me" })
          : Promise.resolve([]),
        approvalPrincipal
          ? oaCollaborationService.listApprovals(approvalPrincipal)
          : Promise.resolve([]),
        activityPrincipal
          ? oaCollaborationService.listActivities(activityPrincipal, { limit: 50 })
          : Promise.resolve([]),
      ]);
      return {
        ok: true,
        principal,
        tasks,
        approvals,
        activities,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/tasks", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const parsed = oaTaskListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    try {
      const requestedCities = parsed.data.cityCode ? [parsed.data.cityCode] : [];
      const principal = await oaAuthorizationService.authorize(context, "oa.task.read", requestedCities);
      return {
        ok: true,
        tasks: await oaCollaborationService.listTasks(principal, {
          cityCode: parsed.data.cityCode,
          status: parsed.data.status as OaTaskStatus | undefined,
          assignee: parsed.data.assignee,
        }),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/tasks", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const parsed = createOaTaskRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    try {
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.task.manage",
        [parsed.data.cityCode],
      );
      const result = await oaCollaborationService.createTask(context, principal, parsed.data);
      return { ok: true, ...result };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/tasks/:taskId", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const taskId = asString((request.params as { taskId?: unknown }).taskId);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.task.read");
      return { ok: true, task: await oaCollaborationService.getTask(principal, taskId) };
    } catch (error) {
      return fail(error, reply);
    }
  });

  const taskActions = ["claim", "start", "block", "complete", "delegate", "cancel"] as const;
  for (const action of taskActions) {
    app.post(`/api/oa/tasks/:taskId/${action}`, { preHandler }, async (request, reply) => {
      const context = getRequestContext(request);
      const taskId = asString((request.params as { taskId?: unknown }).taskId);
      const parsed = oaTaskActionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(reply, parsed.error.flatten());
      try {
        const principal = await oaAuthorizationService.authorize(context, "oa.task.manage");
        const result = await oaCollaborationService.transitionTask(
          context,
          principal,
          taskId,
          action,
          parsed.data,
        );
        return { ok: true, ...result };
      } catch (error) {
        return fail(error, reply);
      }
    });
  }

  app.get("/api/oa/approvals", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const parsed = oaApprovalListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    try {
      const requestedCities = parsed.data.cityCode ? [parsed.data.cityCode] : [];
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.approval.read",
        requestedCities,
      );
      return {
        ok: true,
        approvals: await oaCollaborationService.listApprovals(principal, {
          cityCode: parsed.data.cityCode,
          status: parsed.data.status,
          requestedBy: parsed.data.requestedBy,
        }),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/approvals", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const parsed = createOaApprovalRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    try {
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.approval.request",
        [parsed.data.cityCode],
      );
      const result = await oaCollaborationService.createApproval(context, principal, parsed.data);
      return { ok: true, ...result };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/approvals/:approvalRequestId", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const approvalRequestId = asString(
      (request.params as { approvalRequestId?: unknown }).approvalRequestId,
    );
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.approval.read");
      return {
        ok: true,
        approval: await oaCollaborationService.getApproval(principal, approvalRequestId),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post(
    "/api/oa/approvals/:approvalRequestId/decision",
    { preHandler },
    async (request, reply) => {
      const context = getRequestContext(request);
      const approvalRequestId = asString(
        (request.params as { approvalRequestId?: unknown }).approvalRequestId,
      );
      const parsed = oaApprovalDecisionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(reply, parsed.error.flatten());
      try {
        const principal = await oaAuthorizationService.authorize(context, "oa.approval.decide");
        const result = await oaCollaborationService.decideApproval(
          context,
          principal,
          approvalRequestId,
          parsed.data,
        );
        return { ok: true, ...result };
      } catch (error) {
        return fail(error, reply);
      }
    },
  );

  for (const action of ["resubmit", "withdraw"] as const) {
    app.post(`/api/oa/approvals/:approvalRequestId/${action}`, { preHandler }, async (request, reply) => {
      const context = getRequestContext(request);
      const approvalRequestId = asString(
        (request.params as { approvalRequestId?: unknown }).approvalRequestId,
      );
      const parsed = oaApprovalActionRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) return invalid(reply, parsed.error.flatten());
      try {
        const principal = await oaAuthorizationService.authorize(
          context,
          "oa.approval.request",
        );
        const result = await oaCollaborationService.transitionApproval(
          context,
          principal,
          approvalRequestId,
          action,
          parsed.data,
        );
        return { ok: true, ...result };
      } catch (error) {
        return fail(error, reply);
      }
    });
  }

  app.get("/api/oa/activity", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const parsed = oaActivityQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    try {
      const requestedCities = parsed.data.cityCode ? [parsed.data.cityCode] : [];
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.activity.read",
        requestedCities,
      );
      return {
        ok: true,
        activities: await oaCollaborationService.listActivities(principal, parsed.data),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/notifications", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const query = (request.query ?? {}) as { status?: unknown; limit?: unknown };
    const status = query.status === "unread" || query.status === "archived" ? query.status : "all";
    const limit = typeof query.limit === "string" ? Number(query.limit) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return invalid(reply, { limit: "must be an integer between 1 and 100" });
    }
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.notification.read");
      return { ok: true, ...(await oaNotificationService.list(principal, { status, limit })) };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/notifications/unread-count", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.notification.read");
      return { ok: true, unreadCount: await oaNotificationService.unreadCount(principal) };
    } catch (error) {
      return fail(error, reply);
    }
  });

  for (const action of ["read", "archive"] as const) {
    app.post(`/api/oa/notifications/:notificationId/${action}`, { preHandler }, async (request, reply) => {
      const context = getRequestContext(request);
      const notificationId = asString(
        (request.params as { notificationId?: unknown }).notificationId,
      );
      try {
        const principal = await oaAuthorizationService.authorize(context, "oa.notification.read");
        const notification = await oaNotificationService.mark(principal, notificationId, action);
        await oaAuthorizationService.recordAudit(context, {
          organizationId: principal.organization.organizationId,
          cityCode: notification.cityCode ?? undefined,
          permission: "oa.notification.read",
          action: `oa.notification.${action}`,
          targetType: "oa_notification",
          targetId: notificationId,
          decision: "allowed",
          reasonCode: `user_${action}`,
        });
        return { ok: true, notification };
      } catch (error) {
        return fail(error, reply);
      }
    });
  }

  app.get("/api/oa/audit-records", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    const parsed = oaAuditQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    try {
      const requestedCities = parsed.data.cityCode ? [parsed.data.cityCode] : [];
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.audit.read",
        requestedCities,
      );
      return {
        ok: true,
        records: await oaCollaborationService.listAudit(principal, parsed.data),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });
}
