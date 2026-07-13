import { createHash, randomBytes } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import type {
  CityCode,
  CustomerOrderReviewView,
  RequestContext,
  ReviewAppeal,
  ReviewAppealQueueItem,
  ReviewAppealStatus,
  ReviewAppealSubjectType,
  ReviewModerationQueueItem,
  ReviewVisibility,
  ReviewVisibilityState,
  ReviewVisibilityChangedV1EventPayload,
  WorkerReviewAppealTarget,
} from "@xlb/types";
import {
  createReviewAppealRequestSchema,
  moderateReviewRequestSchema,
  resolveReviewAppealRequestSchema,
  withdrawReviewAppealRequestSchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { generateEventId } from "../events/eventIds.js";
import { EventOutboxRepository, eventOutboxRepository } from "../events/eventOutbox.js";
import {
  ReviewModerationRepository,
  reviewModerationRepository,
} from "./reviewModerationRepository.js";
import {
  decodeReviewQueueCursor,
  encodeReviewQueueCursor,
} from "./reviewQueueCursorPolicy.js";

export class ReviewValidationError extends Error { readonly statusCode = 400; }
export class ReviewForbiddenError extends Error { readonly statusCode = 403; }
export class ReviewNotFoundError extends Error { readonly statusCode = 404; }
export class ReviewStateConflictError extends Error { readonly statusCode = 409; }

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fingerprint(value: unknown): string {
  return digest(JSON.stringify(value));
}

function isIdempotencyStorageRace(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const mysqlError = error as { errno?: number; code?: string };
  return mysqlError.errno === 1062 || mysqlError.errno === 1213
    || mysqlError.code === "ER_DUP_ENTRY" || mysqlError.code === "ER_LOCK_DEADLOCK";
}

function requireIdentity(context: RequestContext): { cityCode: CityCode; userId: string } {
  const cityCode = assertCityScopedContext(context);
  if (!context.userId) throw new ReviewForbiddenError("authenticated identity is required");
  return { cityCode, userId: context.userId };
}

export class ReviewModerationService {
  constructor(
    private readonly repository: ReviewModerationRepository = reviewModerationRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
  ) {}

  private async runIdempotentTransaction<T>(
    operation: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactionRunner(operation);
    } catch (error) {
      if (!isIdempotencyStorageRace(error)) throw error;
      // A concurrent command may win either the unique insert or InnoDB's
      // insert-intention deadlock. Re-run once in a fresh transaction so the
      // committed canonical row is returned or its fingerprint is rejected.
      return this.transactionRunner(operation);
    }
  }

  private async emitVisibilityChanged(
    connection: PoolConnection,
    input: { cityCode: CityCode; reviewId: string; workerId: string; rating: number;
      fromVisibility: ReviewVisibility; toVisibility: "visible" | "hidden";
      moderationVersion: number },
  ): Promise<void> {
    const payload: ReviewVisibilityChangedV1EventPayload = {
      reviewId: input.reviewId,
      workerId: input.workerId,
      rating: input.rating,
      fromVisibility: input.fromVisibility,
      toVisibility: input.toVisibility,
      moderationVersion: input.moderationVersion,
      occurredAt: new Date().toISOString(),
    };
    await this.outbox.insertEvent(connection, {
      eventId: generateEventId(),
      eventType: "review.visibility.changed",
      eventMajorVersion: 1,
      aggregateType: "order_review",
      aggregateId: input.reviewId,
      cityCode: input.cityCode,
      payload: { ...payload },
    });
  }

  async getCustomerOrderReview(
    context: RequestContext,
    orderId: string,
  ): Promise<CustomerOrderReviewView | null> {
    const { cityCode, userId } = requireIdentity(context);
    if (context.appType !== "customer" || context.role !== "customer") {
      throw new ReviewForbiddenError("customer review read requires customer identity");
    }
    return this.repository.getCustomerOrderReview(cityCode, orderId, userId);
  }

  async listWorkerAppealTargets(context: RequestContext): Promise<WorkerReviewAppealTarget[]> {
    const { cityCode, userId } = requireIdentity(context);
    if (context.appType !== "worker" || context.role !== "worker") {
      throw new ReviewForbiddenError("review appeal targets require Worker self identity");
    }
    return this.repository.listWorkerAppealTargets(cityCode, userId);
  }

  async listModeration(
    context: RequestContext,
    input: { visibility?: unknown; limit?: unknown; cursor?: unknown },
  ): Promise<{ items: ReviewModerationQueueItem[]; nextCursor: string | null }> {
    const { cityCode, userId } = requireIdentity(context);
    if (context.appType !== "admin" || !["admin", "operator", "auditor"].includes(context.role)) {
      throw new ReviewForbiddenError("moderation queue requires Admin application identity");
    }
    const allowed: ReviewVisibility[] = ["pending_moderation", "visible", "hidden"];
    const visibility = input.visibility === undefined || input.visibility === ""
      ? null
      : allowed.includes(input.visibility as ReviewVisibility)
        ? input.visibility as ReviewVisibility
        : (() => { throw new ReviewValidationError("invalid visibility filter"); })();
    const rawLimit = typeof input.limit === "string" && /^\d+$/.test(input.limit)
      ? Number(input.limit) : input.limit ?? 50;
    if (!Number.isInteger(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
      throw new ReviewValidationError("limit must be an integer between 1 and 100");
    }
    return this.transactionRunner(async (connection) => {
      const actualRole = await this.repository.requireAdminScope(connection, cityCode, userId);
      if (!actualRole || actualRole !== context.role) {
        throw new ReviewForbiddenError("explicit Admin city scope is required");
      }
      const scope = {
        kind: "moderation" as const,
        cityCode,
        role: actualRole,
        filter: visibility ?? "*",
      };
      const cursor = decodeReviewQueueCursor(input.cursor, scope);
      const rows = await this.repository.listModerationQueue(
        connection, cityCode, visibility, Number(rawLimit) + 1, false, cursor,
      );
      const items = rows.slice(0, Number(rawLimit));
      const last = items.at(-1);
      return {
        items,
        nextCursor: rows.length > Number(rawLimit) && last
          ? encodeReviewQueueCursor(scope, {
              createdAt: last.createdAt,
              entityId: last.reviewId,
            })
          : null,
      };
    });
  }

  async getModerationContent(
    context: RequestContext,
    reviewId: string,
  ): Promise<{ reviewId: string; comment: string }> {
    const { cityCode, userId } = requireIdentity(context);
    if (context.appType !== "admin" || context.role !== "admin") {
      throw new ReviewForbiddenError("review content requires dedicated Admin moderator authority");
    }
    return this.transactionRunner(async (connection) => {
      const actualRole = await this.repository.requireAdminScope(connection, cityCode, userId);
      if (actualRole !== "admin") {
        throw new ReviewForbiddenError("explicit Admin city scope is required");
      }
      const content = await this.repository.findReviewContent(connection, cityCode, reviewId);
      if (!content) throw new ReviewNotFoundError("review content was not found");
      await this.repository.recordModerationDetailAccess(connection, {
        accessAuditId: id("rca"), cityCode, reviewId, actorId: userId,
        traceId: context.traceId ?? null, accessPurpose: "moderation_detail",
      });
      return content;
    });
  }

  async moderate(
    context: RequestContext,
    reviewId: string,
    body: unknown,
  ): Promise<{ visibility: ReviewVisibilityState; idempotent: boolean }> {
    const parsed = moderateReviewRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ReviewValidationError(parsed.error.message);
    const { cityCode, userId } = requireIdentity(context);
    if (context.appType !== "admin" || context.role !== "admin") {
      throw new ReviewForbiddenError("only Admin may mutate review moderation");
    }
    const keyHash = digest(`moderate:${parsed.data.idempotencyKey}`);
    const requestHash = fingerprint({ reviewId, ...parsed.data, idempotencyKey: undefined });
    return this.runIdempotentTransaction(async (connection) => {
      const actualRole = await this.repository.requireAdminScope(connection, cityCode, userId);
      if (actualRole !== "admin") throw new ReviewForbiddenError("explicit Admin city scope is required");
      const locked = await this.repository.lockReviewForModeration(connection, cityCode, reviewId);
      if (!locked) throw new ReviewNotFoundError("review was not found");
      const replay = await this.repository.findModerationByIdempotency(
        connection, cityCode, userId, keyHash,
      );
      if (replay) {
        if (replay.reviewId !== reviewId || replay.fingerprint !== requestHash) {
          throw new ReviewStateConflictError("idempotency key was used for a different moderation request");
        }
        const visibility = await this.repository.findVisibility(connection, cityCode, reviewId, true);
        if (!visibility) throw new ReviewNotFoundError("review visibility was not found");
        return { visibility, idempotent: true };
      }
      if (locked.visibility.moderationVersion > 0 && await this.repository.hasOpenAppeal(
        connection, cityCode, reviewId, locked.visibility.moderationVersion,
      )) throw new ReviewStateConflictError("open appeal must be resolved or withdrawn before moderation");
      if (locked.visibility.version !== parsed.data.expectedVersion) {
        throw new ReviewStateConflictError("review visibility version conflict");
      }
      if (locked.visibility.visibility === parsed.data.decision) {
        throw new ReviewStateConflictError("review visibility decision must change the current state");
      }
      const decisionId = id("rmd");
      const moderationVersion = locked.visibility.moderationVersion + 1;
      await this.repository.insertModerationDecision(connection, {
        decisionId, cityCode, reviewId, moderationVersion,
        decision: parsed.data.decision, reasonCode: parsed.data.reasonCode,
        reason: parsed.data.reason, actorId: userId, idempotencyHash: keyHash,
        fingerprint: requestHash, traceId: context.traceId ?? null,
      });
      if (!await this.repository.updateVisibilityCas(connection, {
        cityCode, reviewId, expectedVersion: parsed.data.expectedVersion,
        visibility: parsed.data.decision, moderationVersion, decisionId,
      })) throw new ReviewStateConflictError("review visibility version conflict");
      await this.emitVisibilityChanged(connection, {
        cityCode, reviewId, workerId: locked.review.workerId, rating: locked.review.rating,
        fromVisibility: locked.visibility.visibility,
        toVisibility: parsed.data.decision, moderationVersion,
      });
      const visibility = await this.repository.findVisibility(connection, cityCode, reviewId, true);
      if (!visibility) throw new ReviewNotFoundError("review visibility was not found");
      return { visibility, idempotent: false };
    });
  }

  async createAppeal(
    context: RequestContext,
    reviewId: string,
    body: unknown,
  ): Promise<{ appeal: ReviewAppeal; idempotent: boolean }> {
    const parsed = createReviewAppealRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ReviewValidationError(parsed.error.message);
    const { cityCode, userId } = requireIdentity(context);
    let subjectType: ReviewAppealSubjectType;
    if (context.appType === "customer" && context.role === "customer") subjectType = "customer";
    else if (context.appType === "worker" && context.role === "worker") subjectType = "worker";
    else throw new ReviewForbiddenError("appeal requires Customer or Worker self identity");
    const keyHash = digest(`appeal:${subjectType}:${parsed.data.idempotencyKey}`);
    const requestHash = fingerprint({ reviewId, ...parsed.data, idempotencyKey: undefined });
    return this.runIdempotentTransaction(async (connection) => {
      const locked = await this.repository.lockAppealableReview(connection, cityCode, reviewId);
      if (!locked) throw new ReviewNotFoundError("review or moderation decision was not found");
      const ownsSubject = subjectType === "customer"
        ? locked.review.customerId === userId
        : locked.review.workerId === userId;
      if (!ownsSubject) throw new ReviewNotFoundError("review or moderation decision was not found");
      const replay = await this.repository.findAppealByIdempotency(connection, {
        cityCode, subjectType, subjectId: userId, idempotencyHash: keyHash,
      });
      if (replay) {
        if (replay.fingerprint !== requestHash || replay.appeal.reviewId !== reviewId) {
          throw new ReviewStateConflictError("idempotency key was used for a different appeal");
        }
        return { appeal: replay.appeal, idempotent: true };
      }
      if (locked.visibility.visibility === "pending_moderation"
        || parsed.data.moderationVersion !== locked.visibility.moderationVersion) {
        throw new ReviewStateConflictError("appeal must target the latest moderation decision");
      }
      if (subjectType === "customer" && locked.visibility.visibility !== "hidden") {
        throw new ReviewStateConflictError("customers may appeal only a hidden moderation decision");
      }
      const existing = await this.repository.findActiveAppeal(connection, {
        cityCode, reviewId, moderationVersion: parsed.data.moderationVersion,
        subjectType, subjectId: userId,
      });
      if (existing) throw new ReviewStateConflictError("an active appeal already exists for this subject and decision");
      const appeal = await this.repository.insertAppeal(connection, {
        appealId: id("rap"), cityCode, reviewId,
        decisionId: locked.visibility.lastDecisionId!,
        moderationVersion: parsed.data.moderationVersion,
        subjectType, subjectId: userId, reason: parsed.data.reason,
        idempotencyHash: keyHash, fingerprint: requestHash,
      });
      return { appeal, idempotent: false };
    });
  }

  async listAppeals(
    context: RequestContext,
    input: { status?: unknown; limit?: unknown; cursor?: unknown },
  ): Promise<{ items: ReviewAppealQueueItem[]; nextCursor: string | null }> {
    const { cityCode, userId } = requireIdentity(context);
    if (context.appType !== "admin" || !["admin", "operator", "auditor"].includes(context.role)) {
      throw new ReviewForbiddenError("appeal queue requires Admin application identity");
    }
    const allowed: ReviewAppealStatus[] = ["open", "upheld", "rejected", "withdrawn"];
    const status = input.status === undefined || input.status === "" ? null
      : allowed.includes(input.status as ReviewAppealStatus)
        ? input.status as ReviewAppealStatus
        : (() => { throw new ReviewValidationError("invalid appeal status filter"); })();
    const rawLimit = typeof input.limit === "string" && /^\d+$/.test(input.limit)
      ? Number(input.limit) : input.limit ?? 50;
    if (!Number.isInteger(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100) {
      throw new ReviewValidationError("limit must be an integer between 1 and 100");
    }
    return this.transactionRunner(async (connection) => {
      const actualRole = await this.repository.requireAdminScope(connection, cityCode, userId);
      if (!actualRole || actualRole !== context.role) {
        throw new ReviewForbiddenError("explicit Admin city scope is required");
      }
      const scope = {
        kind: "appeal" as const,
        cityCode,
        role: actualRole,
        filter: status ?? "*",
      };
      const cursor = decodeReviewQueueCursor(input.cursor, scope);
      const rows = await this.repository.listAppeals(
        connection, cityCode, status, Number(rawLimit) + 1, cursor,
      );
      const appeals = rows.slice(0, Number(rawLimit));
      const canReviewAppealDetails = actualRole === "admin";
      const items = appeals.map((appeal) => ({
        appealId: appeal.appealId,
        reviewId: appeal.reviewId,
        moderationVersion: appeal.moderationVersion,
        subjectType: appeal.subjectType,
        subjectId: canReviewAppealDetails ? appeal.subjectId : null,
        reason: canReviewAppealDetails ? appeal.reason : null,
        status: appeal.status,
        version: appeal.version,
        resolutionReason: canReviewAppealDetails ? appeal.resolutionReason : null,
        openedAt: appeal.openedAt,
        resolvedAt: appeal.resolvedAt,
        resolvedByAdminId: canReviewAppealDetails ? appeal.resolvedByAdminId : null,
        detailsRestricted: !canReviewAppealDetails,
      }));
      const last = appeals.at(-1);
      return {
        items,
        nextCursor: rows.length > Number(rawLimit) && last
          ? encodeReviewQueueCursor(scope, {
              createdAt: last.openedAt,
              entityId: last.appealId,
            })
          : null,
      };
    });
  }

  async withdrawAppeal(
    context: RequestContext,
    reviewId: string,
    body: unknown,
  ): Promise<{ appeal: ReviewAppeal; idempotent: boolean }> {
    const parsed = withdrawReviewAppealRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ReviewValidationError(parsed.error.message);
    const { cityCode, userId } = requireIdentity(context);
    let subjectType: ReviewAppealSubjectType;
    if (context.appType === "customer" && context.role === "customer") subjectType = "customer";
    else if (context.appType === "worker" && context.role === "worker") subjectType = "worker";
    else throw new ReviewForbiddenError("appeal withdrawal requires Customer or Worker self identity");
    const keyHash = digest(`appeal-withdraw:${subjectType}:${parsed.data.idempotencyKey}`);
    const requestHash = fingerprint({ reviewId, moderationVersion: parsed.data.moderationVersion });
    return this.runIdempotentTransaction(async (connection) => {
      const locked = await this.repository.lockAppealableReview(connection, cityCode, reviewId);
      if (!locked) throw new ReviewNotFoundError("review or moderation decision was not found");
      const ownsSubject = subjectType === "customer"
        ? locked.review.customerId === userId
        : locked.review.workerId === userId;
      if (!ownsSubject) throw new ReviewNotFoundError("review or moderation decision was not found");
      const replay = await this.repository.findAppealByWithdrawalIdempotency(connection, {
        cityCode, subjectType, subjectId: userId, idempotencyHash: keyHash,
      });
      if (replay) {
        if (replay.fingerprint !== requestHash || replay.appeal.reviewId !== reviewId
          || replay.appeal.moderationVersion !== parsed.data.moderationVersion) {
          throw new ReviewStateConflictError("idempotency key was used for a different withdrawal");
        }
        return { appeal: replay.appeal, idempotent: true };
      }
      const appeal = await this.repository.findActiveAppeal(connection, {
        cityCode, reviewId, moderationVersion: parsed.data.moderationVersion,
        subjectType, subjectId: userId,
      });
      if (!appeal) throw new ReviewStateConflictError("no active appeal exists for this decision");
      const withdrawn = await this.repository.withdrawAppeal(connection, {
        cityCode, appealId: appeal.appealId, subjectType, subjectId: userId,
        expectedVersion: appeal.version, idempotencyHash: keyHash, fingerprint: requestHash,
      });
      if (!withdrawn) throw new ReviewStateConflictError("appeal withdrawal version conflict");
      const result = await this.repository.findAppealByWithdrawalIdempotency(connection, {
        cityCode, subjectType, subjectId: userId, idempotencyHash: keyHash,
      });
      if (!result) throw new ReviewStateConflictError("withdrawn appeal was not found");
      return { appeal: result.appeal, idempotent: false };
    });
  }

  async resolveAppeal(
    context: RequestContext,
    appealId: string,
    body: unknown,
  ): Promise<{ appeal: ReviewAppeal; idempotent: boolean }> {
    const parsed = resolveReviewAppealRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new ReviewValidationError(parsed.error.message);
    const { cityCode, userId } = requireIdentity(context);
    if (context.appType !== "admin" || context.role !== "admin") {
      throw new ReviewForbiddenError("only Admin may resolve review appeals");
    }
    const keyHash = digest(`appeal-resolve:${parsed.data.idempotencyKey}`);
    const requestHash = fingerprint({ appealId, ...parsed.data, idempotencyKey: undefined });
    return this.runIdempotentTransaction(async (connection) => {
      const actualRole = await this.repository.requireAdminScope(connection, cityCode, userId);
      if (actualRole !== "admin") throw new ReviewForbiddenError("explicit Admin city scope is required");
      const locator = await this.repository.findAppealLocator(connection, cityCode, appealId);
      if (!locator) throw new ReviewNotFoundError("review appeal was not found");
      const reviewState = await this.repository.lockAppealableReview(connection, cityCode, locator.reviewId);
      if (!reviewState) throw new ReviewNotFoundError("review appeal was not found");
      const replay = await this.repository.findResolutionByIdempotency(connection, cityCode, userId, keyHash);
      if (replay) {
        if (replay.appeal.appealId !== appealId || replay.fingerprint !== requestHash) {
          throw new ReviewStateConflictError("idempotency key was used for a different appeal resolution");
        }
        return { appeal: replay.appeal, idempotent: true };
      }
      const locked = await this.repository.findAppealForUpdate(connection, cityCode, appealId);
      if (!locked) throw new ReviewNotFoundError("review appeal was not found");
      if (locked.moderationActorId === userId) {
        throw new ReviewForbiddenError("the original moderator cannot resolve this appeal");
      }
      if (["upheld", "rejected"].includes(locked.appeal.status)) {
        if (locked.appeal.resolvedByAdminId === userId
          && locked.resolutionFingerprint === requestHash
          && locked.resolutionIdempotencyHash === keyHash) {
          return { appeal: locked.appeal, idempotent: true };
        }
        throw new ReviewStateConflictError("appeal is already resolved");
      }
      if (locked.appeal.status !== "open"
        || locked.appeal.version !== parsed.data.expectedVersion) {
        throw new ReviewStateConflictError("appeal version conflict");
      }
      if (parsed.data.resolution === "upheld") {
        if (reviewState.visibility.moderationVersion !== locked.appeal.moderationVersion
          || reviewState.visibility.lastDecisionId !== locked.moderationDecisionId) {
          throw new ReviewStateConflictError("appeal no longer targets the current moderation decision");
        }
        if (await this.repository.hasOpenAppeal(connection, cityCode, locked.appeal.reviewId,
          locked.appeal.moderationVersion, appealId)) {
          throw new ReviewStateConflictError("all open appeals for this moderation decision must be resolved independently");
        }
        const reversedVisibility = reviewState.visibility.visibility === "visible" ? "hidden" : "visible";
        const newModerationVersion = reviewState.visibility.moderationVersion + 1;
        const decisionId = id("rmd");
        await this.repository.insertModerationDecision(connection, {
          decisionId, cityCode, reviewId: locked.appeal.reviewId,
          moderationVersion: newModerationVersion, decision: reversedVisibility,
          reasonCode: "appeal_upheld", reason: parsed.data.reason, actorId: userId,
          idempotencyHash: keyHash, fingerprint: requestHash,
          traceId: context.traceId ?? null,
        });
        if (!await this.repository.updateVisibilityCas(connection, {
          cityCode, reviewId: locked.appeal.reviewId,
          expectedVersion: reviewState.visibility.version,
          visibility: reversedVisibility, moderationVersion: newModerationVersion, decisionId,
        })) throw new ReviewStateConflictError("review visibility version conflict");
        await this.emitVisibilityChanged(connection, {
          cityCode, reviewId: locked.appeal.reviewId, workerId: reviewState.review.workerId,
          rating: reviewState.review.rating, fromVisibility: reviewState.visibility.visibility,
          toVisibility: reversedVisibility, moderationVersion: newModerationVersion,
        });
      }
      if (!await this.repository.resolveAppealCas(connection, {
        cityCode, appealId, expectedVersion: parsed.data.expectedVersion,
        resolution: parsed.data.resolution, reason: parsed.data.reason,
        actorId: userId, idempotencyHash: keyHash, fingerprint: requestHash,
      })) throw new ReviewStateConflictError("appeal version conflict");
      const resolved = await this.repository.findAppealForUpdate(connection, cityCode, appealId);
      if (!resolved) throw new ReviewNotFoundError("review appeal was not found");
      return { appeal: resolved.appeal, idempotent: false };
    });
  }
}

export const reviewModerationService = new ReviewModerationService();
