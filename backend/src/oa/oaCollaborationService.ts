import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { stableHash } from "@xlb/shared/deterministic/stableHash.js";
import type {
  CityCode,
  CreateOaApprovalRequest,
  CreateOaTaskRequest,
  OaActivityItem,
  OaApprovalActionRequest,
  OaApprovalDecisionRequest,
  OaApprovalRequest,
  OaApprovalStep,
  OaAuditRecord,
  OaPermissionKey,
  OaPrincipal,
  OaTask,
  OaTaskActionRequest,
  RequestContext,
} from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { withTransaction } from "../dal/transaction.js";

export class OaCollaborationError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "OaCollaborationError";
  }
}

type TaskRow = RowDataPacket & {
  task_id: string;
  organization_id: string;
  city_code: CityCode;
  title: string;
  description: string | null;
  priority: OaTask["priority"];
  status: OaTask["status"];
  assignee_membership_id: string | null;
  created_by_membership_id: string;
  due_at: Date | string | null;
  blocked_reason: string | null;
  completed_at: Date | string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

type ApprovalRow = RowDataPacket & {
  approval_request_id: string;
  organization_id: string;
  city_code: CityCode;
  request_type: string;
  title: string;
  description: string | null;
  requested_by_membership_id: string;
  status: OaApprovalRequest["status"];
  current_step_order: number;
  source_domain: string | null;
  source_reference_id: string | null;
  version: number;
  submitted_at: Date | string | null;
  decided_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ApprovalStepRow = RowDataPacket & {
  approval_step_id: string;
  approval_request_id: string;
  step_order: number;
  organization_id: string;
  required_permission: OaPermissionKey;
  status: OaApprovalStep["status"];
  decided_by_membership_id: string | null;
  decided_at: Date | string | null;
  version: number;
};

type ReceiptRow = RowDataPacket & {
  receipt_id: string;
  request_fingerprint: string;
  response_json: unknown;
  http_status: number;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapTask(row: TaskRow): OaTask {
  return {
    taskId: row.task_id,
    organizationId: row.organization_id,
    cityCode: row.city_code,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assigneeMembershipId: row.assignee_membership_id,
    createdByMembershipId: row.created_by_membership_id,
    dueAt: iso(row.due_at),
    blockedReason: row.blocked_reason,
    completedAt: iso(row.completed_at),
    version: row.version,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

function mapStep(row: ApprovalStepRow): OaApprovalStep {
  return {
    approvalStepId: row.approval_step_id,
    approvalRequestId: row.approval_request_id,
    stepOrder: row.step_order,
    organizationId: row.organization_id,
    requiredPermission: row.required_permission,
    status: row.status,
    decidedByMembershipId: row.decided_by_membership_id,
    decidedAt: iso(row.decided_at),
    version: row.version,
  };
}

function mapApproval(row: ApprovalRow, steps?: OaApprovalStep[]): OaApprovalRequest {
  return {
    approvalRequestId: row.approval_request_id,
    organizationId: row.organization_id,
    cityCode: row.city_code,
    requestType: row.request_type,
    title: row.title,
    description: row.description,
    requestedByMembershipId: row.requested_by_membership_id,
    status: row.status,
    currentStepOrder: row.current_step_order,
    sourceDomain: row.source_domain,
    sourceReferenceId: row.source_reference_id,
    version: row.version,
    submittedAt: iso(row.submitted_at),
    decidedAt: iso(row.decided_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    ...(steps ? { steps } : {}),
  };
}

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function duplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error &&
    (error as { code?: string }).code === "ER_DUP_ENTRY");
}

export class OaCollaborationService {
  async assertOrganizationCityScope(
    principal: OaPrincipal,
    organizationId: string,
    cityCode: CityCode,
  ): Promise<void> {
    if (!principal.cityCodes.includes(cityCode)) {
      throw new OaCollaborationError("City is outside the effective OA scope", 403);
    }
    const [rows] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT 1
       FROM oa_organization_closure closure
       JOIN oa_organization_city_assignments assignment
         ON assignment.organization_id = closure.descendant_organization_id
        AND assignment.city_code = ?
        AND assignment.status = 'active'
        AND assignment.valid_from <= CURRENT_TIMESTAMP(3)
        AND (assignment.valid_to IS NULL OR assignment.valid_to > CURRENT_TIMESTAMP(3))
       WHERE closure.ancestor_organization_id = ?
         AND closure.descendant_organization_id = ?
       LIMIT 1`,
      [cityCode, principal.organization.organizationId, organizationId],
    );
    if (rows.length === 0) {
      throw new OaCollaborationError("Organization and city are outside the current OA hierarchy", 403);
    }
  }

  async listTasks(
    principal: OaPrincipal,
    input: { cityCode?: CityCode; status?: OaTask["status"]; assignee?: "me" | "all" } = {},
  ): Promise<OaTask[]> {
    const cities = input.cityCode ? [input.cityCode] : principal.cityCodes;
    if (cities.length === 0) return [];
    const params: unknown[] = [principal.organization.organizationId, ...cities];
    let where = `EXISTS (
      SELECT 1
      FROM oa_organization_closure visible_organization
      WHERE visible_organization.ancestor_organization_id = ?
        AND visible_organization.descendant_organization_id = oa_tasks.organization_id
    ) AND city_code IN (${placeholders(cities)})`;
    if (input.status) {
      where += " AND status = ?";
      params.push(input.status);
    }
    if ((input.assignee ?? "me") === "me") {
      where += " AND (assignee_membership_id = ? OR created_by_membership_id = ?)";
      params.push(principal.membershipId, principal.membershipId);
    }
    const [rows] = await getMysqlPool().query<TaskRow[]>(
      `SELECT * FROM oa_tasks WHERE ${where}
       ORDER BY FIELD(priority, 'urgent', 'high', 'normal', 'low'), due_at IS NULL, due_at, created_at DESC
       LIMIT 200`,
      params,
    );
    return rows.map(mapTask);
  }

  async getTask(principal: OaPrincipal, taskId: string): Promise<OaTask> {
    const [rows] = await getMysqlPool().query<TaskRow[]>(
      `SELECT task.*
       FROM oa_tasks task
       WHERE task.task_id = ?
         AND EXISTS (
           SELECT 1
           FROM oa_organization_closure visible_organization
           WHERE visible_organization.ancestor_organization_id = ?
             AND visible_organization.descendant_organization_id = task.organization_id
         )
       LIMIT 1`,
      [taskId, principal.organization.organizationId],
    );
    const task = rows[0] && mapTask(rows[0]);
    if (!task || !principal.cityCodes.includes(task.cityCode)) {
      throw new OaCollaborationError("OA task not found", 404);
    }
    return task;
  }

  async createTask(
    context: RequestContext,
    principal: OaPrincipal,
    input: CreateOaTaskRequest,
  ): Promise<{ task: OaTask; idempotentReplay: boolean }> {
    await this.assertOrganizationCityScope(principal, input.organizationId, input.cityCode);
    return this.runIdempotent(principal, {
      operation: "oa.task.create",
      cityCode: input.cityCode,
      idempotencyKey: input.idempotencyKey,
      request: input,
      run: async (connection, receiptId) => {
        const taskId = randomUUID();
        if (input.assigneeMembershipId) {
          await this.assertAssignableMembership(
            connection,
            input.assigneeMembershipId,
            input.organizationId,
          );
        }
        await connection.query(
          `INSERT INTO oa_tasks (
             task_id, organization_id, city_code, title, description, priority, status,
             assignee_membership_id, created_by_membership_id, due_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            taskId,
            input.organizationId,
            input.cityCode,
            input.title,
            input.description ?? null,
            input.priority ?? "normal",
            input.assigneeMembershipId ? "claimed" : "open",
            input.assigneeMembershipId ?? null,
            principal.membershipId,
            input.dueAt ? new Date(input.dueAt) : null,
          ],
        );
        if (input.assigneeMembershipId) {
          await connection.query(
            `INSERT INTO oa_task_assignments (
               task_id, membership_id, assignment_type, assigned_by_membership_id
             ) VALUES (?, ?, 'assignee', ?)`,
            [taskId, input.assigneeMembershipId, principal.membershipId],
          );
          await this.insertNotification(connection, {
            recipientMembershipId: input.assigneeMembershipId,
            organizationId: input.organizationId,
            cityCode: input.cityCode,
            notificationType: "task.assigned",
            title: "你有一项新的协同任务",
            body: input.title,
            sourceType: "oa_task",
            sourceId: taskId,
            dedupeKey: `task.assigned:${taskId}:v0`,
            deepLink: `#/tasks?taskId=${encodeURIComponent(taskId)}`,
          });
        }
        await this.insertProcessEvent(connection, {
          organizationId: input.organizationId,
          cityCode: input.cityCode,
          aggregateType: "task",
          aggregateId: taskId,
          eventType: "oa.task.created.v1",
          actorMembershipId: principal.membershipId,
          detail: { reason: input.reason, assigneeMembershipId: input.assigneeMembershipId ?? null },
        });
        const task = await this.loadTaskForUpdate(connection, taskId);
        await this.insertAudit(connection, context, {
          receiptId,
          principal,
          cityCode: input.cityCode,
          permission: "oa.task.manage",
          action: "oa.task.create",
          targetType: "oa_task",
          targetId: taskId,
          reasonCode: "created",
          afterHash: stableHash(task),
        });
        return { task };
      },
      parseReplay: (value) => parseJson<{ task: OaTask }>(value),
    });
  }

  async transitionTask(
    context: RequestContext,
    principal: OaPrincipal,
    taskId: string,
    action: "claim" | "start" | "block" | "complete" | "delegate" | "cancel",
    input: OaTaskActionRequest,
  ): Promise<{ task: OaTask; idempotentReplay: boolean }> {
    const existing = await this.getTask(principal, taskId);
    return this.runIdempotent(principal, {
      operation: `oa.task.${action}`,
      cityCode: existing.cityCode,
      idempotencyKey: input.idempotencyKey,
      request: { taskId, action, ...input },
      run: async (connection, receiptId) => {
        const current = await this.loadTaskForUpdate(connection, taskId);
        if (!principal.cityCodes.includes(current.cityCode)) {
          throw new OaCollaborationError("OA task is outside city scope", 403);
        }
        if (current.version !== input.expectedVersion) {
          throw new OaCollaborationError("OA task version conflict", 409);
        }
        const beforeHash = stableHash(current);
        const next = this.resolveTaskTransition(current, principal, action, input);
        if ((action === "claim" || action === "delegate") && next.assigneeMembershipId) {
          await this.assertAssignableMembership(
            connection,
            next.assigneeMembershipId,
            current.organizationId,
          );
        }
        const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
          `UPDATE oa_tasks
           SET status = ?, assignee_membership_id = ?, blocked_reason = ?,
               completed_at = ?, version = version + 1
           WHERE task_id = ? AND version = ?`,
          [
            next.status,
            next.assigneeMembershipId,
            next.blockedReason,
            next.completedAt ? new Date(next.completedAt) : null,
            taskId,
            input.expectedVersion,
          ],
        );
        if (result.affectedRows !== 1) throw new OaCollaborationError("OA task version conflict", 409);
        if (action === "delegate" && next.assigneeMembershipId) {
          await connection.query(
            `INSERT INTO oa_task_assignments (
               task_id, membership_id, assignment_type, assigned_by_membership_id
             ) VALUES (?, ?, 'assignee', ?)
             ON DUPLICATE KEY UPDATE assignment_type = 'assignee',
               assigned_by_membership_id = VALUES(assigned_by_membership_id)`,
            [taskId, next.assigneeMembershipId, principal.membershipId],
          );
          await this.insertNotification(connection, {
            recipientMembershipId: next.assigneeMembershipId,
            organizationId: current.organizationId,
            cityCode: current.cityCode,
            notificationType: "task.delegated",
            title: "一项协同任务已转交给你",
            body: current.title,
            sourceType: "oa_task",
            sourceId: taskId,
            dedupeKey: `task.delegated:${taskId}:v${current.version + 1}`,
            deepLink: `#/tasks?taskId=${encodeURIComponent(taskId)}`,
          });
        }
        await this.insertProcessEvent(connection, {
          organizationId: current.organizationId,
          cityCode: current.cityCode,
          aggregateType: "task",
          aggregateId: taskId,
          eventType: `oa.task.${action}.v1`,
          actorMembershipId: principal.membershipId,
          detail: { reason: input.reason, from: current.status, to: next.status },
        });
        const task = await this.loadTaskForUpdate(connection, taskId);
        await this.insertAudit(connection, context, {
          receiptId,
          principal,
          cityCode: task.cityCode,
          permission: "oa.task.manage",
          action: `oa.task.${action}`,
          targetType: "oa_task",
          targetId: taskId,
          reasonCode: input.reason,
          beforeHash,
          afterHash: stableHash(task),
        });
        return { task };
      },
      parseReplay: (value) => parseJson<{ task: OaTask }>(value),
    });
  }

  private resolveTaskTransition(
    current: OaTask,
    principal: OaPrincipal,
    action: "claim" | "start" | "block" | "complete" | "delegate" | "cancel",
    input: OaTaskActionRequest,
  ): Pick<OaTask, "status" | "assigneeMembershipId" | "blockedReason" | "completedAt"> {
    const terminal = current.status === "completed" || current.status === "cancelled";
    if (terminal) throw new OaCollaborationError("Terminal OA task cannot transition", 409);
    if (action === "claim") {
      if (current.status !== "open") throw new OaCollaborationError("Only open OA tasks can be claimed", 409);
      return { status: "claimed", assigneeMembershipId: principal.membershipId, blockedReason: null, completedAt: null };
    }
    if (action === "start") {
      if (!["claimed", "blocked"].includes(current.status)) {
        throw new OaCollaborationError("Only claimed or blocked OA tasks can start", 409);
      }
      if (current.assigneeMembershipId !== principal.membershipId) {
        throw new OaCollaborationError("Only the assignee can start this OA task", 403);
      }
      return { status: "in_progress", assigneeMembershipId: current.assigneeMembershipId, blockedReason: null, completedAt: null };
    }
    if (action === "block") {
      if (!["claimed", "in_progress"].includes(current.status) || !input.blockedReason) {
        throw new OaCollaborationError("Blocking requires a claimed/in-progress task and reason", 409);
      }
      if (current.assigneeMembershipId !== principal.membershipId) {
        throw new OaCollaborationError("Only the assignee can block this OA task", 403);
      }
      return { status: "blocked", assigneeMembershipId: current.assigneeMembershipId, blockedReason: input.blockedReason, completedAt: null };
    }
    if (action === "complete") {
      if (current.status !== "in_progress" || current.assigneeMembershipId !== principal.membershipId) {
        throw new OaCollaborationError("Only the active assignee can complete this OA task", 403);
      }
      return { status: "completed", assigneeMembershipId: current.assigneeMembershipId, blockedReason: null, completedAt: new Date().toISOString() };
    }
    if (action === "delegate") {
      if (!input.assigneeMembershipId || input.assigneeMembershipId === current.assigneeMembershipId) {
        throw new OaCollaborationError("Delegation requires a different assignee", 400);
      }
      return { status: "claimed", assigneeMembershipId: input.assigneeMembershipId, blockedReason: null, completedAt: null };
    }
    return { status: "cancelled", assigneeMembershipId: current.assigneeMembershipId, blockedReason: null, completedAt: null };
  }

  async listApprovals(
    principal: OaPrincipal,
    input: { cityCode?: CityCode; status?: OaApprovalRequest["status"]; requestedBy?: "me" | "all" } = {},
  ): Promise<OaApprovalRequest[]> {
    const cities = input.cityCode ? [input.cityCode] : principal.cityCodes;
    if (cities.length === 0) return [];
    const params: unknown[] = [principal.organization.organizationId, ...cities];
    let where = `EXISTS (
      SELECT 1
      FROM oa_organization_closure visible_organization
      WHERE visible_organization.ancestor_organization_id = ?
        AND visible_organization.descendant_organization_id = oa_approval_requests.organization_id
    ) AND city_code IN (${placeholders(cities)})`;
    if (input.status) {
      where += " AND status = ?";
      params.push(input.status);
    }
    if (input.requestedBy === "me") {
      where += " AND requested_by_membership_id = ?";
      params.push(principal.membershipId);
    }
    const [rows] = await getMysqlPool().query<ApprovalRow[]>(
      `SELECT * FROM oa_approval_requests WHERE ${where}
       ORDER BY FIELD(status, 'pending', 'draft', 'approved', 'rejected', 'withdrawn', 'expired'),
                created_at DESC
       LIMIT 200`,
      params,
    );
    return rows.map((row) => mapApproval(row));
  }

  async getApproval(principal: OaPrincipal, approvalRequestId: string): Promise<OaApprovalRequest> {
    const [rows] = await getMysqlPool().query<ApprovalRow[]>(
      `SELECT approval.*
       FROM oa_approval_requests approval
       WHERE approval.approval_request_id = ?
         AND EXISTS (
           SELECT 1
           FROM oa_organization_closure visible_organization
           WHERE visible_organization.ancestor_organization_id = ?
             AND visible_organization.descendant_organization_id = approval.organization_id
         )
       LIMIT 1`,
      [approvalRequestId, principal.organization.organizationId],
    );
    const row = rows[0];
    if (!row || !principal.cityCodes.includes(row.city_code)) {
      throw new OaCollaborationError("OA approval not found", 404);
    }
    const [stepRows] = await getMysqlPool().query<ApprovalStepRow[]>(
      `SELECT * FROM oa_approval_steps WHERE approval_request_id = ? ORDER BY step_order`,
      [approvalRequestId],
    );
    return mapApproval(row, stepRows.map(mapStep));
  }

  async createApproval(
    context: RequestContext,
    principal: OaPrincipal,
    input: CreateOaApprovalRequest,
  ): Promise<{ approval: OaApprovalRequest; idempotentReplay: boolean }> {
    await this.assertOrganizationCityScope(principal, input.organizationId, input.cityCode);
    return this.runIdempotent(principal, {
      operation: "oa.approval.create",
      cityCode: input.cityCode,
      idempotencyKey: input.idempotencyKey,
      request: input,
      run: async (connection, receiptId) => {
        const approvalRequestId = randomUUID();
        const approvalStepId = randomUUID();
        await connection.query(
          `INSERT INTO oa_approval_requests (
             approval_request_id, organization_id, city_code, request_type, title, description,
             requested_by_membership_id, status, current_step_order, source_domain,
             source_reference_id, submitted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?, CURRENT_TIMESTAMP(3))`,
          [
            approvalRequestId,
            input.organizationId,
            input.cityCode,
            input.requestType,
            input.title,
            input.description ?? null,
            principal.membershipId,
            input.sourceDomain ?? null,
            input.sourceReferenceId ?? null,
          ],
        );
        await connection.query(
          `INSERT INTO oa_approval_steps (
             approval_step_id, approval_request_id, step_order, organization_id, required_permission
           ) VALUES (?, ?, 1, ?, ?)`,
          [approvalStepId, approvalRequestId, input.organizationId, input.requiredPermission],
        );
        await this.insertProcessEvent(connection, {
          organizationId: input.organizationId,
          cityCode: input.cityCode,
          aggregateType: "approval",
          aggregateId: approvalRequestId,
          eventType: "oa.approval.submitted.v1",
          actorMembershipId: principal.membershipId,
          detail: {
            reason: input.reason,
            requiredPermission: input.requiredPermission,
            sourceDomain: input.sourceDomain ?? null,
            sourceReferenceId: input.sourceReferenceId ?? null,
          },
        });
        const approval = await this.loadApprovalForUpdate(connection, approvalRequestId);
        const step = await this.loadApprovalStepForUpdate(connection, approvalRequestId, 1);
        const response = { approval: { ...approval, steps: [step] } };
        await this.insertAudit(connection, context, {
          receiptId,
          principal,
          cityCode: input.cityCode,
          permission: "oa.approval.request",
          action: "oa.approval.create",
          targetType: "oa_approval",
          targetId: approvalRequestId,
          reasonCode: input.reason,
          afterHash: stableHash(response.approval),
        });
        return response;
      },
      parseReplay: (value) => parseJson<{ approval: OaApprovalRequest }>(value),
    });
  }

  async decideApproval(
    context: RequestContext,
    principal: OaPrincipal,
    approvalRequestId: string,
    input: OaApprovalDecisionRequest,
  ): Promise<{ approval: OaApprovalRequest; idempotentReplay: boolean }> {
    const existing = await this.getApproval(principal, approvalRequestId);
    return this.runIdempotent(principal, {
      operation: "oa.approval.decide",
      cityCode: existing.cityCode,
      idempotencyKey: input.idempotencyKey,
      request: { approvalRequestId, ...input },
      run: async (connection, receiptId) => {
        const current = await this.loadApprovalForUpdate(connection, approvalRequestId);
        if (!principal.cityCodes.includes(current.cityCode)) {
          throw new OaCollaborationError("OA approval is outside city scope", 403);
        }
        if (current.status !== "pending" || current.version !== input.expectedVersion) {
          throw new OaCollaborationError("OA approval state or version conflict", 409);
        }
        if (current.requestedByMembershipId === principal.membershipId) {
          throw new OaCollaborationError("Approval requester cannot decide their own request", 403);
        }
        const step = await this.loadApprovalStepForUpdate(connection, approvalRequestId, current.currentStepOrder);
        if (!(principal.permissionCityCodes[step.requiredPermission] ?? []).includes(current.cityCode)) {
          throw new OaCollaborationError("Required approval capability is missing", 403);
        }
        const beforeHash = stableHash({ current, step });
        const decisionId = randomUUID();
        await connection.query(
          `INSERT INTO oa_approval_decisions (
             decision_id, approval_request_id, approval_step_id, decision, reason, decided_by_membership_id
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [decisionId, approvalRequestId, step.approvalStepId, input.decision, input.reason, principal.membershipId],
        );
        const stepStatus = input.decision === "approved"
          ? "approved"
          : input.decision === "rejected"
            ? "rejected"
            : "returned";
        await connection.query(
          `UPDATE oa_approval_steps
           SET status = ?, decided_by_membership_id = ?, decided_at = CURRENT_TIMESTAMP(3), version = version + 1
           WHERE approval_step_id = ? AND status = 'pending'`,
          [stepStatus, principal.membershipId, step.approvalStepId],
        );
        const requestStatus = input.decision === "approved"
          ? "approved"
          : input.decision === "rejected"
            ? "rejected"
            : "draft";
        await connection.query(
          `UPDATE oa_approval_requests
           SET status = ?, decided_at = CASE WHEN ? IN ('approved', 'rejected') THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
               version = version + 1
           WHERE approval_request_id = ? AND version = ?`,
          [requestStatus, requestStatus, approvalRequestId, input.expectedVersion],
        );
        await this.insertNotification(connection, {
          recipientMembershipId: current.requestedByMembershipId,
          organizationId: current.organizationId,
          cityCode: current.cityCode,
          notificationType: `approval.${input.decision}`,
          title: `审批结果：${input.decision === "approved" ? "已同意" : input.decision === "rejected" ? "已拒绝" : "已退回"}`,
          body: current.title,
          sourceType: "oa_approval",
          sourceId: approvalRequestId,
          dedupeKey: `approval.${input.decision}:${approvalRequestId}:v${current.version + 1}`,
          deepLink: `#/approvals?approvalRequestId=${encodeURIComponent(approvalRequestId)}`,
        });
        await this.insertProcessEvent(connection, {
          organizationId: current.organizationId,
          cityCode: current.cityCode,
          aggregateType: "approval",
          aggregateId: approvalRequestId,
          eventType: `oa.approval.${input.decision}.v1`,
          actorMembershipId: principal.membershipId,
          detail: { reason: input.reason, decisionId, requiredPermission: step.requiredPermission },
        });
        const approval = await this.loadApprovalForUpdate(connection, approvalRequestId);
        const decidedStep = await this.loadApprovalStepForUpdate(connection, approvalRequestId, approval.currentStepOrder);
        const response = { approval: { ...approval, steps: [decidedStep] } };
        await this.insertAudit(connection, context, {
          receiptId,
          principal,
          cityCode: current.cityCode,
          permission: "oa.approval.decide",
          action: "oa.approval.decide",
          targetType: "oa_approval",
          targetId: approvalRequestId,
          reasonCode: input.reason,
          beforeHash,
          afterHash: stableHash(response.approval),
        });
        return response;
      },
      parseReplay: (value) => parseJson<{ approval: OaApprovalRequest }>(value),
    });
  }

  async transitionApproval(
    context: RequestContext,
    principal: OaPrincipal,
    approvalRequestId: string,
    action: "resubmit" | "withdraw",
    input: OaApprovalActionRequest,
  ): Promise<{ approval: OaApprovalRequest; idempotentReplay: boolean }> {
    const existing = await this.getApproval(principal, approvalRequestId);
    return this.runIdempotent(principal, {
      operation: `oa.approval.${action}`,
      cityCode: existing.cityCode,
      idempotencyKey: input.idempotencyKey,
      request: { approvalRequestId, action, ...input },
      run: async (connection, receiptId) => {
        const current = await this.loadApprovalForUpdate(connection, approvalRequestId);
        if (
          !principal.cityCodes.includes(current.cityCode) ||
          current.requestedByMembershipId !== principal.membershipId
        ) {
          throw new OaCollaborationError("Only the in-scope requester can update this approval", 403);
        }
        if (current.version !== input.expectedVersion) {
          throw new OaCollaborationError("OA approval version conflict", 409);
        }
        const currentStep = await this.loadApprovalStepForUpdate(
          connection,
          approvalRequestId,
          current.currentStepOrder,
        );
        const beforeHash = stableHash({ current, currentStep });
        if (action === "resubmit") {
          if (current.status !== "draft" || currentStep.status !== "returned") {
            throw new OaCollaborationError("Only a returned OA approval can be resubmitted", 409);
          }
          const nextStepOrder = current.currentStepOrder + 1;
          await connection.query(
            `INSERT INTO oa_approval_steps (
               approval_step_id, approval_request_id, step_order, organization_id, required_permission
             ) VALUES (?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              approvalRequestId,
              nextStepOrder,
              currentStep.organizationId,
              currentStep.requiredPermission,
            ],
          );
          await connection.query(
            `UPDATE oa_approval_requests
             SET status = 'pending', current_step_order = ?, submitted_at = CURRENT_TIMESTAMP(3),
                 decided_at = NULL, version = version + 1
             WHERE approval_request_id = ? AND version = ?`,
            [nextStepOrder, approvalRequestId, input.expectedVersion],
          );
        } else {
          if (!["draft", "pending"].includes(current.status)) {
            throw new OaCollaborationError("Only draft or pending OA approvals can be withdrawn", 409);
          }
          await connection.query(
            `UPDATE oa_approval_requests
             SET status = 'withdrawn', decided_at = CURRENT_TIMESTAMP(3), version = version + 1
             WHERE approval_request_id = ? AND version = ?`,
            [approvalRequestId, input.expectedVersion],
          );
          if (currentStep.status === "pending") {
            await connection.query(
              `UPDATE oa_approval_steps
               SET status = 'skipped', version = version + 1
               WHERE approval_step_id = ? AND status = 'pending'`,
              [currentStep.approvalStepId],
            );
          }
        }
        await this.insertProcessEvent(connection, {
          organizationId: current.organizationId,
          cityCode: current.cityCode,
          aggregateType: "approval",
          aggregateId: approvalRequestId,
          eventType: `oa.approval.${action}.v1`,
          actorMembershipId: principal.membershipId,
          detail: { reason: input.reason, from: current.status },
        });
        const approval = await this.loadApprovalForUpdate(connection, approvalRequestId);
        const step = await this.loadApprovalStepForUpdate(
          connection,
          approvalRequestId,
          approval.currentStepOrder,
        );
        const response = { approval: { ...approval, steps: [step] } };
        await this.insertAudit(connection, context, {
          receiptId,
          principal,
          cityCode: current.cityCode,
          permission: "oa.approval.request",
          action: `oa.approval.${action}`,
          targetType: "oa_approval",
          targetId: approvalRequestId,
          reasonCode: input.reason,
          beforeHash,
          afterHash: stableHash(response.approval),
        });
        return response;
      },
      parseReplay: (value) => parseJson<{ approval: OaApprovalRequest }>(value),
    });
  }

  async listActivities(
    principal: OaPrincipal,
    input: { cityCode?: CityCode; limit?: number } = {},
  ): Promise<OaActivityItem[]> {
    const cities = input.cityCode ? [input.cityCode] : principal.cityCodes;
    if (cities.length === 0) return [];
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      activity_id: string;
      source_event_id: string;
      organization_id: string;
      organization_name: string;
      city_code: CityCode;
      source_domain: string;
      event_type: string;
      summary: string;
      occurred_at: Date | string;
      projected_at: Date | string;
      freshness: "live" | "stale" | "disconnected";
    })[]>(
      `SELECT activity.activity_id, activity.source_event_id, activity.organization_id,
              organization.name AS organization_name, activity.city_code,
              activity.source_domain, activity.event_type, activity.summary,
              activity.occurred_at, activity.projected_at,
              CASE
                WHEN projection_cursor.updated_at >= CURRENT_TIMESTAMP(3) - INTERVAL 30 SECOND THEN 'live'
                WHEN projection_cursor.updated_at >= CURRENT_TIMESTAMP(3) - INTERVAL 5 MINUTE THEN 'stale'
                ELSE 'disconnected'
              END AS freshness
       FROM oa_activity_projection activity
       JOIN oa_organizations organization
         ON organization.organization_id = activity.organization_id
       LEFT JOIN oa_activity_projection_cursors projection_cursor
         ON projection_cursor.organization_id = activity.organization_id
        AND projection_cursor.city_code = activity.city_code
       JOIN oa_organization_closure visible_organization
         ON visible_organization.descendant_organization_id = activity.organization_id
        AND visible_organization.ancestor_organization_id = ?
       WHERE activity.city_code IN (${placeholders(cities)})
       ORDER BY activity.occurred_at DESC
       LIMIT ?`,
      [principal.organization.organizationId, ...cities, input.limit ?? 50],
    );
    return rows.map((row) => ({
      activityId: row.activity_id,
      sourceEventId: row.source_event_id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      cityCode: row.city_code,
      sourceDomain: row.source_domain,
      eventType: row.event_type,
      summary: row.summary,
      occurredAt: iso(row.occurred_at)!,
      projectedAt: iso(row.projected_at)!,
      freshness: row.freshness,
    }));
  }

  async listAudit(
    principal: OaPrincipal,
    input: { cityCode?: CityCode; targetType?: string; targetId?: string; limit?: number } = {},
  ): Promise<OaAuditRecord[]> {
    const cities = input.cityCode ? [input.cityCode] : principal.cityCodes;
    if (cities.length === 0) return [];
    const params: unknown[] = [principal.organization.organizationId, ...cities];
    let where = `EXISTS (
      SELECT 1
      FROM oa_organization_closure visible_organization
      WHERE visible_organization.ancestor_organization_id = ?
        AND visible_organization.descendant_organization_id = oa_audit_records.organization_id
    ) AND (
      city_code IN (${placeholders(cities)})
      OR (city_code IS NULL AND organization_id = ?)
    )`;
    params.push(principal.organization.organizationId);
    if (input.targetType) {
      where += " AND target_type = ?";
      params.push(input.targetType);
    }
    if (input.targetId) {
      where += " AND target_id = ?";
      params.push(input.targetId);
    }
    params.push(input.limit ?? 100);
    const [rows] = await getMysqlPool().query<(RowDataPacket & {
      audit_id: string;
      actor_user_id: string | null;
      actor_membership_id: string | null;
      organization_id: string | null;
      city_code: CityCode | null;
      permission_key: OaPermissionKey | null;
      action: string;
      target_type: string;
      target_id: string | null;
      decision: "allowed" | "denied";
      reason_code: string;
      trace_id: string;
      created_at: Date | string;
    })[]>(
      `SELECT audit_id, actor_user_id, actor_membership_id, organization_id, city_code,
              permission_key, action, target_type, target_id, decision, reason_code,
              trace_id, created_at
       FROM oa_audit_records
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      params,
    );
    return rows.map((row) => ({
      auditId: row.audit_id,
      actorUserId: row.actor_user_id,
      actorMembershipId: row.actor_membership_id,
      organizationId: row.organization_id,
      cityCode: row.city_code,
      permissionKey: row.permission_key,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      decision: row.decision,
      reasonCode: row.reason_code,
      traceId: row.trace_id,
      createdAt: iso(row.created_at)!,
    }));
  }

  private async assertAssignableMembership(
    connection: PoolConnection,
    membershipId: string,
    organizationId: string,
  ): Promise<void> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT 1
       FROM oa_memberships
       WHERE membership_id = ?
         AND organization_id = ?
         AND status = 'active'
         AND valid_from <= CURRENT_TIMESTAMP(3)
         AND (valid_to IS NULL OR valid_to > CURRENT_TIMESTAMP(3))
       LIMIT 1`,
      [membershipId, organizationId],
    );
    if (rows.length === 0) {
      throw new OaCollaborationError(
        "OA task assignee must be an active member of the task organization",
        400,
      );
    }
  }

  private async runIdempotent<T>(
    principal: OaPrincipal,
    input: {
      operation: string;
      cityCode: CityCode;
      idempotencyKey: string;
      request: unknown;
      run: (connection: PoolConnection, receiptId: string) => Promise<T>;
      parseReplay: (value: unknown) => T;
    },
  ): Promise<T & { idempotentReplay: boolean }> {
    const keyHash = stableHash(input.idempotencyKey);
    const fingerprint = stableHash(input.request);
    const existing = await this.findReceipt(principal.membershipId, input.operation, keyHash);
    if (existing) {
      if (existing.request_fingerprint !== fingerprint) {
        throw new OaCollaborationError("Idempotency key was used for a different OA request", 409);
      }
      if (existing.http_status === 102) {
        throw new OaCollaborationError("An OA request with this idempotency key is still in progress", 409);
      }
      return { ...input.parseReplay(existing.response_json), idempotentReplay: true };
    }

    try {
      const value = await withTransaction(async (connection) => {
        const receiptId = randomUUID();
        await connection.query(
          `INSERT INTO oa_mutation_receipts (
             receipt_id, membership_id, organization_id, city_code, operation,
             idempotency_key_hash, request_fingerprint, response_json, http_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, JSON_OBJECT('pending', TRUE), 102)`,
          [
            receiptId,
            principal.membershipId,
            principal.organization.organizationId,
            input.cityCode,
            input.operation,
            keyHash,
            fingerprint,
          ],
        );
        const result = await input.run(connection, receiptId);
        await connection.query(
          `UPDATE oa_mutation_receipts SET response_json = ?, http_status = 200 WHERE receipt_id = ?`,
          [JSON.stringify(result), receiptId],
        );
        return result;
      });
      return { ...value, idempotentReplay: false };
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const replay = await this.findReceipt(principal.membershipId, input.operation, keyHash);
      if (!replay || replay.request_fingerprint !== fingerprint || replay.http_status === 102) {
        throw new OaCollaborationError("Concurrent OA idempotency conflict", 409);
      }
      return { ...input.parseReplay(replay.response_json), idempotentReplay: true };
    }
  }

  private async findReceipt(
    membershipId: string,
    operation: string,
    keyHash: string,
  ): Promise<ReceiptRow | null> {
    const [rows] = await getMysqlPool().query<ReceiptRow[]>(
      `SELECT receipt_id, request_fingerprint, response_json, http_status
       FROM oa_mutation_receipts
       WHERE membership_id = ? AND operation = ? AND idempotency_key_hash = ?
       LIMIT 1`,
      [membershipId, operation, keyHash],
    );
    return rows[0] ?? null;
  }

  private async loadTaskForUpdate(connection: PoolConnection, taskId: string): Promise<OaTask> {
    const [rows] = await connection.query<TaskRow[]>(
      `SELECT * FROM oa_tasks WHERE task_id = ? FOR UPDATE`,
      [taskId],
    );
    if (!rows[0]) throw new OaCollaborationError("OA task not found", 404);
    return mapTask(rows[0]);
  }

  private async loadApprovalForUpdate(
    connection: PoolConnection,
    approvalRequestId: string,
  ): Promise<OaApprovalRequest> {
    const [rows] = await connection.query<ApprovalRow[]>(
      `SELECT * FROM oa_approval_requests WHERE approval_request_id = ? FOR UPDATE`,
      [approvalRequestId],
    );
    if (!rows[0]) throw new OaCollaborationError("OA approval not found", 404);
    return mapApproval(rows[0]);
  }

  private async loadApprovalStepForUpdate(
    connection: PoolConnection,
    approvalRequestId: string,
    stepOrder: number,
  ): Promise<OaApprovalStep> {
    const [rows] = await connection.query<ApprovalStepRow[]>(
      `SELECT * FROM oa_approval_steps
       WHERE approval_request_id = ? AND step_order = ?
       FOR UPDATE`,
      [approvalRequestId, stepOrder],
    );
    if (!rows[0]) throw new OaCollaborationError("OA approval step not found", 404);
    return mapStep(rows[0]);
  }

  private async insertProcessEvent(
    connection: PoolConnection,
    input: {
      organizationId: string;
      cityCode: CityCode | null;
      aggregateType: "task" | "approval" | "authorization" | "organization";
      aggregateId: string;
      eventType: string;
      actorMembershipId: string | null;
      detail: Record<string, unknown>;
    },
  ): Promise<string> {
    const eventId = randomUUID();
    await connection.query(
      `INSERT INTO oa_process_events (
         event_id, organization_id, city_code, aggregate_type, aggregate_id,
         event_type, actor_membership_id, detail_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        input.organizationId,
        input.cityCode,
        input.aggregateType,
        input.aggregateId,
        input.eventType,
        input.actorMembershipId,
        JSON.stringify(input.detail),
      ],
    );
    return eventId;
  }

  private async insertAudit(
    connection: PoolConnection,
    context: RequestContext,
    input: {
      receiptId: string;
      principal: OaPrincipal;
      cityCode: CityCode;
      permission: OaPermissionKey;
      action: string;
      targetType: string;
      targetId: string;
      reasonCode: string;
      beforeHash?: string;
      afterHash?: string;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO oa_audit_records (
         audit_id, actor_user_id, actor_membership_id, organization_id, city_code,
         permission_key, action, target_type, target_id, decision, reason_code,
         before_hash, after_hash, trace_id, idempotency_receipt_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'allowed', ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.principal.userId,
        input.principal.membershipId,
        input.principal.organization.organizationId,
        input.cityCode,
        input.permission,
        input.action,
        input.targetType,
        input.targetId,
        input.reasonCode.slice(0, 96),
        input.beforeHash ?? null,
        input.afterHash ?? null,
        context.traceId,
        input.receiptId,
      ],
    );
  }

  private async insertNotification(
    connection: PoolConnection,
    input: {
      recipientMembershipId: string;
      organizationId: string;
      cityCode: CityCode;
      notificationType: string;
      title: string;
      body: string;
      sourceType: string;
      sourceId: string;
      dedupeKey: string;
      deepLink: string;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT IGNORE INTO oa_notifications (
         notification_id, recipient_membership_id, organization_id, city_code,
         notification_type, title, body, source_type, source_id, dedupe_key, deep_link
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        input.recipientMembershipId,
        input.organizationId,
        input.cityCode,
        input.notificationType,
        input.title,
        input.body.slice(0, 500),
        input.sourceType,
        input.sourceId,
        input.dedupeKey,
        input.deepLink,
      ],
    );
  }
}

export const oaCollaborationService = new OaCollaborationService();
