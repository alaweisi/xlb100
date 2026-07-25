import type { FastifyInstance, FastifyReply } from "fastify";
import type { OaTaskStatus } from "@xlb/types";
import {
  createOaApprovalRequestSchema,
  createOaAdminHandoffRequestSchema,
  approveOaDelegationRequestSchema,
  createOaDelegationRequestSchema,
  createOaMembershipRequestSchema,
  createOaOrganizationRequestSchema,
  createOaRoleRequestSchema,
  createOaTaskRequestSchema,
  oaActivityQuerySchema,
  oaApprovalActionRequestSchema,
  oaApprovalDecisionRequestSchema,
  oaApprovalListQuerySchema,
  oaAuditQuerySchema,
  oaTaskActionRequestSchema,
  oaTaskListQuerySchema,
  revokeOaDelegationRequestSchema,
  updateOaMembershipRequestSchema,
  updateOaOrganizationRequestSchema,
  updateOaRoleRequestSchema,
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
import {
  OaAdministrationError,
  oaAdministrationService,
} from "./oaAdministrationService.js";
import { oaRealtimeService } from "./oaRealtimeService.js";
import {
  OaHandoffError,
  oaHandoffService,
} from "./oaHandoffService.js";

function fail(error: unknown, reply: FastifyReply) {
  if (
    error instanceof OaAuthorizationError ||
    error instanceof OaCollaborationError ||
    error instanceof OaAdministrationError ||
    error instanceof OaHandoffError
  ) {
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

  app.get("/api/oa/events", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      let principal = await oaAuthorizationService.authorize(context, "oa.workbench.read");
      let fingerprint = await oaRealtimeService.fingerprint(principal);
      let polling = false;
      let heartbeatCounter = 0;
      let closed = false;

      reply.hijack();
      reply.raw.statusCode = 200;
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders();

      const send = (event: string, data: Record<string, unknown>) => {
        if (closed || reply.raw.destroyed || reply.raw.writableEnded) return;
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      send("ready", {
        generatedAt: new Date().toISOString(),
        organizationId: principal.organization.organizationId,
        cityCodes: principal.cityCodes,
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        if (!reply.raw.writableEnded) reply.raw.end();
      };
      const timer = setInterval(() => {
        if (polling || closed) return;
        polling = true;
        void (async () => {
          try {
            principal = await oaAuthorizationService.authorize(context, "oa.workbench.read");
            const nextFingerprint = await oaRealtimeService.fingerprint(principal);
            if (nextFingerprint !== fingerprint) {
              fingerprint = nextFingerprint;
              send("refresh", { generatedAt: new Date().toISOString() });
            } else if ((heartbeatCounter += 1) >= 5) {
              heartbeatCounter = 0;
              send("heartbeat", { generatedAt: new Date().toISOString() });
            }
          } catch (error) {
            const reasonCode = error instanceof OaAuthorizationError
              ? error.reasonCode
              : "oa_realtime_failed";
            send("session-invalid", { reasonCode });
            cleanup();
          } finally {
            polling = false;
          }
        })();
      }, 3_000);

      request.raw.once("close", cleanup);
      request.raw.once("aborted", cleanup);
      return reply;
    } catch (error) {
      return fail(error, reply);
    }
  });

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

  app.post("/api/oa/admin-handoffs", { preHandler }, async (request, reply) => {
    const parsed = createOaAdminHandoffRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(
        context,
        parsed.data.permissionKey,
        [parsed.data.cityCode],
      );
      const handoff = await oaHandoffService.issue(principal, parsed.data);
      await oaAuthorizationService.recordAudit(context, {
        organizationId: principal.organization.organizationId,
        cityCode: parsed.data.cityCode,
        permission: parsed.data.permissionKey,
        action: "oa.admin_handoff.issue",
        targetType: "admin_route",
        targetId: parsed.data.targetPath,
        decision: "allowed",
        reasonCode: "short_lived_single_use",
      });
      return handoff;
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

  app.post("/api/oa/organizations", { preHandler }, async (request, reply) => {
    const parsed = createOaOrganizationRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.organization.manage",
        parsed.data.cityCodes,
      );
      return {
        ok: true,
        ...await oaAdministrationService.createOrganization(context, principal, parsed.data),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/organizations/:organizationId", { preHandler }, async (request, reply) => {
    const parsed = updateOaOrganizationRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const organizationId = asString((request.params as { organizationId?: unknown }).organizationId);
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.organization.manage",
        parsed.data.cityCodes ?? [],
      );
      return {
        ok: true,
        ...await oaAdministrationService.updateOrganization(
          context,
          principal,
          organizationId,
          parsed.data,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/roles", { preHandler }, async (request, reply) => {
    const organizationId = asString((request.query as { organizationId?: unknown }).organizationId) || undefined;
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.read");
      return {
        ok: true,
        roles: await oaAdministrationService.listRoles(principal, organizationId),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/roles", { preHandler }, async (request, reply) => {
    const parsed = createOaRoleRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.manage");
      return {
        ok: true,
        ...await oaAdministrationService.createRole(context, principal, parsed.data),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/roles/:roleId", { preHandler }, async (request, reply) => {
    const parsed = updateOaRoleRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const roleId = asString((request.params as { roleId?: unknown }).roleId);
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.manage");
      return {
        ok: true,
        ...await oaAdministrationService.updateRole(context, principal, roleId, parsed.data),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/memberships", { preHandler }, async (request, reply) => {
    const organizationId = asString((request.query as { organizationId?: unknown }).organizationId) || undefined;
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.read");
      return {
        ok: true,
        memberships: await oaAdministrationService.listMemberships(principal, organizationId),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/memberships", { preHandler }, async (request, reply) => {
    const parsed = createOaMembershipRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.manage");
      return {
        ok: true,
        ...await oaAdministrationService.createMembership(context, principal, parsed.data),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/memberships/:membershipId", { preHandler }, async (request, reply) => {
    const parsed = updateOaMembershipRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const membershipId = asString((request.params as { membershipId?: unknown }).membershipId);
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.manage");
      return {
        ok: true,
        ...await oaAdministrationService.updateMembership(
          context,
          principal,
          membershipId,
          parsed.data,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.get("/api/oa/delegations", { preHandler }, async (request, reply) => {
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.read");
      return {
        ok: true,
        delegations: await oaAdministrationService.listDelegations(principal),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/delegations", { preHandler }, async (request, reply) => {
    const parsed = createOaDelegationRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(
        context,
        "oa.authorization.manage",
        [parsed.data.cityCode],
      );
      return {
        ok: true,
        ...await oaAdministrationService.createDelegation(context, principal, parsed.data),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/delegations/:grantId/approve", { preHandler }, async (request, reply) => {
    const parsed = approveOaDelegationRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const grantId = asString((request.params as { grantId?: unknown }).grantId);
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.manage");
      return {
        ok: true,
        ...await oaAdministrationService.approveDelegation(
          context,
          principal,
          grantId,
          parsed.data,
        ),
      };
    } catch (error) {
      return fail(error, reply);
    }
  });

  app.post("/api/oa/delegations/:grantId/revoke", { preHandler }, async (request, reply) => {
    const parsed = revokeOaDelegationRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error.flatten());
    const grantId = asString((request.params as { grantId?: unknown }).grantId);
    const context = getRequestContext(request);
    try {
      const principal = await oaAuthorizationService.authorize(context, "oa.authorization.manage");
      return {
        ok: true,
        ...await oaAdministrationService.revokeDelegation(
          context,
          principal,
          grantId,
          parsed.data,
        ),
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
