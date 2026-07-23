import { createHash, randomUUID } from "node:crypto";
import type {
  CustomerSduiAuditListEnvelope,
  CustomerSduiKillSwitchEnvelope,
  CustomerSduiKillSwitchReadEnvelope,
  CustomerSduiManifestEnvelope,
  CustomerSduiPageId,
  CustomerSduiPageManifest,
  CustomerSduiRevision,
  CustomerSduiRevisionEnvelope,
  CustomerSduiRevisionListEnvelope,
  CustomerSduiRevisionReadEnvelope,
  CityCode,
  RequestContext,
} from "@xlb/types";
import {
  createCustomerSduiDraftRequestSchema,
  customerSduiKillSwitchStateSchema,
  customerSduiAuditListQuerySchema,
  customerSduiManifestDefinitionSchema,
  customerSduiPageManifestSchema,
  customerSduiRevisionSchema,
  customerSduiRevisionListQuerySchema,
  publishCustomerSduiRevisionRequestSchema,
  reviewCustomerSduiRevisionRequestSchema,
  rollbackCustomerSduiRevisionRequestSchema,
  setCustomerSduiKillSwitchRequestSchema,
  unpublishCustomerSduiRevisionRequestSchema,
  updateCustomerSduiDraftRequestSchema,
} from "@xlb/validators";
import { assertAdminCanAccessCity } from "../dal/adminQueryGuard.js";
import {
  MysqlCustomerSduiRepository,
  type CustomerSduiAuditInput,
  type CustomerSduiRepository,
  type CustomerSduiStore,
} from "./customerSduiRepository.js";

const BUILTIN_FALLBACK = {
  strategy: "last_known_good_then_builtin" as const,
  builtinManifestId: "customer.home.builtin" as const,
  maximumStaleSeconds: 86_400,
};

export class CustomerSduiError extends Error {
  constructor(message: string, readonly statusCode: 400 | 401 | 403 | 404 | 409 | 503) {
    super(message);
    this.name = "CustomerSduiError";
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalize(value)).digest("hex");
}

function opaqueId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function compareVersion(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function stableBucket(seed: string, pageId: string, cityCode: string, userId: string): number {
  const digest = createHash("sha256").update(`${seed}\u0000${pageId}\u0000${cityCode}\u0000${userId}`).digest();
  return digest.readUInt32BE(0) % 10_000;
}

function assertActor(context: RequestContext): { actorId: string; cityCode: CityCode } {
  if (context.appType !== "admin" || !["admin", "operator", "auditor"].includes(context.role)) {
    throw new CustomerSduiError("Customer SDUI control plane requires an authenticated admin application role", 403);
  }
  if (!context.userId || !context.cityCode) {
    throw new CustomerSduiError("Customer SDUI control plane requires server-authenticated actor and city scope", 403);
  }
  return { actorId: context.userId, cityCode: context.cityCode };
}

function assertAuthor(context: RequestContext): { actorId: string; cityCode: CityCode } {
  const actor = assertActor(context);
  if (!(["admin", "operator"] as const).includes(context.role as "admin" | "operator")) {
    throw new CustomerSduiError("Auditors cannot author or mutate Customer SDUI revisions", 403);
  }
  return actor;
}

function assertReviewer(context: RequestContext): { actorId: string; cityCode: CityCode } {
  const actor = assertActor(context);
  if (context.role !== "auditor") {
    throw new CustomerSduiError("Customer SDUI review requires the auditor role", 403);
  }
  return actor;
}

function assertPublisher(context: RequestContext): { actorId: string; cityCode: CityCode } {
  const actor = assertActor(context);
  if (context.role !== "admin") {
    throw new CustomerSduiError("Customer SDUI publication control requires the admin role", 403);
  }
  return actor;
}

function assertCustomer(context: RequestContext): { userId: string; cityCode: string } {
  if (context.appType !== "customer" || context.role !== "customer" || !context.userId || !context.cityCode) {
    throw new CustomerSduiError("Customer manifest resolution requires authenticated customer and city scope", 403);
  }
  return { userId: context.userId, cityCode: context.cityCode };
}

function assertPage(pageId: string): CustomerSduiPageId {
  if (pageId !== "customer.home") throw new CustomerSduiError("Unsupported Customer SDUI page", 404);
  return pageId;
}

function requireRevision(value: CustomerSduiRevision | null): CustomerSduiRevision {
  if (!value) throw new CustomerSduiError("Customer SDUI revision not found in city scope", 404);
  return value;
}

function validateRevision(value: CustomerSduiRevision): CustomerSduiRevision {
  const parsed = customerSduiRevisionSchema.safeParse(value);
  if (!parsed.success) throw new CustomerSduiError("Customer SDUI revision violates the frozen contract", 400);
  return parsed.data;
}

export interface CustomerSduiResolutionInput {
  appVersion: string;
  locale: string;
}

export class CustomerSduiService {
  constructor(
    private readonly repository: CustomerSduiRepository = new MysqlCustomerSduiRepository(),
    private readonly now: () => Date = () => new Date(),
    private readonly assertControlCityAccess: (
      context: RequestContext,
      cityCode: CityCode,
    ) => Promise<void> = assertAdminCanAccessCity,
  ) {}

  private async requireControlCityAccess(context: RequestContext, cityCode: CityCode): Promise<void> {
    try {
      await this.assertControlCityAccess(context, cityCode);
    } catch {
      throw new CustomerSduiError("Customer SDUI control city is outside the actor's authorized scope", 403);
    }
  }

  private audit(
    context: RequestContext,
    input: Omit<CustomerSduiAuditInput, "auditId" | "actorId" | "actorRole" | "traceId" | "createdAt">,
  ): CustomerSduiAuditInput {
    return {
      ...input,
      auditId: opaqueId("sdui_audit"),
      actorId: context.userId!,
      actorRole: context.role,
      traceId: context.traceId,
      createdAt: nowIso(this.now),
    };
  }

  private async replayOrRun<T>(store: CustomerSduiStore, input: {
    cityCode: string; pageId: CustomerSduiPageId; operation: string; actorId: string;
    idempotencyKey: string; request: unknown; parseReplay: (value: unknown) => T; run: () => Promise<T>;
  }): Promise<{ value: T; replay: boolean }> {
    const idempotencyHash = sha256(input.idempotencyKey);
    const fingerprint = sha256(input.request);
    const replay = await store.findReplay({
      cityCode: input.cityCode, pageId: input.pageId, operation: input.operation,
      actorId: input.actorId, idempotencyHash,
    });
    if (replay) {
      if (replay.requestFingerprint !== fingerprint) {
        throw new CustomerSduiError("Idempotency key was already used for a different request", 409);
      }
      return { value: input.parseReplay(replay.response), replay: true };
    }
    const value = await input.run();
    await store.insertReplay({
      mutationId: opaqueId("sdui_mut"), cityCode: input.cityCode, pageId: input.pageId,
      operation: input.operation, actorId: input.actorId, idempotencyHash,
      requestFingerprint: fingerprint, response: value,
    });
    return { value, replay: false };
  }

  async listRevisions(
    context: RequestContext,
    routePageId: string,
    query: unknown,
  ): Promise<CustomerSduiRevisionListEnvelope> {
    const { cityCode } = assertActor(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = customerSduiRevisionListQuerySchema.safeParse(query);
    if (!parsed.success) throw new CustomerSduiError("Invalid Customer SDUI revision list query", 400);
    const result = await this.repository.listRevisions({
      cityCode,
      pageId,
      status: parsed.data.status,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit ?? 50,
    });
    return {
      requestId: randomUUID(),
      pageId,
      revisions: result.items.map(validateRevision),
      nextCursor: result.nextCursor,
    };
  }

  async getRevision(
    context: RequestContext,
    routePageId: string,
    revisionId: string,
  ): Promise<CustomerSduiRevisionReadEnvelope> {
    const { cityCode } = assertActor(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    return {
      requestId: randomUUID(),
      revision: validateRevision(requireRevision(
        await this.repository.getRevision(cityCode, pageId, revisionId),
      )),
    };
  }

  async getKillSwitch(
    context: RequestContext,
    routePageId: string,
  ): Promise<CustomerSduiKillSwitchReadEnvelope> {
    const { cityCode } = assertActor(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    return {
      requestId: randomUUID(),
      pageId,
      killSwitch: await this.repository.getKillSwitch(cityCode, pageId),
    };
  }

  async listAudits(
    context: RequestContext,
    routePageId: string,
    query: unknown,
  ): Promise<CustomerSduiAuditListEnvelope> {
    const { cityCode } = assertActor(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = customerSduiAuditListQuerySchema.safeParse(query);
    if (!parsed.success) throw new CustomerSduiError("Invalid Customer SDUI audit list query", 400);
    const result = await this.repository.listAudits({
      cityCode,
      pageId,
      revisionId: parsed.data.revisionId,
      action: parsed.data.action,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit ?? 50,
    });
    return {
      requestId: randomUUID(),
      pageId,
      audits: result.items,
      nextCursor: result.nextCursor,
    };
  }

  async createDraft(context: RequestContext, routePageId: string, body: unknown): Promise<CustomerSduiRevisionEnvelope> {
    const { actorId, cityCode } = assertAuthor(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = createCustomerSduiDraftRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.definition.pageId !== pageId) throw new CustomerSduiError("Invalid Customer SDUI draft request", 400);
    return this.repository.transaction(async (store) => {
      const result = await this.replayOrRun(store, {
        cityCode, pageId, operation: "create_draft", actorId, idempotencyKey: parsed.data.idempotencyKey,
        request: parsed.data, parseReplay: (value) => validateRevision(value as CustomerSduiRevision),
        run: async () => {
          const timestamp = nowIso(this.now);
          const revision = validateRevision({
            revisionId: opaqueId("sdui_rev"), pageId, version: 1, status: "draft",
            definition: parsed.data.definition, publication: null,
            audit: {
              createdBy: actorId, createdAt: timestamp, updatedBy: actorId, updatedAt: timestamp,
              reviewedBy: null, reviewedAt: null, reviewNote: null, publishedBy: null, publishedAt: null,
              retiredBy: null, retiredAt: null, retirementReason: null,
            },
          });
          const hash = sha256(revision.definition);
          await store.insertRevision(cityCode, revision, hash);
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId: revision.revisionId, action: "create_draft", reason: "draft created",
            expectedVersion: null, actualVersion: revision.version, contentHashSha256: hash,
          }));
          return revision;
        },
      });
      return { requestId: randomUUID(), idempotentReplay: result.replay, revision: result.value };
    });
  }

  async updateDraft(context: RequestContext, routePageId: string, revisionId: string, body: unknown): Promise<CustomerSduiRevisionEnvelope> {
    const { actorId, cityCode } = assertAuthor(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = updateCustomerSduiDraftRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.definition.pageId !== pageId) throw new CustomerSduiError("Invalid Customer SDUI draft update", 400);
    return this.repository.transaction(async (store) => {
      const result = await this.replayOrRun(store, {
        cityCode, pageId, operation: "update_draft", actorId, idempotencyKey: parsed.data.idempotencyKey,
        request: { revisionId, ...parsed.data }, parseReplay: (value) => validateRevision(value as CustomerSduiRevision),
        run: async () => {
          const current = requireRevision(await store.findRevisionForUpdate(cityCode, pageId, revisionId));
          if (current.status !== "draft") throw new CustomerSduiError("Only draft revisions can be updated", 409);
          if (current.version !== parsed.data.expectedVersion) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          const revision = validateRevision({
            ...current, version: current.version + 1, definition: parsed.data.definition,
            audit: { ...current.audit, updatedBy: actorId, updatedAt: nowIso(this.now) },
          });
          const hash = sha256(revision.definition);
          if (!await store.updateRevision(cityCode, revision, hash)) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId, action: "update_draft", reason: "draft updated",
            expectedVersion: parsed.data.expectedVersion, actualVersion: revision.version, contentHashSha256: hash,
          }));
          return revision;
        },
      });
      return { requestId: randomUUID(), idempotentReplay: result.replay, revision: result.value };
    });
  }

  async review(context: RequestContext, routePageId: string, revisionId: string, body: unknown): Promise<CustomerSduiRevisionEnvelope> {
    const { actorId, cityCode } = assertReviewer(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = reviewCustomerSduiRevisionRequestSchema.safeParse(body);
    if (!parsed.success) throw new CustomerSduiError("Invalid Customer SDUI review request", 400);
    return this.repository.transaction(async (store) => {
      const result = await this.replayOrRun(store, {
        cityCode, pageId, operation: "review", actorId, idempotencyKey: parsed.data.idempotencyKey,
        request: { revisionId, ...parsed.data }, parseReplay: (value) => validateRevision(value as CustomerSduiRevision),
        run: async () => {
          const current = requireRevision(await store.findRevisionForUpdate(cityCode, pageId, revisionId));
          if (current.status !== "draft") throw new CustomerSduiError("Only draft revisions can be reviewed", 409);
          if (current.version !== parsed.data.expectedVersion) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          if (current.audit.createdBy === actorId) throw new CustomerSduiError("Revision creator cannot review the same revision", 403);
          customerSduiManifestDefinitionSchema.parse(current.definition);
          const timestamp = nowIso(this.now);
          const revision = validateRevision({
            ...current, status: "reviewed", version: current.version + 1,
            audit: { ...current.audit, updatedBy: actorId, updatedAt: timestamp, reviewedBy: actorId,
              reviewedAt: timestamp, reviewNote: parsed.data.reviewNote },
          });
          const hash = sha256(revision.definition);
          if (!await store.updateRevision(cityCode, revision, hash)) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId, action: "review", reason: parsed.data.reviewNote,
            expectedVersion: parsed.data.expectedVersion, actualVersion: revision.version, contentHashSha256: hash,
          }));
          return revision;
        },
      });
      return { requestId: randomUUID(), idempotentReplay: result.replay, revision: result.value };
    });
  }

  async publish(context: RequestContext, routePageId: string, revisionId: string, body: unknown): Promise<CustomerSduiRevisionEnvelope> {
    const { actorId, cityCode } = assertPublisher(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = publishCustomerSduiRevisionRequestSchema.safeParse(body);
    if (!parsed.success) throw new CustomerSduiError("Invalid Customer SDUI publish request", 400);
    if (parsed.data.scope.cityCodes === null || parsed.data.scope.cityCodes.length !== 1 || parsed.data.scope.cityCodes[0] !== cityCode) {
      throw new CustomerSduiError("Publication city scope must exactly match the authenticated control city", 403);
    }
    if (parsed.data.scope.audienceTags.length > 0) {
      throw new CustomerSduiError("Audience-targeted publication is disabled until an authoritative audience resolver is registered", 400);
    }
    if (Date.parse(parsed.data.effectiveAt) < this.now().getTime()) {
      throw new CustomerSduiError("Publication effectiveAt must not be in the past", 400);
    }
    return this.repository.transaction(async (store) => {
      const result = await this.replayOrRun(store, {
        cityCode, pageId, operation: "publish", actorId, idempotencyKey: parsed.data.idempotencyKey,
        request: { revisionId, ...parsed.data }, parseReplay: (value) => validateRevision(value as CustomerSduiRevision),
        run: async () => {
          const current = requireRevision(await store.findRevisionForUpdate(cityCode, pageId, revisionId));
          if (current.status !== "reviewed") throw new CustomerSduiError("Only reviewed revisions can be published", 409);
          if (current.version !== parsed.data.expectedVersion) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          if (current.audit.createdBy === actorId) throw new CustomerSduiError("Revision creator cannot publish the same revision", 403);
          if (current.audit.reviewedBy === actorId) throw new CustomerSduiError("Reviewer cannot publish the same revision", 403);
          customerSduiManifestDefinitionSchema.parse(current.definition);
          const timestamp = nowIso(this.now);
          const revision = validateRevision({
            ...current, status: "published", version: current.version + 1,
            publication: { scope: parsed.data.scope, rollout: parsed.data.rollout,
              effectiveAt: parsed.data.effectiveAt, expiresAt: parsed.data.expiresAt },
            audit: { ...current.audit, updatedBy: actorId, updatedAt: timestamp,
              publishedBy: actorId, publishedAt: timestamp },
          });
          const manifest = this.toManifest(revision);
          customerSduiPageManifestSchema.parse(manifest);
          const hash = sha256(revision.definition);
          if (!await store.updateRevision(cityCode, revision, hash)) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId, action: "publish", reason: "reviewed revision published",
            expectedVersion: parsed.data.expectedVersion, actualVersion: revision.version, contentHashSha256: hash,
          }));
          return revision;
        },
      });
      return { requestId: randomUUID(), idempotentReplay: result.replay, revision: result.value };
    });
  }

  async unpublish(context: RequestContext, routePageId: string, revisionId: string, body: unknown): Promise<CustomerSduiRevisionEnvelope> {
    const { actorId, cityCode } = assertPublisher(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = unpublishCustomerSduiRevisionRequestSchema.safeParse(body);
    if (!parsed.success) throw new CustomerSduiError("Invalid Customer SDUI unpublish request", 400);
    return this.repository.transaction(async (store) => {
      const result = await this.replayOrRun(store, {
        cityCode, pageId, operation: "unpublish", actorId, idempotencyKey: parsed.data.idempotencyKey,
        request: { revisionId, ...parsed.data }, parseReplay: (value) => validateRevision(value as CustomerSduiRevision),
        run: async () => {
          const current = requireRevision(await store.findRevisionForUpdate(cityCode, pageId, revisionId));
          if (current.status !== "published") throw new CustomerSduiError("Only published revisions can be retired", 409);
          if (current.version !== parsed.data.expectedVersion) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          const timestamp = nowIso(this.now);
          const revision = validateRevision({
            ...current, status: "retired", version: current.version + 1,
            audit: { ...current.audit, updatedBy: actorId, updatedAt: timestamp, retiredBy: actorId,
              retiredAt: timestamp, retirementReason: parsed.data.reason },
          });
          const hash = sha256(revision.definition);
          if (!await store.updateRevision(cityCode, revision, hash)) throw new CustomerSduiError("Customer SDUI revision version conflict", 409);
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId, action: "unpublish", reason: parsed.data.reason,
            expectedVersion: parsed.data.expectedVersion, actualVersion: revision.version, contentHashSha256: hash,
          }));
          return revision;
        },
      });
      return { requestId: randomUUID(), idempotentReplay: result.replay, revision: result.value };
    });
  }

  async rollback(context: RequestContext, routePageId: string, revisionId: string, body: unknown): Promise<CustomerSduiRevisionEnvelope> {
    const { actorId, cityCode } = assertPublisher(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = rollbackCustomerSduiRevisionRequestSchema.safeParse(body);
    if (!parsed.success || parsed.data.targetRevisionId === revisionId) throw new CustomerSduiError("Invalid Customer SDUI rollback request", 400);
    return this.repository.transaction(async (store) => {
      const result = await this.replayOrRun(store, {
        cityCode, pageId, operation: "rollback", actorId, idempotencyKey: parsed.data.idempotencyKey,
        request: { revisionId, ...parsed.data }, parseReplay: (value) => validateRevision(value as CustomerSduiRevision),
        run: async () => {
          const current = requireRevision(await store.findRevisionForUpdate(cityCode, pageId, revisionId));
          if (current.status !== "published" || current.version !== parsed.data.expectedVersion || !current.publication) {
            throw new CustomerSduiError("Rollback source must be the expected published revision", 409);
          }
          const target = requireRevision(await store.findRevisionForUpdate(cityCode, pageId, parsed.data.targetRevisionId));
          if (!["reviewed", "retired"].includes(target.status) ||
              target.audit.createdBy === actorId ||
              target.audit.reviewedBy === actorId) {
            throw new CustomerSduiError(
              "Rollback target must be a reviewed known-good revision approved by independent actors",
              409,
            );
          }
          customerSduiManifestDefinitionSchema.parse(target.definition);
          const timestamp = nowIso(this.now);
          const retired = validateRevision({
            ...current, status: "retired", version: current.version + 1,
            audit: { ...current.audit, updatedBy: actorId, updatedAt: timestamp, retiredBy: actorId,
              retiredAt: timestamp, retirementReason: `rollback: ${parsed.data.reason}` },
          });
          const restoredPublication = {
            ...current.publication,
            effectiveAt: timestamp,
            expiresAt: current.publication.expiresAt !== null && Date.parse(current.publication.expiresAt) > Date.parse(timestamp)
              ? current.publication.expiresAt
              : null,
          };
          const restored = validateRevision({
            ...target, status: "published", version: target.version + 1, publication: restoredPublication,
            audit: {
              ...target.audit,
              updatedBy: actorId,
              updatedAt: timestamp,
              publishedBy: actorId,
              publishedAt: timestamp,
              retiredBy: null,
              retiredAt: null,
              retirementReason: null,
            },
          });
          customerSduiPageManifestSchema.parse(this.toManifest(restored));
          if (!await store.updateRevision(cityCode, retired, sha256(retired.definition)) ||
              !await store.updateRevision(cityCode, restored, sha256(restored.definition))) {
            throw new CustomerSduiError("Customer SDUI rollback version conflict", 409);
          }
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId: retired.revisionId, action: "rollback_source_retired",
            reason: parsed.data.reason, expectedVersion: parsed.data.expectedVersion,
            actualVersion: retired.version, contentHashSha256: sha256(retired.definition),
          }));
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId: restored.revisionId, action: "rollback", reason: parsed.data.reason,
            expectedVersion: target.version, actualVersion: restored.version,
            contentHashSha256: sha256(restored.definition),
          }));
          return restored;
        },
      });
      return { requestId: randomUUID(), idempotentReplay: result.replay, revision: result.value };
    });
  }

  async setKillSwitch(context: RequestContext, routePageId: string, body: unknown): Promise<CustomerSduiKillSwitchEnvelope> {
    const { actorId, cityCode } = assertPublisher(context);
    await this.requireControlCityAccess(context, cityCode);
    const pageId = assertPage(routePageId);
    const parsed = setCustomerSduiKillSwitchRequestSchema.safeParse(body);
    if (!parsed.success) throw new CustomerSduiError("Invalid Customer SDUI kill-switch request", 400);
    return this.repository.transaction(async (store) => {
      const result = await this.replayOrRun(store, {
        cityCode, pageId, operation: "kill_switch", actorId, idempotencyKey: parsed.data.idempotencyKey,
        request: parsed.data,
        parseReplay: (value) => customerSduiKillSwitchStateSchema.parse(value),
        run: async () => {
          const existing = await store.getKillSwitchForUpdate(cityCode, pageId);
          // A missing row is the implicit disabled v1 state. The first mutation is CAS v1 -> v2.
          const actualVersion = existing?.version ?? 1;
          if (actualVersion !== parsed.data.expectedVersion) throw new CustomerSduiError("Customer SDUI kill-switch version conflict", 409);
          const state = customerSduiKillSwitchStateSchema.parse({
            pageId, version: actualVersion + 1, enabled: parsed.data.enabled,
            reason: parsed.data.enabled ? parsed.data.reason : null, updatedBy: actorId, updatedAt: nowIso(this.now),
          });
          if (!await store.upsertKillSwitch(cityCode, state, actualVersion)) throw new CustomerSduiError("Customer SDUI kill-switch version conflict", 409);
          await store.insertAudit(this.audit(context, {
            cityCode, pageId, revisionId: null, action: "kill_switch", reason: parsed.data.reason,
            expectedVersion: parsed.data.expectedVersion, actualVersion: state.version, contentHashSha256: null,
          }));
          return state;
        },
      });
      return { requestId: randomUUID(), idempotentReplay: result.replay, killSwitch: result.value };
    });
  }

  private toManifest(revision: CustomerSduiRevision): CustomerSduiPageManifest {
    if (!revision.publication || !revision.audit.publishedAt) throw new CustomerSduiError("Revision has no publication evidence", 409);
    return {
      ...revision.definition,
      revision: revision.revisionId,
      contentHashSha256: sha256(revision.definition),
      scope: revision.publication.scope,
      rollout: revision.publication.rollout,
      effectiveAt: revision.publication.effectiveAt,
      expiresAt: revision.publication.expiresAt,
      publishedAt: revision.audit.publishedAt,
    };
  }

  async resolveManifest(context: RequestContext, routePageId: string, input: CustomerSduiResolutionInput): Promise<CustomerSduiManifestEnvelope> {
    const { userId, cityCode } = assertCustomer(context);
    const pageId = assertPage(routePageId);
    if (!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(input.appVersion) || !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(input.locale)) {
      throw new CustomerSduiError("Invalid Customer SDUI client version or locale", 400);
    }
    const resolvedAt = nowIso(this.now);
    const scopeProof = sha256({ cityCode, userId, pageId }).slice(0, 32);
    try {
      const killSwitch = await this.repository.getKillSwitch(cityCode, pageId);
      if (killSwitch?.enabled) {
        return { schemaVersion: "1.0", requestId: randomUUID(), pageId, resolvedAt, scopeProof,
          resolutionReason: "kill_switch", killSwitchActive: true, cacheTtlSeconds: 0,
          manifest: null, fallbackPolicy: BUILTIN_FALLBACK };
      }
      const candidates = await this.repository.listPublished(cityCode, pageId, resolvedAt);
      let unsupportedClient = false;
      for (const revision of candidates) {
        if (!revision.publication) continue;
        const { scope, rollout, effectiveAt, expiresAt } = revision.publication;
        if (Date.parse(effectiveAt) > Date.parse(resolvedAt) || (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(resolvedAt))) continue;
        if (scope.cityCodes === null || !scope.cityCodes.includes(cityCode as never) || !scope.locales.includes(input.locale)) continue;
        if (compareVersion(input.appVersion, scope.minimumAppVersion) < 0 ||
            (scope.maximumAppVersion !== null && compareVersion(input.appVersion, scope.maximumAppVersion) > 0)) {
          unsupportedClient = true;
          continue;
        }
        if (scope.audienceTags.length > 0) continue;
        if (stableBucket(rollout.bucketSeed, pageId, cityCode, userId) >= rollout.percentageBasisPoints) continue;
        const manifest = customerSduiPageManifestSchema.parse(this.toManifest(revision));
        return { schemaVersion: "1.0", requestId: randomUUID(), pageId, resolvedAt, scopeProof,
          resolutionReason: "published", killSwitchActive: false, cacheTtlSeconds: 0,
          manifest, fallbackPolicy: manifest.fallbackPolicy };
      }
      return { schemaVersion: "1.0", requestId: randomUUID(), pageId, resolvedAt, scopeProof,
        resolutionReason: unsupportedClient ? "unsupported_client" : "no_eligible_manifest",
        killSwitchActive: false, cacheTtlSeconds: 0, manifest: null, fallbackPolicy: BUILTIN_FALLBACK };
    } catch (error) {
      if (error instanceof CustomerSduiError) throw error;
      return { schemaVersion: "1.0", requestId: randomUUID(), pageId, resolvedAt, scopeProof,
        resolutionReason: "upstream_unavailable", killSwitchActive: false, cacheTtlSeconds: 0,
        manifest: null, fallbackPolicy: BUILTIN_FALLBACK };
    }
  }
}

export const customerSduiService = new CustomerSduiService();
