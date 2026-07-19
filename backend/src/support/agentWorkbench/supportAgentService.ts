import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type {
  AddSupportAgentSkillGroupRequest, CityCode, CreateSupportAgentRequest,
  CreateSupportSkillGroupRequest, DeleteSupportAgentRequest, DeleteSupportSkillGroupRequest,
  RemoveSupportAgentSkillGroupRequest, RequestContext, SupportAgentListFilters,
  SupportSkillGroupListFilters, UpdateSupportAgentRequest,
  UpdateSupportSkillGroupRequest,
} from "@xlb/types";
import {
  addSupportAgentSkillGroupRequestSchema, createSupportAgentRequestSchema,
  createSupportSkillGroupRequestSchema, deleteSupportAgentRequestSchema,
  deleteSupportSkillGroupRequestSchema, removeSupportAgentSkillGroupRequestSchema,
  supportAgentListFiltersSchema, supportSkillGroupListFiltersSchema,
  updateSupportAgentRequestSchema, updateSupportSkillGroupRequestSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { withTransaction } from "../../dal/transaction.js";
import { canAccessAdminOperation } from "../../auth/operationsAuthorization.js";
import { supportAgentRepository, type SupportAgentRepository } from "./supportAgentRepository.js";

type TransactionRunner = <T>(fn: (connection: PoolConnection) => Promise<T>) => Promise<T>;
type Cursor = { createdAt: string; id: string };

export class SupportAgentValidationError extends Error {}
export class SupportAgentForbiddenError extends Error {}
export class SupportAgentNotFoundError extends Error {}
export class SupportAgentConflictError extends Error {}

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { flatten: () => unknown } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SupportAgentValidationError(JSON.stringify(result.error.flatten()));
  return result.data;
}

function requireCity(context: RequestContext): CityCode {
  let cityCode: CityCode;
  try { cityCode = assertCityScopedContext(context); }
  catch (error) { throw new SupportAgentValidationError(error instanceof Error ? error.message : "invalid city scope"); }
  if (cityCode === "__global__") throw new SupportAgentValidationError("a real city scope is required");
  return cityCode;
}

function requireAdminUser(context: RequestContext): string {
  if (!canAccessAdminOperation(context) || !context.userId) throw new SupportAgentForbiddenError("authenticated Admin or OA headquarters user required");
  return context.userId;
}

function fingerprint(kind: string, value: object): string {
  return createHash("sha256").update(JSON.stringify({ kind, ...value })).digest("hex");
}

function encodeCursor(item: { createdAt: string }, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: item.createdAt, id }), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!parsed.id || typeof parsed.id !== "string" || typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) throw new Error();
    return parsed;
  } catch { throw new SupportAgentValidationError("invalid cursor"); }
}

export class SupportAgentService {
  constructor(private readonly repository: SupportAgentRepository = supportAgentRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction) {}

  private async requireRole(connection: PoolConnection, context: RequestContext, cityCode: CityCode, roles: string[]): Promise<{ userId: string; role: string }> {
    const userId = requireAdminUser(context);
    const current = await this.repository.loadAdminRoleAndExplicitScope(connection, cityCode, userId);
    if (!current || !roles.includes(current.role)) throw new SupportAgentForbiddenError("current database role and explicit target-city scope do not permit this operation");
    return { userId, role: current.role };
  }

  async listAgents(context: RequestContext, query: unknown) {
    const cityCode = requireCity(context);
    const filters = parse<SupportAgentListFilters>(supportAgentListFiltersSchema, query);
    return this.transactionRunner(async (connection) => {
      const actor = await this.requireRole(connection, context, cityCode, ["admin", "operator"]);
      if (actor.role === "operator" && filters.adminUserId && filters.adminUserId !== actor.userId) throw new SupportAgentForbiddenError("operators may only list their own profile");
      const limit = filters.limit ?? 20;
      const rows = await this.repository.listAgents(connection, cityCode, {
        ...filters, adminUserId: actor.role === "operator" ? actor.userId : filters.adminUserId,
        cursor: decodeCursor(filters.cursor), limit: limit + 1,
      });
      const agents = rows.slice(0, limit);
      return { agents, nextCursor: rows.length > limit ? encodeCursor(agents.at(-1)!, agents.at(-1)!.agentId) : null };
    });
  }

  async getAgent(context: RequestContext, agentId: string) {
    const cityCode = requireCity(context);
    return this.transactionRunner(async (connection) => {
      const actor = await this.requireRole(connection, context, cityCode, ["admin", "operator"]);
      const agent = await this.repository.findAgent(connection, cityCode, agentId);
      if (!agent) throw new SupportAgentNotFoundError("support agent was not found");
      if (actor.role === "operator" && agent.adminUserId !== actor.userId) throw new SupportAgentForbiddenError("operators may only read their own profile");
      return { agent };
    });
  }

  async createAgent(context: RequestContext, body: unknown) {
    const cityCode = requireCity(context);
    const input = parse<CreateSupportAgentRequest>(createSupportAgentRequestSchema, body);
    const digest = fingerprint("agent.create", input);
    const attempt = () => this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      const replay = await this.repository.findAgentByCreateKey(connection, cityCode, input.idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== digest) throw new SupportAgentConflictError("idempotency key was used for another agent create");
        return { agent: replay.agent };
      }
      const target = await this.repository.loadAdminRoleAndExplicitScope(connection, cityCode, input.adminUserId);
      if (!target || !["admin", "operator"].includes(target.role)) throw new SupportAgentForbiddenError("target must be a current admin/operator with explicit city scope");
      if (await this.repository.findAgentByAdminUser(connection, cityCode, input.adminUserId)) throw new SupportAgentConflictError("support agent profile already exists");
      const agentId = `sag_${randomUUID().replaceAll("-", "")}`;
      await this.repository.insertAgent(connection, { agentId, cityCode, adminUserId: input.adminUserId,
        displayName: input.displayName, lifecycleStatus: input.lifecycleStatus ?? "active",
        workStatus: input.workStatus ?? "offline", idempotencyKey: input.idempotencyKey, fingerprint: digest });
      return { agent: (await this.repository.findAgent(connection, cityCode, agentId))! };
    });
    try { return await attempt(); }
    catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      return this.transactionRunner(async (connection) => {
        await this.requireRole(connection, context, cityCode, ["admin"]);
        const replay = await this.repository.findAgentByCreateKey(connection, cityCode, input.idempotencyKey);
        if (!replay || replay.fingerprint !== digest) throw new SupportAgentConflictError("support agent identity or idempotency key conflict");
        return { agent: replay.agent };
      });
    }
  }

  private async mutateAgent(context: RequestContext, agentId: string, input: UpdateSupportAgentRequest, kind: string) {
    const cityCode = requireCity(context);
    const digest = fingerprint(kind, input);
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      const state = await this.repository.loadAgentMutationState(connection, cityCode, agentId);
      if (!state) throw new SupportAgentNotFoundError("support agent was not found");
      if (state.lastIdempotencyKey === input.idempotencyKey) {
        if (state.lastFingerprint !== digest) throw new SupportAgentConflictError("idempotency key was used for another agent mutation");
        return { agent: state.agent };
      }
      if (state.agent.version !== input.expectedVersion) throw new SupportAgentConflictError("support agent version conflict");
      const values = { displayName: input.displayName ?? state.agent.displayName,
        lifecycleStatus: input.lifecycleStatus ?? state.agent.lifecycleStatus,
        workStatus: input.workStatus ?? state.agent.workStatus };
      if (values.lifecycleStatus === "active") {
        const target = await this.repository.loadAdminRoleAndExplicitScope(connection, cityCode, state.agent.adminUserId);
        if (!target || !["admin", "operator"].includes(target.role)) throw new SupportAgentForbiddenError("active agent must retain current role and explicit city scope");
      }
      try {
        if (!await this.repository.updateAgentCas(connection, { cityCode, agentId, ...values,
          expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, fingerprint: digest })) {
          throw new SupportAgentConflictError("support agent version conflict");
        }
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw new SupportAgentConflictError("agent mutation idempotency key conflict");
        throw error;
      }
      return { agent: (await this.repository.findAgent(connection, cityCode, agentId))! };
    });
  }

  async updateAgent(context: RequestContext, agentId: string, body: unknown) {
    return this.mutateAgent(context, agentId, parse<UpdateSupportAgentRequest>(updateSupportAgentRequestSchema, body), "agent.update");
  }
  async deleteAgent(context: RequestContext, agentId: string, body: unknown) {
    const input = parse<DeleteSupportAgentRequest>(deleteSupportAgentRequestSchema, body);
    return this.mutateAgent(context, agentId, { ...input, lifecycleStatus: "suspended", workStatus: "offline" }, "agent.delete");
  }

  async listSkillGroups(context: RequestContext, query: unknown) {
    const cityCode = requireCity(context);
    const filters = parse<SupportSkillGroupListFilters>(supportSkillGroupListFiltersSchema, query);
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin", "operator"]);
      const limit = filters.limit ?? 20;
      const rows = await this.repository.listSkillGroups(connection, cityCode, { ...filters, cursor: decodeCursor(filters.cursor), limit: limit + 1 });
      const skillGroups = rows.slice(0, limit);
      return { skillGroups, nextCursor: rows.length > limit ? encodeCursor(skillGroups.at(-1)!, skillGroups.at(-1)!.skillGroupId) : null };
    });
  }

  async getSkillGroup(context: RequestContext, skillGroupId: string) {
    const cityCode = requireCity(context);
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin", "operator"]);
      const skillGroup = await this.repository.findSkillGroup(connection, cityCode, skillGroupId);
      if (!skillGroup) throw new SupportAgentNotFoundError("support skill group was not found");
      return { skillGroup };
    });
  }

  async listMemberships(context: RequestContext, agentId: string) {
    const cityCode = requireCity(context);
    return this.transactionRunner(async (connection) => {
      const actor = await this.requireRole(connection, context, cityCode, ["admin", "operator"]);
      const agent = await this.repository.findAgent(connection, cityCode, agentId);
      if (!agent) throw new SupportAgentNotFoundError("support agent was not found");
      if (actor.role === "operator" && agent.adminUserId !== actor.userId) throw new SupportAgentForbiddenError("operators may only read their own memberships");
      return { memberships: await this.repository.listMemberships(connection, cityCode, agentId) };
    });
  }

  async createSkillGroup(context: RequestContext, body: unknown) {
    const cityCode = requireCity(context);
    const input = parse<CreateSupportSkillGroupRequest>(createSupportSkillGroupRequestSchema, body);
    const digest = fingerprint("group.create", input);
    const attempt = () => this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      const replay = await this.repository.findSkillGroupByCreateKey(connection, cityCode, input.idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== digest) throw new SupportAgentConflictError("idempotency key was used for another skill-group create");
        return { skillGroup: replay.skillGroup };
      }
      const skillGroupId = `sgp_${randomUUID().replaceAll("-", "")}`;
      await this.repository.insertSkillGroup(connection, { skillGroupId, cityCode, name: input.name,
        matchedTypes: input.matchedTypes, matchedLanguages: input.matchedLanguages,
        priorityWeight: input.priorityWeight ?? 0, isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true, idempotencyKey: input.idempotencyKey, fingerprint: digest });
      return { skillGroup: (await this.repository.findSkillGroup(connection, cityCode, skillGroupId))! };
    });
    try { return await attempt(); }
    catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      return this.transactionRunner(async (connection) => {
        await this.requireRole(connection, context, cityCode, ["admin"]);
        const replay = await this.repository.findSkillGroupByCreateKey(connection, cityCode, input.idempotencyKey);
        if (!replay || replay.fingerprint !== digest) throw new SupportAgentConflictError("skill-group name/default/idempotency conflict");
        return { skillGroup: replay.skillGroup };
      });
    }
  }

  private async mutateSkillGroup(context: RequestContext, skillGroupId: string, input: UpdateSupportSkillGroupRequest, kind: string) {
    const cityCode = requireCity(context);
    const digest = fingerprint(kind, input);
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      const state = await this.repository.loadSkillGroupMutationState(connection, cityCode, skillGroupId);
      if (!state) throw new SupportAgentNotFoundError("support skill group was not found");
      if (state.lastIdempotencyKey === input.idempotencyKey) {
        if (state.lastFingerprint !== digest) throw new SupportAgentConflictError("idempotency key was used for another skill-group mutation");
        return { skillGroup: state.skillGroup };
      }
      if (state.skillGroup.version !== input.expectedVersion) throw new SupportAgentConflictError("support skill group version conflict");
      const values = { name: input.name ?? state.skillGroup.name, matchedTypes: input.matchedTypes ?? state.skillGroup.matchedTypes,
        matchedLanguages: input.matchedLanguages ?? state.skillGroup.matchedLanguages,
        priorityWeight: input.priorityWeight ?? state.skillGroup.priorityWeight,
        isDefault: input.isDefault ?? state.skillGroup.isDefault, isActive: input.isActive ?? state.skillGroup.isActive };
      if (values.isDefault && values.matchedLanguages.length) throw new SupportAgentValidationError("default groups must be language neutral");
      try {
        if (!await this.repository.updateSkillGroupCas(connection, { cityCode, skillGroupId, ...values,
          expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey, fingerprint: digest })) {
          throw new SupportAgentConflictError("support skill group version conflict");
        }
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw new SupportAgentConflictError("skill-group name/default/idempotency conflict");
        throw error;
      }
      return { skillGroup: (await this.repository.findSkillGroup(connection, cityCode, skillGroupId))! };
    });
  }

  async updateSkillGroup(context: RequestContext, id: string, body: unknown) {
    return this.mutateSkillGroup(context, id, parse<UpdateSupportSkillGroupRequest>(updateSupportSkillGroupRequestSchema, body), "group.update");
  }
  async deleteSkillGroup(context: RequestContext, id: string, body: unknown) {
    const input = parse<DeleteSupportSkillGroupRequest>(deleteSupportSkillGroupRequestSchema, body);
    return this.mutateSkillGroup(context, id, { ...input, isActive: false, isDefault: false }, "group.delete");
  }

  async addMembership(context: RequestContext, agentId: string, body: unknown) {
    const cityCode = requireCity(context);
    const input = parse<AddSupportAgentSkillGroupRequest>(addSupportAgentSkillGroupRequestSchema, body);
    const digest = fingerprint("membership.add", input);
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      const state = await this.repository.loadAgentMutationState(connection, cityCode, agentId);
      if (!state) throw new SupportAgentNotFoundError("support agent was not found");
      const replay = await this.repository.findMembershipByKey(connection, cityCode, agentId, input.idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== digest) throw new SupportAgentConflictError("idempotency key was used for another membership mutation");
        return { agent: state.agent, membership: replay.membership };
      }
      if (state.agent.version !== input.expectedAgentVersion) throw new SupportAgentConflictError("support agent version conflict");
      const group = await this.repository.findSkillGroup(connection, cityCode, input.skillGroupId, true);
      if (!group || !group.isActive) throw new SupportAgentNotFoundError("active support skill group was not found");
      await this.repository.upsertMembership(connection, { cityCode, agentId, skillGroupId: input.skillGroupId,
        proficiency: input.proficiency ?? 0, isPrimary: input.isPrimary ?? false,
        idempotencyKey: input.idempotencyKey, fingerprint: digest });
      if (!await this.repository.bumpAgentVersionCas(connection, cityCode, agentId, input.expectedAgentVersion)) throw new SupportAgentConflictError("support agent version conflict");
      const membership = (await this.repository.findMembershipByKey(connection, cityCode, agentId, input.idempotencyKey))!.membership;
      return { agent: (await this.repository.findAgent(connection, cityCode, agentId))!, membership };
    });
  }

  async removeMembership(context: RequestContext, agentId: string, skillGroupId: string, body: unknown) {
    const cityCode = requireCity(context);
    const input = parse<RemoveSupportAgentSkillGroupRequest>(removeSupportAgentSkillGroupRequestSchema, body);
    const digest = fingerprint("membership.remove", { ...input, skillGroupId });
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      const state = await this.repository.loadAgentMutationState(connection, cityCode, agentId);
      if (!state) throw new SupportAgentNotFoundError("support agent was not found");
      const replay = await this.repository.findMembershipByKey(connection, cityCode, agentId, input.idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== digest || replay.membership.skillGroupId !== skillGroupId) throw new SupportAgentConflictError("idempotency key was used for another membership mutation");
        return { agent: state.agent, removedSkillGroupId: skillGroupId };
      }
      if (state.agent.version !== input.expectedAgentVersion) throw new SupportAgentConflictError("support agent version conflict");
      if (!await this.repository.deactivateMembership(connection, cityCode, agentId, skillGroupId, input.idempotencyKey, digest)) {
        throw new SupportAgentNotFoundError("active support agent membership was not found");
      }
      if (!await this.repository.bumpAgentVersionCas(connection, cityCode, agentId, input.expectedAgentVersion)) throw new SupportAgentConflictError("support agent version conflict");
      return { agent: (await this.repository.findAgent(connection, cityCode, agentId))!, removedSkillGroupId: skillGroupId };
    });
  }
}

export const supportAgentService = new SupportAgentService();
