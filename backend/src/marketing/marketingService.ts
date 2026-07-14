import type { PoolConnection } from "mysql2/promise";
import type {
  AcceptMarketingDiscountDecisionRequest,
  CityCode,
  CouponDefinition,
  CouponGrant,
  CouponGrantListQuery,
  CouponRedemption,
  CouponReservation,
  CouponReservationRecoveryResult,
  CreateCouponDefinitionRequest,
  CreateMarketingCampaignRequest,
  CreateMarketingRuleRevisionRequest,
  GrantCouponRequest,
  MarketingAuditRecord,
  MarketingCampaign,
  MarketingDiscountDecision,
  MarketingCompensationGrant,
  MarketingRuleRevision,
  PlatformDeliveryClaim,
  PlatformDeliveryMutationRequest,
  PlatformMarketingCompensationV0CompatibilityProjection,
  PlatformServiceIdentity,
  RecoverExpiredCouponReservationRequest,
  RequestContext,
} from "@xlb/types";
import {
  changeCouponDefinitionStatusRequestSchema,
  changeMarketingCampaignStatusRequestSchema,
  couponGrantListQuerySchema,
  createCouponDefinitionRequestSchema,
  createMarketingCampaignRequestSchema,
  createMarketingRuleRevisionRequestSchema,
  grantCouponRequestSchema,
  issueMarketingDiscountDecisionRequestSchema,
  publishMarketingRuleRevisionRequestSchema,
  reviewMarketingCampaignRequestSchema,
  reviewMarketingRuleRevisionRequestSchema,
  revokeCouponGrantRequestSchema,
  recoverExpiredCouponReservationRequestSchema,
  scheduleMarketingCampaignRequestSchema,
  platformDeliveryMutationRequestSchema,
  platformServiceIdentitySchema,
} from "@xlb/validators";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { withTransaction } from "../dal/transaction.js";
import { eventOutboxRepository, EventOutboxRepository } from "../events/eventOutbox.js";
import { generateEventId } from "../events/eventIds.js";
import {
  platformDeliveryService,
  PlatformDeliveryService,
} from "../events/platformDeliveryService.js";
import {
  marketingRepository,
  MarketingRepository,
  type CompensationSourceEvidence,
  type DecisionEligibility,
} from "./marketingRepository.js";
import {
  MARKETING_DECISION_TTL_MS,
  MARKETING_RESERVATION_TTL_MS,
  assertCampaignTransition,
  assertCouponDefinitionTransition,
  assertRuleRevisionTransition,
  assertSafeMinorAmount,
  assertUtcWindow,
  calculateFixedCouponAmounts,
  decimalStringToMinorExact,
  marketingHash,
  marketingId,
  multiplyMinorExact,
} from "./marketingPolicy.js";
import type { CanonicalPublicPriceQuote } from "../pricing/pricingRepository.js";

export class MarketingValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) { super(message); this.name = "MarketingValidationError"; }
}
export class MarketingAuthorizationError extends Error {
  readonly statusCode = 403;
  constructor(message: string) { super(message); this.name = "MarketingAuthorizationError"; }
}
export class MarketingNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) { super(message); this.name = "MarketingNotFoundError"; }
}
export class MarketingConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) { super(message); this.name = "MarketingConflictError"; }
}

type TransactionRunner = <T>(callback: (connection: PoolConnection) => Promise<T>) => Promise<T>;

function requireAdminRole(
  context: RequestContext,
  roles: readonly string[],
  operation: string,
): { cityCode: CityCode; actorId: string } {
  const cityCode = assertCityScopedContext(context);
  if (context.appType !== "admin" || !roles.includes(context.role) || !context.userId) {
    throw new MarketingAuthorizationError(`${operation} requires an authorized city-scoped Admin identity`);
  }
  return { cityCode, actorId: context.userId };
}

const requireAdminRead = (context: RequestContext) =>
  requireAdminRole(context, ["admin", "operator", "auditor"], "Marketing read");
const requireAdminDraftWrite = (context: RequestContext) =>
  requireAdminRole(context, ["admin", "operator"], "Marketing draft write");
const requireAdminApproval = (context: RequestContext) =>
  requireAdminRole(context, ["admin"], "Marketing approval");

function requireCustomer(context: RequestContext): { cityCode: CityCode; customerId: string } {
  const cityCode = assertCityScopedContext(context);
  if (context.appType !== "customer" || context.role !== "customer" || !context.userId) {
    throw new MarketingAuthorizationError("Marketing customer operation requires an authenticated Customer identity");
  }
  return { cityCode, customerId: context.userId };
}

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { message: string } }): T {
  if (!result.success) throw new MarketingValidationError(result.error.message);
  return result.data;
}

function sameStringSet(left: string[], right: string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function policyConflict(callback: () => void): void {
  try { callback(); } catch (error) {
    throw new MarketingConflictError(error instanceof Error ? error.message : "Marketing policy conflict");
  }
}

function auditRecord(input: {
  cityCode: CityCode; aggregateType: MarketingAuditRecord["aggregateType"]; aggregateId: string;
  action: string; actorId: string; actorRole: string; reason: string; expectedVersion: number | null;
  actualVersion: number; traceId: string; now: Date;
}): MarketingAuditRecord {
  return {
    marketingAuditId: marketingId("maud"), cityCode: input.cityCode,
    aggregateType: input.aggregateType, aggregateId: input.aggregateId, action: input.action,
    actorId: input.actorId, actorRole: input.actorRole, reason: input.reason,
    expectedVersion: input.expectedVersion, actualVersion: input.actualVersion,
    traceId: input.traceId, createdAt: input.now.toISOString(),
  };
}

export type PreparedMarketingOrderAcceptance = {
  request: PrepareMarketingOrderAcceptanceInput;
  decision: MarketingDiscountDecision;
  couponReservationId: string;
  couponRedemptionId: string;
  grantVersion: number;
  reservationExpiresAt: string;
  idempotent: boolean;
  existingReservation: CouponReservation | null;
  existingRedemption: CouponRedemption | null;
  canonicalQuote: CanonicalPublicPriceQuote | null;
};

export type PrepareMarketingOrderAcceptanceInput = AcceptMarketingDiscountDecisionRequest;

export type AcceptedMarketingOrderReplay = {
  acceptedOrderId: string;
  decision: MarketingDiscountDecision;
  reservation: CouponReservation;
  redemption: CouponRedemption;
};

export type MarketingCompensationMaterializationResult = {
  outcome: "granted" | "denied" | "reused" | "not_applicable";
  compensation: MarketingCompensationGrant | null;
  couponGrant: CouponGrant | null;
};

const MARKETING_COMPENSATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MARKETING_DEADLOCK_MAX_ATTEMPTS = 3;

function isMysqlDeadlock(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_LOCK_DEADLOCK" || candidate.errno === 1213;
}

export class MarketingService {
  constructor(
    private readonly repository: MarketingRepository = marketingRepository,
    private readonly transactionRunner: TransactionRunner = withTransaction,
    private readonly now: () => Date = () => new Date(),
    private readonly outboxRepository: EventOutboxRepository = eventOutboxRepository,
    private readonly platformService: PlatformDeliveryService = platformDeliveryService,
  ) {}

  private async transactionWithDeadlockRetry<T>(
    callback: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MARKETING_DEADLOCK_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.transactionRunner(callback);
      } catch (error) {
        if (!isMysqlDeadlock(error)) throw error;
        if (attempt === MARKETING_DEADLOCK_MAX_ATTEMPTS) {
          throw new MarketingConflictError("concurrent Marketing command could not be serialized");
        }
      }
    }
    throw new MarketingConflictError("concurrent Marketing command could not be serialized");
  }

  /**
   * Dormant Phase29 target handler. It can only materialize an already-leased
   * exact-v0 Platform claim. No worker, route, subscriber seed, scheduler,
   * replay, or activation calls this method in Phase29.
   */
  async materializeCompensationClaim(
    identityInput: unknown,
    claim: PlatformDeliveryClaim,
  ): Promise<MarketingCompensationMaterializationResult> {
    const identity = platformServiceIdentitySchema.parse(identityInput) as PlatformServiceIdentity;
    if (claim.eventType !== "order.reverse.applied" && claim.eventType !== "refund.approved") {
      throw new MarketingValidationError(
        "Marketing compensation accepts only cancel-applied or full-refund-approved claims",
      );
    }
    const mutation = platformDeliveryMutationRequestSchema.parse({
      subscriptionId: claim.subscriptionId,
      deliveryId: claim.deliveryId,
      owner: claim.leaseOwner,
      leaseToken: claim.leaseToken,
      expectedRowVersion: claim.rowVersion,
    }) as PlatformDeliveryMutationRequest;
    const projection = await this.platformService.projectClaimForMarketingCompensation(
      identity,
      mutation,
    );
    if (!projection) {
      throw new MarketingAuthorizationError("exact active Marketing compensation claim is unavailable");
    }
    return this.transactionRunner(async (connection) => {
      await this.platformService.revalidateMarketingCompensationProjectionClaim(
        identity,
        mutation,
        projection,
        connection,
      );
      const replay = await this.repository.findCompensationByDeliveryForUpdate(
        connection,
        identity.cityCode,
        projection.deliveryId,
      );
      if (replay) {
        const couponGrant = replay.resultingCouponGrantId
          ? await this.repository.findGrantForUpdate(
            connection,
            identity.cityCode,
            replay.resultingCouponGrantId,
          )
          : null;
        return { outcome: "reused", compensation: replay, couponGrant };
      }
      const source = await this.repository.loadCompensationSourceForUpdate(
        connection,
        identity.cityCode,
        projection.orderId,
      );
      if (!source) {
        return { outcome: "not_applicable", compensation: null, couponGrant: null };
      }
      const triggerReplay = await this.repository.findCompensationByTriggerForUpdate(connection, {
        cityCode: identity.cityCode,
        redemptionId: source.redemption.couponRedemptionId,
        triggerType: projection.triggerType,
        triggerId: projection.triggerId,
      });
      if (triggerReplay) {
        const couponGrant = triggerReplay.resultingCouponGrantId
          ? await this.repository.findGrantForUpdate(
            connection,
            identity.cityCode,
            triggerReplay.resultingCouponGrantId,
          )
          : null;
        return { outcome: "reused", compensation: triggerReplay, couponGrant };
      }

      const denialReason = this.compensationDenialReason(projection, source);
      const now = this.now();
      const compensationId = marketingId("mcomp");
      if (denialReason) {
        await this.repository.insertCompensation(connection, {
          id: compensationId,
          cityCode: identity.cityCode,
          customerId: source.redemption.customerId,
          redemptionId: source.redemption.couponRedemptionId,
          triggerType: projection.triggerType,
          triggerId: projection.triggerId,
          deliveryId: projection.deliveryId,
          eventId: projection.eventId,
          payloadHash: projection.payloadHash,
          status: "denied",
          amountMinor: source.redemption.discountAmountMinor,
          decisionReason: denialReason,
        });
        const denied = await this.repository.findCompensationForUpdate(
          connection,
          identity.cityCode,
          compensationId,
        );
        if (!denied) throw new Error("failed to reload denied Marketing compensation");
        await this.repository.insertAudit(connection, auditRecord({
          cityCode: identity.cityCode,
          aggregateType: "marketing_compensation",
          aggregateId: compensationId,
          action: "marketing_compensation_denied",
          actorId: identity.serviceId,
          actorRole: "platform_service",
          reason: denialReason,
          expectedVersion: null,
          actualVersion: denied.version,
          traceId: projection.deliveryId,
          now,
        }));
        return { outcome: "denied", compensation: denied, couponGrant: null };
      }

      if (!await this.repository.incrementCompensationIssuance(
        connection,
        identity.cityCode,
        source.definition.couponDefinitionId,
        source.definition.version,
      )) {
        const capacityReason = "compensation_capacity_exhausted";
        await this.repository.insertCompensation(connection, {
          id: compensationId,
          cityCode: identity.cityCode,
          customerId: source.redemption.customerId,
          redemptionId: source.redemption.couponRedemptionId,
          triggerType: projection.triggerType,
          triggerId: projection.triggerId,
          deliveryId: projection.deliveryId,
          eventId: projection.eventId,
          payloadHash: projection.payloadHash,
          status: "denied",
          amountMinor: source.redemption.discountAmountMinor,
          decisionReason: capacityReason,
        });
        const denied = await this.repository.findCompensationForUpdate(
          connection,
          identity.cityCode,
          compensationId,
        );
        if (!denied) throw new Error("failed to reload capacity-denied Marketing compensation");
        await this.repository.insertAudit(connection, auditRecord({
          cityCode: identity.cityCode,
          aggregateType: "marketing_compensation",
          aggregateId: compensationId,
          action: "marketing_compensation_denied",
          actorId: identity.serviceId,
          actorRole: "platform_service",
          reason: capacityReason,
          expectedVersion: null,
          actualVersion: denied.version,
          traceId: projection.deliveryId,
          now,
        }));
        return { outcome: "denied", compensation: denied, couponGrant: null };
      }
      await this.repository.insertAudit(connection, auditRecord({
        cityCode: identity.cityCode,
        aggregateType: "coupon_definition",
        aggregateId: source.definition.couponDefinitionId,
        action: "compensation_inventory_consumed",
        actorId: identity.serviceId,
        actorRole: "platform_service",
        reason: projection.triggerType,
        expectedVersion: source.definition.version,
        actualVersion: source.definition.version + 1,
        traceId: projection.deliveryId,
        now,
      }));

      await this.repository.insertCompensation(connection, {
        id: compensationId,
        cityCode: identity.cityCode,
        customerId: source.redemption.customerId,
        redemptionId: source.redemption.couponRedemptionId,
        triggerType: projection.triggerType,
        triggerId: projection.triggerId,
        deliveryId: projection.deliveryId,
        eventId: projection.eventId,
        payloadHash: projection.payloadHash,
        status: "pending",
        amountMinor: source.redemption.discountAmountMinor,
        decisionReason: null,
      });
      const expiresAt = new Date(now.getTime() + MARKETING_COMPENSATION_TTL_MS);
      const couponGrantId = marketingId("cgrant");
      await this.repository.insertGrant(connection, {
        id: couponGrantId,
        cityCode: identity.cityCode,
        definition: source.definition,
        customerId: source.redemption.customerId,
        issuanceReason: projection.triggerType,
        issuanceRef: projection.triggerId,
        expiresAt,
        actorId: identity.serviceId,
        idempotencyHash: marketingHash({ deliveryId: projection.deliveryId }),
        requestFingerprint: marketingHash({
          cityCode: identity.cityCode,
          sourceCouponRedemptionId: source.redemption.couponRedemptionId,
          triggerType: projection.triggerType,
          triggerId: projection.triggerId,
          amountMinor: source.redemption.discountAmountMinor,
          expiresAt: expiresAt.toISOString(),
          couponDefinitionId: source.definition.couponDefinitionId,
          ruleRevisionId: source.ruleRevision.ruleRevisionId,
        }),
      });
      if (!await this.repository.markCompensationGranted(
        connection,
        identity.cityCode,
        compensationId,
        couponGrantId,
        expiresAt,
      )) {
        throw new MarketingConflictError("Marketing compensation CAS conflict");
      }
      const granted = await this.repository.findCompensationForUpdate(
        connection,
        identity.cityCode,
        compensationId,
      );
      const couponGrant = await this.repository.findGrantForUpdate(
        connection,
        identity.cityCode,
        couponGrantId,
      );
      if (!granted || !couponGrant) {
        throw new Error("failed to reload granted Marketing compensation evidence");
      }
      await this.repository.insertAudit(connection, auditRecord({
        cityCode: identity.cityCode,
        aggregateType: "coupon_grant",
        aggregateId: couponGrantId,
        action: "compensating_coupon_granted",
        actorId: identity.serviceId,
        actorRole: "platform_service",
        reason: projection.triggerType,
        expectedVersion: null,
        actualVersion: couponGrant.version,
        traceId: projection.deliveryId,
        now,
      }));
      await this.repository.insertAudit(connection, auditRecord({
        cityCode: identity.cityCode,
        aggregateType: "marketing_compensation",
        aggregateId: compensationId,
        action: "marketing_compensation_granted",
        actorId: identity.serviceId,
        actorRole: "platform_service",
        reason: projection.triggerType,
        expectedVersion: 1,
        actualVersion: granted.version,
        traceId: projection.deliveryId,
        now,
      }));
      return { outcome: "granted", compensation: granted, couponGrant };
    });
  }

  private compensationDenialReason(
    projection: PlatformMarketingCompensationV0CompatibilityProjection,
    source: CompensationSourceEvidence,
  ): string | null {
    if (source.redemption.discountAmountMinor !== source.definition.faceValueMinor) {
      return "source_discount_does_not_match_frozen_coupon_value";
    }
    if (
      source.ruleRevision.status !== "published" ||
      source.campaign.activeRuleRevisionId !== source.ruleRevision.ruleRevisionId
    ) {
      return "source_rule_is_not_published";
    }
    if (!["active", "ended"].includes(source.campaign.status)) {
      return "source_campaign_is_paused_or_revoked";
    }
    if (!["active", "expired"].includes(source.definition.status)) {
      return "source_coupon_definition_is_suspended_or_retired";
    }
    if (projection.triggerType === "order_cancellation") {
      return source.orderStatus === "cancelled" ? null : "cancel_event_order_is_not_cancelled";
    }
    if (
      projection.customerId !== source.redemption.customerId ||
      projection.refundCurrency !== "CNY" ||
      projection.refundAmount === null
    ) {
      return "refund_scope_does_not_match_source_redemption";
    }
    let refundAmountMinor: number;
    let orderTotalMinor: number;
    try {
      refundAmountMinor = decimalStringToMinorExact(String(projection.refundAmount), "refund amount");
      orderTotalMinor = decimalStringToMinorExact(source.orderTotalDecimal, "order total");
    } catch {
      return "refund_money_evidence_is_not_exact_CNY";
    }
    return refundAmountMinor === orderTotalMinor
      ? null
      : "partial_refund_is_not_supported";
  }

  async listCampaigns(context: RequestContext): Promise<MarketingCampaign[]> {
    const { cityCode } = requireAdminRead(context);
    return this.repository.listCampaigns(context, cityCode);
  }

  async createCampaign(context: RequestContext, body: unknown): Promise<MarketingCampaign> {
    const { cityCode, actorId } = requireAdminDraftWrite(context);
    const parsed = parseOrThrow(createMarketingCampaignRequestSchema.safeParse(body)) as CreateMarketingCampaignRequest;
    const idempotencyHash = marketingHash(parsed.idempotencyKey);
    const requestFingerprint = marketingHash({ cityCode, actorId, ...parsed, idempotencyKey: undefined });
    return this.transactionRunner(async (connection) => {
      const replay = await this.repository.findCampaignCreateReplay(connection, cityCode, actorId, idempotencyHash);
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) throw new MarketingConflictError("campaign idempotency key conflicts with another request");
        return replay;
      }
      const id = marketingId("mcamp");
      await this.repository.insertCampaign(connection, {
        id, cityCode, name: parsed.name, startAt: new Date(parsed.startAt), endAt: new Date(parsed.endAt),
        actorId, idempotencyHash, requestFingerprint,
      });
      const campaign = await this.repository.findCampaignForUpdate(connection, cityCode, id);
      if (!campaign) throw new Error("failed to load created Marketing campaign");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "marketing_campaign", aggregateId: id, action: "campaign_created",
        actorId, actorRole: context.role, reason: "create", expectedVersion: null,
        actualVersion: campaign.version, traceId: context.traceId, now: this.now(),
      }));
      return campaign;
    });
  }

  async reviewCampaign(context: RequestContext, campaignId: string, body: unknown): Promise<MarketingCampaign> {
    const { cityCode, actorId } = requireAdminApproval(context);
    const parsed = parseOrThrow(reviewMarketingCampaignRequestSchema.safeParse(body));
    return this.transactionRunner(async (connection) => {
      const current = await this.repository.findCampaignForUpdate(connection, cityCode, campaignId);
      if (!current) throw new MarketingNotFoundError("Marketing campaign not found");
      if (current.version !== parsed.expectedVersion) throw new MarketingConflictError("stale Marketing campaign version");
      policyConflict(() => assertCampaignTransition(current.status, "reviewed"));
      if (!await this.repository.updateCampaignState(connection, {
        cityCode, id: campaignId, currentVersion: current.version, status: "reviewed", actorId,
      })) throw new MarketingConflictError("Marketing campaign review CAS conflict");
      const updated = await this.repository.findCampaignForUpdate(connection, cityCode, campaignId);
      if (!updated) throw new Error("failed to reload reviewed Marketing campaign");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "marketing_campaign", aggregateId: campaignId,
        action: "campaign_reviewed", actorId, actorRole: context.role, reason: parsed.reason,
        expectedVersion: parsed.expectedVersion, actualVersion: updated.version,
        traceId: context.traceId, now: this.now(),
      }));
      return updated;
    });
  }

  async scheduleCampaign(context: RequestContext, campaignId: string, body: unknown): Promise<MarketingCampaign> {
    const { cityCode, actorId } = requireAdminApproval(context);
    const parsed = parseOrThrow(scheduleMarketingCampaignRequestSchema.safeParse(body));
    return this.transactionRunner(async (connection) => {
      const campaign = await this.repository.findCampaignForUpdate(connection, cityCode, campaignId);
      if (!campaign) throw new MarketingNotFoundError("Marketing campaign not found");
      if (campaign.version !== parsed.expectedVersion) throw new MarketingConflictError("stale Marketing campaign version");
      policyConflict(() => assertCampaignTransition(campaign.status, "scheduled"));
      const rule = await this.repository.findRuleForUpdate(connection, cityCode, parsed.ruleRevisionId);
      if (!rule || rule.marketingCampaignId !== campaignId || rule.status !== "published") {
        throw new MarketingConflictError("campaign scheduling requires its own published rule revision");
      }
      if (!await this.repository.updateCampaignState(connection, {
        cityCode, id: campaignId, currentVersion: campaign.version, status: "scheduled",
        activeRuleRevisionId: rule.ruleRevisionId,
      })) throw new MarketingConflictError("Marketing campaign schedule CAS conflict");
      const updated = await this.repository.findCampaignForUpdate(connection, cityCode, campaignId);
      if (!updated) throw new Error("failed to reload scheduled Marketing campaign");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "marketing_campaign", aggregateId: campaignId,
        action: "campaign_scheduled", actorId, actorRole: context.role, reason: parsed.reason,
        expectedVersion: parsed.expectedVersion, actualVersion: updated.version,
        traceId: context.traceId, now: this.now(),
      }));
      return updated;
    });
  }

  async changeCampaignStatus(context: RequestContext, campaignId: string, body: unknown): Promise<MarketingCampaign> {
    const { cityCode, actorId } = requireAdminApproval(context);
    const parsed = parseOrThrow(changeMarketingCampaignStatusRequestSchema.safeParse(body));
    return this.transactionRunner(async (connection) => {
      const campaign = await this.repository.findCampaignForUpdate(connection, cityCode, campaignId);
      if (!campaign) throw new MarketingNotFoundError("Marketing campaign not found");
      if (campaign.version !== parsed.expectedVersion) throw new MarketingConflictError("stale Marketing campaign version");
      policyConflict(() => assertCampaignTransition(campaign.status, parsed.status));
      if (parsed.status === "active") {
        if (!campaign.activeRuleRevisionId) throw new MarketingConflictError("active campaign requires a published rule revision");
        policyConflict(() => assertUtcWindow(this.now(), new Date(campaign.startAt), new Date(campaign.endAt), "Marketing campaign"));
      }
      if (!await this.repository.updateCampaignState(connection, {
        cityCode, id: campaignId, currentVersion: campaign.version, status: parsed.status,
      })) throw new MarketingConflictError("Marketing campaign status CAS conflict");
      const updated = await this.repository.findCampaignForUpdate(connection, cityCode, campaignId);
      if (!updated) throw new Error("failed to reload Marketing campaign");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "marketing_campaign", aggregateId: campaignId,
        action: `campaign_${parsed.status}`, actorId, actorRole: context.role, reason: parsed.reason,
        expectedVersion: parsed.expectedVersion, actualVersion: updated.version,
        traceId: context.traceId, now: this.now(),
      }));
      return updated;
    });
  }

  async listRuleRevisions(context: RequestContext, campaignId: string): Promise<MarketingRuleRevision[]> {
    const { cityCode } = requireAdminRead(context);
    return this.repository.listRuleRevisions(context, cityCode, campaignId);
  }

  async createRuleRevision(context: RequestContext, campaignId: string, body: unknown): Promise<MarketingRuleRevision> {
    const { cityCode, actorId } = requireAdminDraftWrite(context);
    const parsed = parseOrThrow(createMarketingRuleRevisionRequestSchema.safeParse(body)) as CreateMarketingRuleRevisionRequest;
    const allowedSkuIds = [...parsed.allowedSkuIds].sort();
    const idempotencyHash = marketingHash(parsed.idempotencyKey);
    const requestFingerprint = marketingHash({ cityCode, campaignId, allowedSkuIds });
    return this.transactionRunner(async (connection) => {
      const campaign = await this.repository.findCampaignForUpdate(connection, cityCode, campaignId);
      if (!campaign) throw new MarketingNotFoundError("Marketing campaign not found");
      if (!["draft", "reviewed"].includes(campaign.status)) {
        throw new MarketingConflictError("new rule revision requires a draft or reviewed campaign");
      }
      const replay = await this.repository.findRuleCreateReplay(connection, cityCode, campaignId, idempotencyHash);
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) throw new MarketingConflictError("rule revision idempotency key conflicts with another request");
        return replay.rule;
      }
      if (await this.repository.countEnabledSkus(connection, cityCode, allowedSkuIds) !== allowedSkuIds.length) {
        throw new MarketingConflictError("rule revision contains a missing, disabled, or cross-city SKU");
      }
      const revision = await this.repository.nextRuleRevision(connection, cityCode, campaignId);
      const id = marketingId("mrule");
      const contentHash = marketingHash({ cityCode, campaignId, revision, allowedSkuIds });
      await this.repository.insertRuleRevision(connection, {
        id, cityCode, campaignId, revision, allowedSkuIds, contentHash,
        actorId, idempotencyHash, requestFingerprint,
      });
      const rule = await this.repository.findRuleForUpdate(connection, cityCode, id);
      if (!rule) throw new Error("failed to load created Marketing rule revision");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "marketing_rule_revision", aggregateId: id,
        action: "rule_revision_created", actorId, actorRole: context.role, reason: "create",
        expectedVersion: null, actualVersion: rule.version, traceId: context.traceId, now: this.now(),
      }));
      return rule;
    });
  }

  async reviewRuleRevision(context: RequestContext, ruleRevisionId: string, body: unknown): Promise<MarketingRuleRevision> {
    requireAdminApproval(context);
    const parsed = parseOrThrow(reviewMarketingRuleRevisionRequestSchema.safeParse(body));
    return this.changeRuleRevisionState(context, ruleRevisionId, "reviewed", parsed.expectedVersion, parsed.reason);
  }

  async publishRuleRevision(context: RequestContext, ruleRevisionId: string, body: unknown): Promise<MarketingRuleRevision> {
    requireAdminApproval(context);
    const parsed = parseOrThrow(publishMarketingRuleRevisionRequestSchema.safeParse(body));
    return this.changeRuleRevisionState(context, ruleRevisionId, "published", parsed.expectedVersion, parsed.reason);
  }

  private async changeRuleRevisionState(
    context: RequestContext, id: string, target: "reviewed" | "published", expectedVersion: number, reason: string,
  ): Promise<MarketingRuleRevision> {
    const { cityCode, actorId } = requireAdminApproval(context);
    return this.transactionRunner(async (connection) => {
      const current = await this.repository.findRuleForUpdate(connection, cityCode, id);
      if (!current) throw new MarketingNotFoundError("Marketing rule revision not found");
      if (current.version !== expectedVersion) throw new MarketingConflictError("stale Marketing rule revision version");
      policyConflict(() => assertRuleRevisionTransition(current.status, target));
      if ((target === "reviewed" && actorId === current.createdBy)
        || (target === "published" && actorId === current.reviewedBy)) {
        throw new MarketingConflictError("rule revision review and publication require distinct Admin actors");
      }
      if (!await this.repository.updateRuleState(connection, {
        cityCode, id, version: current.version, status: target, actorId,
      })) throw new MarketingConflictError("Marketing rule revision CAS conflict");
      const updated = await this.repository.findRuleForUpdate(connection, cityCode, id);
      if (!updated) throw new Error("failed to reload Marketing rule revision");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "marketing_rule_revision", aggregateId: id,
        action: `rule_revision_${target}`, actorId, actorRole: context.role, reason,
        expectedVersion, actualVersion: updated.version, traceId: context.traceId, now: this.now(),
      }));
      return updated;
    });
  }

  async listDefinitions(context: RequestContext): Promise<CouponDefinition[]> {
    const { cityCode } = requireAdminRead(context);
    return this.repository.listDefinitions(context, cityCode);
  }

  async createDefinition(context: RequestContext, body: unknown): Promise<CouponDefinition> {
    const { cityCode, actorId } = requireAdminDraftWrite(context);
    const parsed = parseOrThrow(createCouponDefinitionRequestSchema.safeParse(body)) as CreateCouponDefinitionRequest;
    const idempotencyHash = marketingHash(parsed.idempotencyKey);
    const requestFingerprint = marketingHash({ cityCode, actorId, ...parsed, idempotencyKey: undefined });
    return this.transactionRunner(async (connection) => {
      const replay = await this.repository.findDefinitionCreateReplay(connection, cityCode, actorId, idempotencyHash);
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) throw new MarketingConflictError("coupon definition idempotency key conflicts with another request");
        return replay.definition;
      }
      const campaign = await this.repository.findCampaignForUpdate(connection, cityCode, parsed.marketingCampaignId);
      const rule = await this.repository.findRuleForUpdate(connection, cityCode, parsed.ruleRevisionId);
      if (!campaign || !rule || rule.marketingCampaignId !== campaign.marketingCampaignId || rule.status !== "published") {
        throw new MarketingConflictError("coupon definition requires its campaign's published rule revision");
      }
      if (!sameStringSet(rule.allowedSkuIds, parsed.allowedSkuIds)) {
        throw new MarketingConflictError("coupon definition SKU scope must exactly match the immutable rule revision");
      }
      const id = marketingId("cdef");
      await this.repository.insertDefinition(connection, {
        id, cityCode, campaignId: campaign.marketingCampaignId, ruleRevisionId: rule.ruleRevisionId,
        name: parsed.name, faceValueMinor: parsed.faceValueMinor, minSpendMinor: parsed.minSpendMinor,
        issuanceCap: parsed.issuanceCap, compensationCap: parsed.compensationCap,
        validFrom: new Date(parsed.validFrom), validUntil: new Date(parsed.validUntil),
        actorId, idempotencyHash, requestFingerprint,
      });
      const definition = await this.repository.findDefinitionForUpdate(connection, cityCode, id);
      if (!definition) throw new Error("failed to load created coupon definition");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "coupon_definition", aggregateId: id,
        action: "coupon_definition_created", actorId, actorRole: context.role, reason: "create",
        expectedVersion: null, actualVersion: definition.version, traceId: context.traceId, now: this.now(),
      }));
      return definition;
    });
  }

  async changeDefinitionStatus(context: RequestContext, definitionId: string, body: unknown): Promise<CouponDefinition> {
    const { cityCode, actorId } = requireAdminApproval(context);
    const parsed = parseOrThrow(changeCouponDefinitionStatusRequestSchema.safeParse(body));
    return this.transactionRunner(async (connection) => {
      const current = await this.repository.findDefinitionForUpdate(connection, cityCode, definitionId);
      if (!current) throw new MarketingNotFoundError("coupon definition not found");
      if (current.version !== parsed.expectedVersion) throw new MarketingConflictError("stale coupon definition version");
      policyConflict(() => assertCouponDefinitionTransition(current.status, parsed.status));
      if (parsed.status === "active") {
        policyConflict(() => assertUtcWindow(this.now(), new Date(current.validFrom), new Date(current.validUntil), "coupon definition"));
      }
      if (!await this.repository.updateDefinitionState(connection, {
        cityCode, id: definitionId, version: current.version, status: parsed.status,
      })) throw new MarketingConflictError("coupon definition CAS conflict");
      const updated = await this.repository.findDefinitionForUpdate(connection, cityCode, definitionId);
      if (!updated) throw new Error("failed to reload coupon definition");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "coupon_definition", aggregateId: definitionId,
        action: `coupon_definition_${parsed.status}`, actorId, actorRole: context.role, reason: parsed.reason,
        expectedVersion: parsed.expectedVersion, actualVersion: updated.version,
        traceId: context.traceId, now: this.now(),
      }));
      return updated;
    });
  }

  async listAdminGrants(context: RequestContext): Promise<CouponGrant[]> {
    const { cityCode } = requireAdminRead(context);
    return this.repository.listGrants(context, cityCode);
  }

  async listCustomerGrants(context: RequestContext, query: unknown = {}): Promise<CouponGrant[]> {
    const { cityCode, customerId } = requireCustomer(context);
    const parsed = parseOrThrow(couponGrantListQuerySchema.safeParse(query)) as CouponGrantListQuery;
    return this.repository.listCustomerGrants(context, cityCode, customerId, parsed.status);
  }

  async grantCoupon(context: RequestContext, body: unknown): Promise<CouponGrant> {
    const { cityCode, actorId } = requireAdminApproval(context);
    const parsed = parseOrThrow(grantCouponRequestSchema.safeParse(body)) as GrantCouponRequest;
    if (parsed.issuanceReason !== "admin_manual") {
      throw new MarketingValidationError("admin grant endpoint accepts only admin_manual issuance");
    }
    const idempotencyHash = marketingHash(parsed.idempotencyKey);
    const requestFingerprint = marketingHash({ cityCode, actorId, ...parsed, idempotencyKey: undefined });
    return this.transactionWithDeadlockRetry(async (connection) => {
      const replay = await this.repository.findGrantReplay(connection, cityCode, actorId, idempotencyHash);
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) throw new MarketingConflictError("coupon grant idempotency key conflicts with another request");
        return replay.grant;
      }
      const definition = await this.repository.findDefinitionForUpdate(connection, cityCode, parsed.couponDefinitionId);
      if (!definition) throw new MarketingNotFoundError("coupon definition not found");
      if (definition.status !== "active") throw new MarketingConflictError("coupon definition is not active");
      const now = this.now();
      policyConflict(() => assertUtcWindow(now, new Date(definition.validFrom), new Date(definition.validUntil), "coupon definition"));
      const expiresAt = new Date(parsed.expiresAt);
      if (expiresAt <= now || expiresAt > new Date(definition.validUntil)) {
        throw new MarketingConflictError("coupon grant expiry must be in the future and no later than its definition");
      }
      if (!await this.repository.customerExists(connection, parsed.customerId)) {
        throw new MarketingNotFoundError("coupon grant customer not found");
      }
      if (!await this.repository.incrementIssuance(connection, cityCode, definition.couponDefinitionId, definition.version)) {
        throw new MarketingConflictError("coupon issuance inventory exhausted or changed concurrently");
      }
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "coupon_definition", aggregateId: definition.couponDefinitionId,
        action: "coupon_issuance_inventory_consumed", actorId, actorRole: context.role,
        reason: parsed.reason, expectedVersion: definition.version,
        actualVersion: definition.version + 1, traceId: context.traceId, now,
      }));
      const id = marketingId("cgrant");
      await this.repository.insertGrant(connection, {
        id, cityCode, definition, customerId: parsed.customerId,
        issuanceReason: parsed.issuanceReason, issuanceRef: parsed.issuanceRef,
        expiresAt, actorId, idempotencyHash, requestFingerprint,
      });
      const grant = await this.repository.findGrantForUpdate(connection, cityCode, id);
      if (!grant) throw new Error("failed to load created coupon grant");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "coupon_grant", aggregateId: id, action: "coupon_granted",
        actorId, actorRole: context.role, reason: parsed.reason, expectedVersion: null,
        actualVersion: grant.version, traceId: context.traceId, now,
      }));
      return grant;
    });
  }

  async revokeGrant(context: RequestContext, grantId: string, body: unknown): Promise<CouponGrant> {
    const { cityCode, actorId } = requireAdminApproval(context);
    const parsed = parseOrThrow(revokeCouponGrantRequestSchema.safeParse(body));
    return this.transactionRunner(async (connection) => {
      const current = await this.repository.findGrantForUpdate(connection, cityCode, grantId);
      if (!current) throw new MarketingNotFoundError("coupon grant not found");
      if (current.version !== parsed.expectedVersion) throw new MarketingConflictError("stale coupon grant version");
      if (!await this.repository.revokeGrant(connection, cityCode, grantId, current.version)) {
        throw new MarketingConflictError("coupon grant cannot be revoked from its current state");
      }
      const updated = await this.repository.findGrantForUpdate(connection, cityCode, grantId);
      if (!updated) throw new Error("failed to reload coupon grant");
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "coupon_grant", aggregateId: grantId, action: "coupon_revoked",
        actorId, actorRole: context.role, reason: parsed.reason, expectedVersion: parsed.expectedVersion,
        actualVersion: updated.version, traceId: context.traceId, now: this.now(),
      }));
      return updated;
    });
  }

  async issueDiscountDecision(context: RequestContext, body: unknown): Promise<MarketingDiscountDecision> {
    const { cityCode, customerId } = requireCustomer(context);
    const parsed = parseOrThrow(issueMarketingDiscountDecisionRequestSchema.safeParse(body));
    return this.transactionWithDeadlockRetry(async (connection) => {
      const idempotencyHash = marketingHash(parsed.idempotencyKey);
      const replay = await this.repository.findDecisionReplay(connection, cityCode, customerId, idempotencyHash);
      if (replay) {
        if (replay.decision.skuId !== parsed.skuId
          || replay.decision.quantity !== parsed.quantity
          || replay.decision.couponGrantId !== parsed.selectedCouponGrantId) {
          throw new MarketingConflictError("discount decision idempotency key conflicts with another request");
        }
        return replay.decision;
      }
      const quote = await this.repository.findCanonicalPublicQuote(connection, {
        cityCode, skuId: parsed.skuId,
      });
      if (!quote || quote.currency !== "CNY") {
        throw new MarketingConflictError("enabled canonical CNY public Pricing rule not found");
      }
      const unitAmountMinor = decimalStringToMinorExact(quote.unitAmountDecimal, "canonical public quote");
      const grossAmountMinor = multiplyMinorExact(unitAmountMinor, parsed.quantity, "canonical public quote");
      const eligibility = await this.repository.loadDecisionEligibilityForUpdate(
        connection, cityCode, customerId, parsed.selectedCouponGrantId,
      );
      if (!eligibility) throw new MarketingNotFoundError("coupon grant not found");
      const requestFingerprint = marketingHash({
        cityCode, customerId, skuId: parsed.skuId, quantity: parsed.quantity,
        priceRuleId: quote.priceRuleId, priceRuleVersion: quote.version,
        grossAmountMinor, currency: "CNY",
        couponGrantId: eligibility.grant.couponGrantId,
        couponDefinitionId: eligibility.definition.couponDefinitionId,
        ruleRevisionId: eligibility.ruleRevision.ruleRevisionId,
        ruleContentHash: eligibility.ruleContentHash,
      });
      this.assertDecisionEligibility(eligibility, parsed.skuId, grossAmountMinor);
      const amounts = calculateFixedCouponAmounts(grossAmountMinor, eligibility.definition.faceValueMinor);
      const now = this.now();
      const id = marketingId("mdec");
      await this.repository.insertDecision(connection, {
        id, cityCode, customerId, skuId: parsed.skuId, quantity: parsed.quantity,
        priceRuleId: quote.priceRuleId, priceRuleVersion: quote.version,
        eligibility, ...amounts, requestFingerprint, idempotencyHash,
        expiresAt: new Date(now.getTime() + MARKETING_DECISION_TTL_MS),
      });
      const decision = await this.repository.findDecisionForUpdate(connection, cityCode, customerId, id);
      if (!decision) throw new Error("failed to load issued Marketing discount decision");
      await this.outboxRepository.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "marketing.discount.decision.issued",
        eventMajorVersion: 1,
        aggregateType: "discount_decision",
        aggregateId: decision.discountDecisionId,
        cityCode,
        payload: {
          discountDecisionId: decision.discountDecisionId,
          couponGrantId: decision.couponGrantId,
          skuId: decision.skuId,
          grossAmountMinor: decision.grossAmountMinor,
          discountAmountMinor: decision.discountAmountMinor,
          netAmountMinor: decision.netAmountMinor,
          currency: decision.currency,
          expiresAt: decision.expiresAt,
        },
      });
      await this.repository.insertAudit(connection, auditRecord({
        cityCode, aggregateType: "discount_decision", aggregateId: id,
        action: "discount_decision_issued", actorId: customerId, actorRole: context.role,
        reason: "customer_selected_coupon", expectedVersion: null, actualVersion: decision.version,
        traceId: context.traceId, now,
      }));
      return decision;
    });
  }

  private assertDecisionEligibility(
    eligibility: DecisionEligibility, skuId: string, grossAmountMinor: number,
  ): void {
    const now = this.now();
    if (eligibility.grant.status !== "available" || new Date(eligibility.grant.expiresAt) <= now) {
      throw new MarketingConflictError("coupon grant is not available");
    }
    const isCompensatingGrant = eligibility.grant.issuanceReason === "order_cancellation"
      || eligibility.grant.issuanceReason === "full_refund";
    if (
      eligibility.ruleRevision.status !== "published" ||
      eligibility.campaign.activeRuleRevisionId !== eligibility.ruleRevision.ruleRevisionId
    ) {
      throw new MarketingConflictError("coupon rule revision is not the published campaign revision");
    }
    if (isCompensatingGrant) {
      if (
        !["active", "ended"].includes(eligibility.campaign.status) ||
        !["active", "expired"].includes(eligibility.definition.status)
      ) {
        throw new MarketingConflictError("compensating coupon scope was paused, revoked, suspended, or retired");
      }
      // Compensation is valid for exactly 30 days from its own grant time.
      // Natural campaign/definition end windows cannot silently shorten it.
    } else {
      if (eligibility.definition.status !== "active" || eligibility.campaign.status !== "active") {
        throw new MarketingConflictError("coupon campaign or definition is not active");
      }
      policyConflict(() => assertUtcWindow(now, new Date(eligibility.campaign.startAt), new Date(eligibility.campaign.endAt), "Marketing campaign"));
      policyConflict(() => assertUtcWindow(now, new Date(eligibility.definition.validFrom), new Date(eligibility.definition.validUntil), "coupon definition"));
    }
    if (!eligibility.ruleRevision.allowedSkuIds.includes(skuId)) {
      throw new MarketingConflictError("coupon is not eligible for the selected SKU");
    }
    assertSafeMinorAmount(grossAmountMinor, "grossAmountMinor");
    if (grossAmountMinor < eligibility.definition.minSpendMinor) {
      throw new MarketingConflictError("order gross amount does not meet coupon minimum spend");
    }
  }

  async findAcceptedOrderReplay(
    connection: PoolConnection,
    context: RequestContext,
    input: Pick<PrepareMarketingOrderAcceptanceInput, "discountDecisionId" | "expectedDecisionVersion" | "orderCommandKey" | "skuId" | "quantity">,
  ): Promise<AcceptedMarketingOrderReplay | null> {
    const { cityCode, customerId } = requireCustomer(context);
    const decision = await this.repository.findAcceptedDecisionByOrderCommand(
      connection, cityCode, customerId, marketingHash(input.orderCommandKey),
    );
    if (!decision) return null;
    if (decision.discountDecisionId !== input.discountDecisionId
      || decision.skuId !== input.skuId || decision.quantity !== input.quantity
      || decision.version !== input.expectedDecisionVersion + 1) {
      throw new MarketingConflictError("order command idempotency key conflicts with another Marketing decision request");
    }
    if (!decision.acceptedOrderId) throw new MarketingConflictError("accepted Marketing decision has no canonical Order");
    const reservation = await this.repository.findReservationByDecision(connection, cityCode, decision.discountDecisionId);
    const redemption = await this.repository.findRedemptionByDecision(connection, cityCode, decision.discountDecisionId);
    if (!reservation || !redemption) throw new MarketingConflictError("accepted Marketing decision evidence is incomplete");
    return { acceptedOrderId: decision.acceptedOrderId, decision, reservation, redemption };
  }

  async prepareDecisionForOrder(
    connection: PoolConnection, context: RequestContext, input: PrepareMarketingOrderAcceptanceInput,
  ): Promise<PreparedMarketingOrderAcceptance> {
    if (!input.discountDecisionId || !Number.isSafeInteger(input.expectedDecisionVersion)
      || input.expectedDecisionVersion < 1 || !input.orderId || !input.orderCommandKey
      || !input.skuId || !Number.isSafeInteger(input.quantity) || input.quantity < 1) {
      throw new MarketingValidationError("invalid internal Marketing Order acceptance command");
    }
    const request = input;
    const { cityCode, customerId } = requireCustomer(context);
    const decision = await this.repository.findDecisionForUpdate(connection, cityCode, customerId, request.discountDecisionId);
    if (!decision) throw new MarketingNotFoundError("Marketing discount decision not found");
    if (decision.skuId !== input.skuId || decision.quantity !== input.quantity) {
      throw new MarketingConflictError("Marketing discount decision SKU or quantity mismatch");
    }
    if (decision.status === "accepted") {
      if (decision.version !== input.expectedDecisionVersion + 1) {
        throw new MarketingConflictError("stale Marketing discount decision version on accepted replay");
      }
      const commandReplay = await this.repository.findAcceptedDecisionByOrderCommand(
        connection, cityCode, customerId, marketingHash(request.orderCommandKey),
      );
      if (!commandReplay || commandReplay.discountDecisionId !== decision.discountDecisionId) {
        throw new MarketingConflictError("accepted Marketing decision order command key mismatch");
      }
      if (decision.acceptedOrderId !== request.orderId) {
        throw new MarketingConflictError("Marketing discount decision was accepted by another order");
      }
      const existingReservation = await this.repository.findReservationByDecision(connection, cityCode, decision.discountDecisionId);
      const existingRedemption = await this.repository.findRedemptionByDecision(connection, cityCode, decision.discountDecisionId);
      if (!existingReservation || !existingRedemption) throw new MarketingConflictError("accepted decision evidence is incomplete");
      return {
        request, decision, couponReservationId: existingReservation.couponReservationId,
        couponRedemptionId: existingRedemption.couponRedemptionId, grantVersion: 0,
        reservationExpiresAt: existingReservation.expiresAt, idempotent: true,
        existingReservation, existingRedemption, canonicalQuote: null,
      };
    }
    if (decision.status !== "issued" || new Date(decision.expiresAt) <= this.now()) {
      throw new MarketingConflictError("Marketing discount decision is no longer issuable");
    }
    if (decision.version !== input.expectedDecisionVersion) {
      throw new MarketingConflictError("stale Marketing discount decision version");
    }
    const eligibility = await this.repository.loadDecisionEligibilityForUpdate(
      connection, cityCode, customerId, decision.couponGrantId,
    );
    if (!eligibility || eligibility.grant.status !== "available") {
      throw new MarketingConflictError("coupon grant is no longer available");
    }
    if (eligibility.ruleContentHash !== decision.ruleContentHash
      || eligibility.ruleRevision.ruleRevisionId !== decision.ruleRevisionId
      || eligibility.definition.couponDefinitionId !== decision.couponDefinitionId) {
      throw new MarketingConflictError("Marketing rule evidence drifted");
    }
    this.assertDecisionEligibility(eligibility, input.skuId, decision.grossAmountMinor);
    const quote = await this.repository.findCanonicalPublicQuote(connection, {
      cityCode, skuId: input.skuId,
    });
    if (!quote || quote.currency !== "CNY") {
      throw new MarketingConflictError("canonical public Pricing quote is unavailable");
    }
    const canonicalGrossMinor = multiplyMinorExact(
      decimalStringToMinorExact(quote.unitAmountDecimal, "canonical public quote"),
      input.quantity,
      "canonical public quote",
    );
    if (quote.priceRuleId !== decision.priceRuleId || quote.version !== decision.priceRuleVersion
      || canonicalGrossMinor !== decision.grossAmountMinor
      || decision.netAmountMinor !== decision.grossAmountMinor - decision.discountAmountMinor) {
      throw new MarketingConflictError("Marketing decision no longer matches canonical Pricing evidence");
    }
    const expectedFingerprint = marketingHash({
      cityCode, customerId, skuId: decision.skuId, quantity: decision.quantity,
      priceRuleId: decision.priceRuleId, priceRuleVersion: decision.priceRuleVersion,
      grossAmountMinor: decision.grossAmountMinor, currency: decision.currency,
      couponGrantId: decision.couponGrantId, couponDefinitionId: decision.couponDefinitionId,
      ruleRevisionId: decision.ruleRevisionId, ruleContentHash: decision.ruleContentHash,
    });
    if (expectedFingerprint !== decision.requestFingerprint) {
      throw new MarketingConflictError("stored Marketing decision fingerprint evidence is invalid");
    }
    const now = this.now();
    return {
      request, decision, couponReservationId: marketingId("cres"),
      couponRedemptionId: marketingId("cred"), grantVersion: eligibility.grant.version,
      reservationExpiresAt: new Date(now.getTime() + MARKETING_RESERVATION_TTL_MS).toISOString(),
      idempotent: false, existingReservation: null, existingRedemption: null,
      canonicalQuote: quote.canonicalQuote,
    };
  }

  async commitPreparedDecisionAcceptance(
    connection: PoolConnection, context: RequestContext, prepared: PreparedMarketingOrderAcceptance,
  ): Promise<{ decision: MarketingDiscountDecision; reservation: CouponReservation; redemption: CouponRedemption; idempotent: boolean }> {
    const { cityCode, customerId } = requireCustomer(context);
    if (prepared.decision.cityCode !== cityCode || prepared.decision.customerId !== customerId) {
      throw new MarketingAuthorizationError("prepared Marketing acceptance scope mismatch");
    }
    if (prepared.idempotent) {
      return {
        decision: prepared.decision,
        reservation: prepared.existingReservation!, redemption: prepared.existingRedemption!, idempotent: true,
      };
    }
    if (!await this.repository.reserveGrant(
      connection, cityCode, prepared.decision.couponGrantId, prepared.grantVersion,
    )) throw new MarketingConflictError("coupon grant reservation CAS conflict");
    const now = this.now();
    await this.repository.insertAudit(connection, auditRecord({
      cityCode, aggregateType: "coupon_grant", aggregateId: prepared.decision.couponGrantId,
      action: "coupon_grant_reserved", actorId: customerId, actorRole: context.role,
      reason: "order_acceptance", expectedVersion: prepared.grantVersion,
      actualVersion: prepared.grantVersion + 1, traceId: context.traceId, now,
    }));
    await this.repository.insertReservation(connection, {
      id: prepared.couponReservationId, decision: prepared.decision,
      orderId: prepared.request.orderId, expiresAt: new Date(prepared.reservationExpiresAt),
    });
    await this.repository.insertAudit(connection, auditRecord({
      cityCode, aggregateType: "coupon_reservation", aggregateId: prepared.couponReservationId,
      action: "coupon_reservation_created", actorId: customerId, actorRole: context.role,
      reason: "order_acceptance", expectedVersion: null, actualVersion: 1,
      traceId: context.traceId, now,
    }));
    if (!await this.repository.redeemAcceptance(connection, {
      decision: prepared.decision, grantVersionAfterReserve: prepared.grantVersion + 1,
      reservationId: prepared.couponReservationId, orderId: prepared.request.orderId,
      orderCommandKeyHash: marketingHash(prepared.request.orderCommandKey),
      redemptionId: prepared.couponRedemptionId, now,
    })) throw new MarketingConflictError("Marketing acceptance CAS conflict");
    await this.repository.insertAudit(connection, auditRecord({
      cityCode, aggregateType: "coupon_reservation", aggregateId: prepared.couponReservationId,
      action: "coupon_reservation_redeemed", actorId: customerId, actorRole: context.role,
      reason: "order_created", expectedVersion: 1, actualVersion: 2,
      traceId: context.traceId, now,
    }));
    await this.repository.insertAudit(connection, auditRecord({
      cityCode, aggregateType: "coupon_grant", aggregateId: prepared.decision.couponGrantId,
      action: "coupon_grant_redeemed", actorId: customerId, actorRole: context.role,
      reason: "order_created", expectedVersion: prepared.grantVersion + 1,
      actualVersion: prepared.grantVersion + 2, traceId: context.traceId, now,
    }));
    await this.repository.insertAudit(connection, auditRecord({
      cityCode, aggregateType: "discount_decision", aggregateId: prepared.decision.discountDecisionId,
      action: "discount_decision_accepted", actorId: customerId, actorRole: context.role,
      reason: "order_created", expectedVersion: prepared.decision.version,
      actualVersion: prepared.decision.version + 1, traceId: context.traceId, now,
    }));
    const decision = await this.repository.findDecisionForUpdate(
      connection, cityCode, customerId, prepared.decision.discountDecisionId,
    );
    const reservation = await this.repository.findReservationByDecision(connection, cityCode, prepared.decision.discountDecisionId);
    const redemption = await this.repository.findRedemptionByDecision(connection, cityCode, prepared.decision.discountDecisionId);
    if (!decision || !reservation || !redemption) throw new Error("failed to reload Marketing acceptance evidence");
    return { decision, reservation, redemption, idempotent: false };
  }

  /**
   * Dormant abnormal-recovery primitive. Phase29 deliberately exposes no route,
   * scheduler, subscriber, runner, replay, or backfill that invokes it.
   */
  async recoverExpiredReservation(
    identityInput: unknown,
    requestInput: unknown,
  ): Promise<CouponReservationRecoveryResult> {
    const identityResult = platformServiceIdentitySchema.safeParse(identityInput);
    if (!identityResult.success) throw new MarketingValidationError(identityResult.error.message);
    const request = parseOrThrow(
      recoverExpiredCouponReservationRequestSchema.safeParse(requestInput),
    ) as RecoverExpiredCouponReservationRequest;
    const identity = identityResult.data as PlatformServiceIdentity;

    return this.transactionRunner(async (connection) => {
      const reservation = await this.repository.findReservationForUpdate(
        connection, identity.cityCode, request.couponReservationId,
      );
      if (!reservation) throw new MarketingNotFoundError("coupon reservation not found");

      const loadRelated = async () => {
        const couponGrant = await this.repository.findGrantForUpdate(
          connection, identity.cityCode, reservation.couponGrantId,
        );
        const discountDecision = await this.repository.findDecisionForUpdate(
          connection, identity.cityCode, reservation.customerId, reservation.discountDecisionId,
        );
        return { couponGrant, discountDecision };
      };

      if (reservation.status === "released") {
        return { outcome: "reused", couponReservation: reservation, ...await loadRelated() };
      }
      if (reservation.status !== "active") {
        return { outcome: "not_recoverable", couponReservation: reservation, ...await loadRelated() };
      }
      if (reservation.version !== request.expectedReservationVersion) {
        throw new MarketingConflictError("stale coupon reservation recovery version");
      }

      const now = this.now();
      const twoMinuteCeiling = new Date(
        new Date(reservation.createdAt).getTime() + MARKETING_RESERVATION_TTL_MS,
      );
      if (now < new Date(reservation.expiresAt) || now < twoMinuteCeiling) {
        return { outcome: "not_due", couponReservation: reservation, ...await loadRelated() };
      }

      const { couponGrant, discountDecision } = await loadRelated();
      const redemption = await this.repository.findRedemptionByReservationForUpdate(
        connection, identity.cityCode, reservation.couponReservationId,
      );
      const orderHasAcceptanceEvidence = await this.repository.orderHasMarketingAcceptanceEvidenceForUpdate(
        connection, reservation,
      );
      if (orderHasAcceptanceEvidence || redemption || discountDecision?.status === "accepted") {
        return {
          outcome: "order_evidence_present", couponReservation: reservation,
          couponGrant, discountDecision,
        };
      }
      if (!couponGrant || !discountDecision
        || couponGrant.status !== "reserved"
        || discountDecision.status !== "issued"
        || couponGrant.customerId !== reservation.customerId
        || discountDecision.couponGrantId !== couponGrant.couponGrantId) {
        return {
          outcome: "not_recoverable", couponReservation: reservation,
          couponGrant, discountDecision,
        };
      }

      if (!await this.repository.releaseExpiredReservation(
        connection, reservation, request.reason, now,
      )) throw new MarketingConflictError("coupon reservation recovery CAS conflict");
      if (!await this.repository.transitionGrantForExpiredReservation(
        connection, identity.cityCode, couponGrant.couponGrantId, couponGrant.version,
        "reserved", "released",
      )) throw new MarketingConflictError("coupon grant release CAS conflict");
      if (!await this.repository.transitionGrantForExpiredReservation(
        connection, identity.cityCode, couponGrant.couponGrantId, couponGrant.version + 1,
        "released", "available",
      )) throw new MarketingConflictError("coupon grant restore CAS conflict");
      if (!await this.repository.rejectDecisionForExpiredReservation(connection, discountDecision)) {
        throw new MarketingConflictError("discount decision recovery CAS conflict");
      }

      const auditBase = {
        cityCode: identity.cityCode,
        actorId: identity.serviceId,
        actorRole: "platform_service",
        reason: request.reason,
        traceId: request.traceId,
        now,
      };
      await this.repository.insertAudit(connection, auditRecord({
        ...auditBase, aggregateType: "coupon_reservation",
        aggregateId: reservation.couponReservationId,
        action: "coupon_reservation_released",
        expectedVersion: reservation.version, actualVersion: reservation.version + 1,
      }));
      await this.repository.insertAudit(connection, auditRecord({
        ...auditBase, aggregateType: "coupon_grant", aggregateId: couponGrant.couponGrantId,
        action: "coupon_grant_released", expectedVersion: couponGrant.version,
        actualVersion: couponGrant.version + 1,
      }));
      await this.repository.insertAudit(connection, auditRecord({
        ...auditBase, aggregateType: "coupon_grant", aggregateId: couponGrant.couponGrantId,
        action: "coupon_grant_restored", expectedVersion: couponGrant.version + 1,
        actualVersion: couponGrant.version + 2,
      }));
      await this.repository.insertAudit(connection, auditRecord({
        ...auditBase, aggregateType: "discount_decision",
        aggregateId: discountDecision.discountDecisionId,
        action: "discount_decision_rejected",
        expectedVersion: discountDecision.version, actualVersion: discountDecision.version + 1,
      }));
      await this.outboxRepository.insertEvent(connection, {
        eventId: generateEventId(),
        eventType: "marketing.coupon.released",
        eventMajorVersion: 1,
        aggregateType: "coupon_reservation",
        aggregateId: reservation.couponReservationId,
        cityCode: identity.cityCode,
        payload: {
          couponReservationId: reservation.couponReservationId,
          couponGrantId: couponGrant.couponGrantId,
          discountDecisionId: discountDecision.discountDecisionId,
          orderId: reservation.orderId,
          discountAmountMinor: reservation.discountAmountMinor,
          currency: reservation.currency,
          reasonCode: "reservation_timeout",
          occurredAt: now.toISOString(),
        },
      });

      const releasedReservation = await this.repository.findReservationForUpdate(
        connection, identity.cityCode, reservation.couponReservationId,
      );
      const restoredGrant = await this.repository.findGrantForUpdate(
        connection, identity.cityCode, couponGrant.couponGrantId,
      );
      const rejectedDecision = await this.repository.findDecisionForUpdate(
        connection, identity.cityCode, reservation.customerId, discountDecision.discountDecisionId,
      );
      if (!releasedReservation || !restoredGrant || !rejectedDecision) {
        throw new Error("failed to reload coupon reservation recovery evidence");
      }
      return {
        outcome: "released", couponReservation: releasedReservation,
        couponGrant: restoredGrant, discountDecision: rejectedDecision,
      };
    });
  }

  async listAudits(context: RequestContext): Promise<MarketingAuditRecord[]> {
    const { cityCode } = requireAdminRead(context);
    return this.repository.listAudits(context, cityCode);
  }
}

export const marketingService = new MarketingService();
