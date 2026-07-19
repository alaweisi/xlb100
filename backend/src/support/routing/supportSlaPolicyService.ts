import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type {
  CityCode, CreateSupportSlaPolicyRequest, RequestContext, SupportSlaPolicy,
  SupportSlaPolicyListFilters, UpdateSupportSlaPolicyRequest,
} from "@xlb/types";
import {
  createSupportSlaPolicyRequestSchema, supportSlaPolicyListFiltersSchema,
  updateSupportSlaPolicyRequestSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { withTransaction } from "../../dal/transaction.js";
import { canAccessAdminOperation } from "../../auth/operationsAuthorization.js";
import { supportAgentRepository, type SupportAgentRepository } from "../agentWorkbench/supportAgentRepository.js";
import {
  supportSlaPolicyRepository, type SupportSlaPolicyCursor, type SupportSlaPolicyRepository,
} from "./supportSlaPolicyRepository.js";

type TransactionRunner = <T>(fn: (connection: PoolConnection) => Promise<T>) => Promise<T>;

export class SupportSlaPolicyValidationError extends Error {}
export class SupportSlaPolicyForbiddenError extends Error {}
export class SupportSlaPolicyNotFoundError extends Error {}
export class SupportSlaPolicyConflictError extends Error {}

function parse<T>(schema: { safeParse: (value: unknown) =>
  { success: true; data: T } | { success: false; error: { flatten: () => unknown } } }, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SupportSlaPolicyValidationError(JSON.stringify(parsed.error.flatten()));
  return parsed.data;
}

function requireCity(context: RequestContext): CityCode {
  let cityCode: CityCode;
  try { cityCode = assertCityScopedContext(context); }
  catch (error) { throw new SupportSlaPolicyValidationError(error instanceof Error ? error.message : "invalid city scope"); }
  if (cityCode === "__global__") throw new SupportSlaPolicyValidationError("a real city scope is required");
  return cityCode;
}

function requireAdminIdentity(context: RequestContext): string {
  if (!canAccessAdminOperation(context) || !context.userId) {
    throw new SupportSlaPolicyForbiddenError("authenticated Admin or OA headquarters user required");
  }
  return context.userId;
}

function fingerprint(kind: string, value: object): string {
  return createHash("sha256").update(JSON.stringify({ kind, ...value })).digest("hex");
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function encodeCursor(policy: SupportSlaPolicy): string {
  return Buffer.from(JSON.stringify({ createdAt: policy.createdAt, policyId: policy.policyId }), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): SupportSlaPolicyCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as SupportSlaPolicyCursor;
    if (!parsed.policyId || typeof parsed.policyId !== "string"
      || typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) throw new Error();
    return parsed;
  } catch { throw new SupportSlaPolicyValidationError("invalid SLA policy cursor"); }
}

function asDate(value: string | undefined | null, fallback: Date | null): Date | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  return new Date(value);
}

export class SupportSlaPolicyService {
  constructor(
    private readonly repository: SupportSlaPolicyRepository = supportSlaPolicyRepository,
    private readonly agents: SupportAgentRepository = supportAgentRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
  ) {}

  private async requireRole(connection: PoolConnection, context: RequestContext, cityCode: CityCode, roles: string[]): Promise<void> {
    const actor = await this.agents.loadAdminRoleAndExplicitScope(connection, cityCode, requireAdminIdentity(context));
    if (!actor || !roles.includes(actor.role)) {
      throw new SupportSlaPolicyForbiddenError("current database role and explicit target-city scope do not permit this operation");
    }
  }

  private async lockConfiguration(connection: PoolConnection, cityCode: CityCode): Promise<void> {
    if (!await this.repository.lockCity(connection, cityCode)) {
      throw new SupportSlaPolicyNotFoundError("target city was not found");
    }
  }

  async get(context: RequestContext, policyId: string): Promise<{ policy: SupportSlaPolicy }> {
    const cityCode = requireCity(context);
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin", "operator"]);
      const policy = await this.repository.findById(connection, cityCode, policyId);
      if (!policy) throw new SupportSlaPolicyNotFoundError("SLA policy was not found");
      return { policy };
    });
  }

  async list(context: RequestContext, query: unknown): Promise<{ policies: SupportSlaPolicy[]; nextCursor: string | null }> {
    const cityCode = requireCity(context);
    const filters = parse<SupportSlaPolicyListFilters>(supportSlaPolicyListFiltersSchema, query);
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin", "operator"]);
      const limit = filters.limit ?? 20;
      const policies = await this.repository.list(connection, cityCode, {
        ...filters,
        effectiveAt: filters.effectiveAt ? new Date(filters.effectiveAt) : undefined,
        cursor: decodeCursor(filters.cursor),
        limit: limit + 1,
      });
      const page = policies.slice(0, limit);
      return { policies: page, nextCursor: policies.length > limit ? encodeCursor(page.at(-1)!) : null };
    });
  }

  async create(context: RequestContext, body: unknown): Promise<{ policy: SupportSlaPolicy }> {
    const cityCode = requireCity(context);
    const input = parse<CreateSupportSlaPolicyRequest>(createSupportSlaPolicyRequestSchema, body);
    const digest = fingerprint("sla-policy.create", input);
    const attempt = () => this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      await this.lockConfiguration(connection, cityCode);
      const replay = await this.repository.findByCreateKey(connection, cityCode, input.idempotencyKey);
      if (replay) {
        if (replay.fingerprint !== digest) throw new SupportSlaPolicyConflictError("idempotency key was used for another SLA policy operation");
        return { policy: replay.policy };
      }
      const now = await this.repository.databaseNow(connection);
      const effectiveFrom = asDate(input.effectiveFrom, now)!;
      const effectiveTo = asDate(input.effectiveTo, null);
      if (effectiveTo && effectiveTo <= effectiveFrom) throw new SupportSlaPolicyValidationError("effectiveTo must be later than effectiveFrom");
      const active = input.isActive ?? true;
      if (active && input.type === "other" && input.priority === "normal" && effectiveTo) {
        throw new SupportSlaPolicyValidationError("an active city fallback SLA policy must not expire");
      }
      if (active && await this.repository.hasOverlap(connection, {
        cityCode, type: input.type, priority: input.priority, effectiveFrom, effectiveTo,
      })) throw new SupportSlaPolicyConflictError("active SLA policy windows must not overlap");
      const policyId = makeId("slap");
      await this.repository.insert(connection, {
        policyId, policySeriesId: makeId("slas"), revision: 1, supersedesPolicyId: null,
        cityCode, type: input.type, priority: input.priority,
        firstResponseMinutes: input.firstResponseMinutes, resolutionMinutes: input.resolutionMinutes,
        effectiveFrom, effectiveTo, isActive: active, version: 1,
        idempotencyKey: input.idempotencyKey, fingerprint: digest,
      });
      return { policy: (await this.repository.findById(connection, cityCode, policyId))! };
    });
    try { return await attempt(); }
    catch (error) {
      if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
      return this.transactionRunner(async (connection) => {
        await this.requireRole(connection, context, cityCode, ["admin"]);
        const replay = await this.repository.findByCreateKey(connection, cityCode, input.idempotencyKey);
        if (!replay || replay.fingerprint !== digest) throw new SupportSlaPolicyConflictError("SLA policy window or idempotency conflict");
        return { policy: replay.policy };
      });
    }
  }

  async update(context: RequestContext, policyId: string, body: unknown): Promise<{ policy: SupportSlaPolicy }> {
    const cityCode = requireCity(context);
    const input = parse<UpdateSupportSlaPolicyRequest>(updateSupportSlaPolicyRequestSchema, body);
    const digest = fingerprint("sla-policy.update", { policyId, ...input });
    return this.transactionRunner(async (connection) => {
      await this.requireRole(connection, context, cityCode, ["admin"]);
      await this.lockConfiguration(connection, cityCode);
      const current = await this.repository.findById(connection, cityCode, policyId, true);
      if (!current) throw new SupportSlaPolicyNotFoundError("SLA policy was not found");
      const replay = await this.repository.findByMutationKey(
        connection, cityCode, current.policySeriesId, input.idempotencyKey,
      );
      if (replay) {
        if (replay.fingerprint !== digest) throw new SupportSlaPolicyConflictError("idempotency key was used for another SLA policy operation");
        return { policy: replay.policy };
      }
      const latest = await this.repository.findLatestInSeries(connection, cityCode, current.policySeriesId);
      if (!latest || latest.policyId !== current.policyId) throw new SupportSlaPolicyConflictError("only the latest SLA policy revision may be updated");
      if (current.version !== input.expectedVersion) throw new SupportSlaPolicyConflictError("SLA policy version conflict");
      const now = await this.repository.databaseNow(connection);
      const effectiveFrom = asDate(input.effectiveFrom, now)!;
      const effectiveTo = asDate(input.effectiveTo, null);
      if (effectiveFrom <= new Date(current.effectiveFrom)) {
        throw new SupportSlaPolicyValidationError("a new revision must start after the superseded revision");
      }
      if (effectiveTo && effectiveTo <= effectiveFrom) throw new SupportSlaPolicyValidationError("effectiveTo must be later than effectiveFrom");
      const currentEffectiveTo = current.effectiveTo ? new Date(current.effectiveTo) : null;
      if ((!currentEffectiveTo || currentEffectiveTo > effectiveFrom)
        && !await this.repository.closeRevisionCas(connection, {
          cityCode, policyId, expectedVersion: input.expectedVersion, effectiveTo: effectiveFrom,
        })) throw new SupportSlaPolicyConflictError("SLA policy version or effective-window conflict");
      const next = {
        type: current.type,
        priority: current.priority,
        firstResponseMinutes: input.firstResponseMinutes ?? current.firstResponseMinutes,
        resolutionMinutes: input.resolutionMinutes ?? current.resolutionMinutes,
        isActive: input.isActive ?? current.isActive,
      };
      if (next.resolutionMinutes < next.firstResponseMinutes) {
        throw new SupportSlaPolicyValidationError("resolutionMinutes must not be shorter than firstResponseMinutes");
      }
      if (next.isActive && next.type === "other" && next.priority === "normal" && effectiveTo) {
        throw new SupportSlaPolicyValidationError("an active city fallback SLA policy must not expire");
      }
      if (next.isActive && await this.repository.hasOverlap(connection, {
        cityCode, type: next.type, priority: next.priority, effectiveFrom, effectiveTo,
      })) throw new SupportSlaPolicyConflictError("active SLA policy windows must not overlap");
      if (current.type === "other" && current.priority === "normal" && current.isActive
        && !next.isActive) {
        const fallback = await this.repository.findEffective(connection, {
          cityCode, type: "other", priority: "normal", at: effectiveFrom,
        });
        if (!fallback) throw new SupportSlaPolicyConflictError("the city must retain an active fallback SLA policy");
      }
      const nextId = makeId("slap");
      await this.repository.insert(connection, {
        policyId: nextId, policySeriesId: current.policySeriesId, revision: current.revision + 1,
        supersedesPolicyId: current.policyId, cityCode, type: next.type, priority: next.priority,
        firstResponseMinutes: next.firstResponseMinutes, resolutionMinutes: next.resolutionMinutes,
        effectiveFrom, effectiveTo, isActive: next.isActive, version: current.version + 1,
        idempotencyKey: input.idempotencyKey, fingerprint: digest,
      });
      return { policy: (await this.repository.findById(connection, cityCode, nextId))! };
    });
  }
}

export const supportSlaPolicyService = new SupportSlaPolicyService();
