import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  CouponDefinition,
  CouponGrant,
  CouponRedemption,
  CouponReservation,
  MarketingAuditRecord,
  MarketingCampaign,
  MarketingCompensationGrant,
  MarketingDiscountDecision,
  MarketingRuleRevision,
  RequestContext,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import { loadCanonicalPublicPriceQuoteForUpdate } from "../pricing/pricingRepository.js";

type CampaignRow = RowDataPacket & {
  marketing_campaign_id: string; city_code: string; name: string; status: string;
  active_rule_revision_id: string | null; start_at: Date; end_at: Date;
  reviewed_by: string | null; reviewed_at: Date | null; version: number | string;
  created_at: Date; updated_at: Date; create_idempotency_key_hash: string;
  create_request_fingerprint: string;
};
type RuleRow = RowDataPacket & {
  rule_revision_id: string; marketing_campaign_id: string; city_code: string;
  revision: number | string; status: string; allowed_sku_ids_json: string | string[];
  reviewed_by: string | null; reviewed_at: Date | null;
  published_by: string | null; published_at: Date | null; version: number | string;
  created_by: string; created_at: Date; create_idempotency_key_hash: string; create_request_fingerprint: string;
};
type DefinitionRow = RowDataPacket & {
  coupon_definition_id: string; marketing_campaign_id: string; rule_revision_id: string;
  city_code: string; name: string; status: string; currency: "CNY";
  face_value_minor: number | string; min_spend_minor: number | string;
  issuance_cap: number | string; issued_count: number | string;
  compensation_cap: number | string; compensation_issued_count: number | string;
  valid_from: Date; valid_until: Date; version: number | string;
  created_at: Date; updated_at: Date; create_idempotency_key_hash: string;
  create_request_fingerprint: string;
};
type GrantRow = RowDataPacket & {
  coupon_grant_id: string; coupon_definition_id: string; marketing_campaign_id: string;
  rule_revision_id: string; city_code: string; customer_id: string; status: string;
  issuance_reason: string; issuance_ref: string; available_at: Date | null;
  expires_at: Date; version: number | string; created_at: Date; updated_at: Date;
  idempotency_key_hash: string; request_fingerprint: string;
};
type DecisionRow = RowDataPacket & {
  discount_decision_id: string; city_code: string; customer_id: string; sku_id: string;
  quantity: number; price_rule_id: string; price_rule_version: number | string;
  rule_revision_id: string; rule_content_hash: string; coupon_definition_id: string; coupon_grant_id: string;
  currency: "CNY"; gross_amount_minor: number | string; discount_amount_minor: number | string;
  net_amount_minor: number | string; request_fingerprint: string; status: string;
  expires_at: Date; accepted_order_id: string | null; version: number | string;
  created_at: Date; updated_at: Date; issue_idempotency_key_hash: string;
};
type ReservationRow = RowDataPacket & {
  coupon_reservation_id: string; coupon_grant_id: string; discount_decision_id: string;
  order_id: string; city_code: string; customer_id: string; status: string; currency: "CNY";
  discount_amount_minor: number | string; expires_at: Date; released_reason: string | null;
  version: number | string; created_at: Date; updated_at: Date;
};
type RedemptionRow = RowDataPacket & {
  coupon_redemption_id: string; coupon_reservation_id: string; coupon_grant_id: string;
  discount_decision_id: string; order_id: string; city_code: string; customer_id: string;
  currency: "CNY"; discount_amount_minor: number | string; redeemed_at: Date;
};
type CompensationRow = RowDataPacket & {
  compensation_id: string; city_code: string; customer_id: string;
  source_coupon_redemption_id: string; trigger_type: string; trigger_id: string;
  source_delivery_id: string; source_event_id: string; source_payload_hash: string; status: string;
  currency: "CNY"; amount_minor: number | string; resulting_coupon_grant_id: string | null;
  decision_reason: string | null; expires_at: Date | null; version: number | string;
  created_at: Date; updated_at: Date;
};
type AuditRow = RowDataPacket & {
  marketing_audit_id: string; city_code: string; aggregate_type: string; aggregate_id: string;
  action: string; actor_id: string; actor_role: string; reason: string;
  expected_version: number | string | null; actual_version: number | string;
  trace_id: string; created_at: Date;
};

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;
const number = (value: number | string): number => Number(value);
const jsonArray = (value: string | string[]): string[] => typeof value === "string"
  ? JSON.parse(value) as string[]
  : value;

export const mapCampaign = (row: CampaignRow): MarketingCampaign => ({
  marketingCampaignId: row.marketing_campaign_id, cityCode: row.city_code as CityCode,
  name: row.name, status: row.status as MarketingCampaign["status"],
  activeRuleRevisionId: row.active_rule_revision_id, startAt: row.start_at.toISOString(),
  endAt: row.end_at.toISOString(), reviewedBy: row.reviewed_by,
  reviewedAt: iso(row.reviewed_at), version: number(row.version),
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});
export const mapRuleRevision = (row: RuleRow): MarketingRuleRevision => ({
  ruleRevisionId: row.rule_revision_id, marketingCampaignId: row.marketing_campaign_id,
  cityCode: row.city_code as CityCode, revision: number(row.revision),
  status: row.status as MarketingRuleRevision["status"], allowedSkuIds: jsonArray(row.allowed_sku_ids_json),
  createdBy: row.created_by,
  reviewedBy: row.reviewed_by, reviewedAt: iso(row.reviewed_at),
  publishedBy: row.published_by, publishedAt: iso(row.published_at), version: number(row.version),
  createdAt: row.created_at.toISOString(),
});
export const mapDefinition = (row: DefinitionRow): CouponDefinition => ({
  couponDefinitionId: row.coupon_definition_id, marketingCampaignId: row.marketing_campaign_id,
  ruleRevisionId: row.rule_revision_id, cityCode: row.city_code as CityCode, name: row.name,
  status: row.status as CouponDefinition["status"], currency: row.currency,
  faceValueMinor: number(row.face_value_minor), minSpendMinor: number(row.min_spend_minor),
  issuanceCap: number(row.issuance_cap), issuedCount: number(row.issued_count),
  compensationCap: number(row.compensation_cap),
  compensationIssuedCount: number(row.compensation_issued_count),
  validFrom: row.valid_from.toISOString(), validUntil: row.valid_until.toISOString(),
  version: number(row.version), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});
export const mapGrant = (row: GrantRow): CouponGrant => ({
  couponGrantId: row.coupon_grant_id, couponDefinitionId: row.coupon_definition_id,
  marketingCampaignId: row.marketing_campaign_id, ruleRevisionId: row.rule_revision_id,
  cityCode: row.city_code as CityCode, customerId: row.customer_id,
  status: row.status as CouponGrant["status"], issuanceReason: row.issuance_reason as CouponGrant["issuanceReason"],
  issuanceRef: row.issuance_ref, availableAt: iso(row.available_at), expiresAt: row.expires_at.toISOString(),
  version: number(row.version), createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});
export const mapDecision = (row: DecisionRow): MarketingDiscountDecision => ({
  discountDecisionId: row.discount_decision_id, cityCode: row.city_code as CityCode,
  customerId: row.customer_id, skuId: row.sku_id, quantity: row.quantity,
  priceRuleId: row.price_rule_id, priceRuleVersion: number(row.price_rule_version),
  ruleRevisionId: row.rule_revision_id, ruleContentHash: row.rule_content_hash,
  couponDefinitionId: row.coupon_definition_id,
  couponGrantId: row.coupon_grant_id, currency: row.currency,
  grossAmountMinor: number(row.gross_amount_minor), discountAmountMinor: number(row.discount_amount_minor),
  netAmountMinor: number(row.net_amount_minor), requestFingerprint: row.request_fingerprint,
  status: row.status as MarketingDiscountDecision["status"], expiresAt: row.expires_at.toISOString(),
  acceptedOrderId: row.accepted_order_id, version: number(row.version),
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});
export const mapReservation = (row: ReservationRow): CouponReservation => ({
  couponReservationId: row.coupon_reservation_id, couponGrantId: row.coupon_grant_id,
  discountDecisionId: row.discount_decision_id, orderId: row.order_id,
  cityCode: row.city_code as CityCode, customerId: row.customer_id,
  status: row.status as CouponReservation["status"], currency: row.currency,
  discountAmountMinor: number(row.discount_amount_minor), expiresAt: row.expires_at.toISOString(),
  releasedReason: row.released_reason, version: number(row.version),
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});
export const mapRedemption = (row: RedemptionRow): CouponRedemption => ({
  couponRedemptionId: row.coupon_redemption_id, couponReservationId: row.coupon_reservation_id,
  couponGrantId: row.coupon_grant_id, discountDecisionId: row.discount_decision_id,
  orderId: row.order_id, cityCode: row.city_code as CityCode, customerId: row.customer_id,
  currency: row.currency, discountAmountMinor: number(row.discount_amount_minor),
  redeemedAt: row.redeemed_at.toISOString(),
});
export const mapCompensation = (row: CompensationRow): MarketingCompensationGrant => ({
  compensationId: row.compensation_id, cityCode: row.city_code as CityCode,
  customerId: row.customer_id, sourceCouponRedemptionId: row.source_coupon_redemption_id,
  triggerType: row.trigger_type as MarketingCompensationGrant["triggerType"], triggerId: row.trigger_id,
  status: row.status as MarketingCompensationGrant["status"], currency: row.currency,
  amountMinor: number(row.amount_minor), resultingCouponGrantId: row.resulting_coupon_grant_id,
  decisionReason: row.decision_reason, expiresAt: iso(row.expires_at), version: number(row.version),
  createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
});
export const mapAudit = (row: AuditRow): MarketingAuditRecord => ({
  marketingAuditId: row.marketing_audit_id, cityCode: row.city_code as CityCode,
  aggregateType: row.aggregate_type as MarketingAuditRecord["aggregateType"], aggregateId: row.aggregate_id,
  action: row.action, actorId: row.actor_id, actorRole: row.actor_role, reason: row.reason,
  expectedVersion: row.expected_version === null ? null : number(row.expected_version),
  actualVersion: number(row.actual_version), traceId: row.trace_id, createdAt: row.created_at.toISOString(),
});

export type DecisionEligibility = {
  grant: CouponGrant;
  definition: CouponDefinition;
  ruleRevision: MarketingRuleRevision;
  campaign: MarketingCampaign;
  ruleContentHash: string;
};

export type CompensationSourceEvidence = DecisionEligibility & {
  redemption: CouponRedemption;
  orderTotalDecimal: string;
  orderStatus: string;
};

export class MarketingRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  private assertContext(context: RequestContext, cityCode: CityCode): void {
    const scopedCity = assertCityScopedContext(context);
    if (scopedCity !== cityCode) throw new Error("city_code mismatch in Marketing repository");
  }

  async listCampaigns(context: RequestContext, cityCode: CityCode): Promise<MarketingCampaign[]> {
    this.assertContext(context, cityCode);
    const [rows] = await this.pool.query<CampaignRow[]>(
      `SELECT * FROM marketing_campaigns WHERE city_code=? ORDER BY created_at DESC LIMIT 200`, [cityCode],
    );
    return rows.map(mapCampaign);
  }

  async findCampaignForUpdate(connection: PoolConnection, cityCode: CityCode, id: string): Promise<MarketingCampaign | null> {
    const [rows] = await connection.query<CampaignRow[]>(
      `SELECT * FROM marketing_campaigns WHERE city_code=? AND marketing_campaign_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, id],
    );
    return rows[0] ? mapCampaign(rows[0]) : null;
  }

  async findCampaignCreateReplay(
    connection: PoolConnection, cityCode: CityCode, actorId: string, idempotencyHash: string,
  ): Promise<(MarketingCampaign & { requestFingerprint: string }) | null> {
    const [rows] = await connection.query<CampaignRow[]>(
      `SELECT * FROM marketing_campaigns
       WHERE city_code=? AND created_by=? AND create_idempotency_key_hash=? LIMIT 1 FOR UPDATE`,
      [cityCode, actorId, idempotencyHash],
    );
    return rows[0] ? { ...mapCampaign(rows[0]), requestFingerprint: rows[0].create_request_fingerprint } : null;
  }

  async insertCampaign(connection: PoolConnection, input: {
    id: string; cityCode: CityCode; name: string; startAt: Date; endAt: Date; actorId: string;
    idempotencyHash: string; requestFingerprint: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO marketing_campaigns
       (marketing_campaign_id,city_code,name,status,start_at,end_at,created_by,
        create_idempotency_key_hash,create_request_fingerprint)
       VALUES (?,?,?,'draft',?,?,?,?,?)`,
      [input.id, input.cityCode, input.name, input.startAt, input.endAt, input.actorId,
        input.idempotencyHash, input.requestFingerprint],
    );
  }

  async updateCampaignState(connection: PoolConnection, input: {
    cityCode: CityCode; id: string; currentVersion: number; status: MarketingCampaign["status"];
    actorId?: string; activeRuleRevisionId?: string | null;
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE marketing_campaigns
       SET status=?, active_rule_revision_id=COALESCE(?,active_rule_revision_id),
           reviewed_by=CASE WHEN ?='reviewed' THEN ? ELSE reviewed_by END,
           reviewed_at=CASE WHEN ?='reviewed' THEN CURRENT_TIMESTAMP(3) ELSE reviewed_at END,
           version=version+1
       WHERE city_code=? AND marketing_campaign_id=? AND version=?`,
      [input.status, input.activeRuleRevisionId ?? null, input.status, input.actorId ?? null,
        input.status, input.cityCode, input.id, input.currentVersion],
    );
    return result.affectedRows === 1;
  }

  async listRuleRevisions(context: RequestContext, cityCode: CityCode, campaignId: string): Promise<MarketingRuleRevision[]> {
    this.assertContext(context, cityCode);
    const [rows] = await this.pool.query<RuleRow[]>(
      `SELECT * FROM marketing_rule_revisions WHERE city_code=? AND marketing_campaign_id=? ORDER BY revision DESC`,
      [cityCode, campaignId],
    );
    return rows.map(mapRuleRevision);
  }

  async findRuleForUpdate(connection: PoolConnection, cityCode: CityCode, id: string): Promise<MarketingRuleRevision | null> {
    const [rows] = await connection.query<RuleRow[]>(
      `SELECT * FROM marketing_rule_revisions WHERE city_code=? AND rule_revision_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, id],
    );
    return rows[0] ? mapRuleRevision(rows[0]) : null;
  }

  async nextRuleRevision(connection: PoolConnection, cityCode: CityCode, campaignId: string): Promise<number> {
    const [rows] = await connection.query<(RowDataPacket & { next_revision: number | string })[]>(
      `SELECT COALESCE(MAX(revision),0)+1 next_revision FROM marketing_rule_revisions
       WHERE city_code=? AND marketing_campaign_id=?`, [cityCode, campaignId],
    );
    return number(rows[0]?.next_revision ?? 1);
  }

  async findRuleCreateReplay(connection: PoolConnection, cityCode: CityCode, campaignId: string, hash: string): Promise<{
    rule: MarketingRuleRevision; requestFingerprint: string;
  } | null> {
    const [rows] = await connection.query<RuleRow[]>(
      `SELECT * FROM marketing_rule_revisions WHERE city_code=? AND marketing_campaign_id=?
       AND create_idempotency_key_hash=? LIMIT 1 FOR UPDATE`, [cityCode, campaignId, hash],
    );
    return rows[0] ? { rule: mapRuleRevision(rows[0]), requestFingerprint: rows[0].create_request_fingerprint } : null;
  }

  async insertRuleRevision(connection: PoolConnection, input: {
    id: string; cityCode: CityCode; campaignId: string; revision: number; allowedSkuIds: string[];
    contentHash: string; actorId: string; idempotencyHash: string; requestFingerprint: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO marketing_rule_revisions
       (rule_revision_id,marketing_campaign_id,city_code,revision,status,allowed_sku_ids_json,
        content_hash,create_idempotency_key_hash,create_request_fingerprint,created_by)
       VALUES (?,?,?,?,'draft',?,?,?,?,?)`,
      [input.id, input.campaignId, input.cityCode, input.revision, JSON.stringify(input.allowedSkuIds),
        input.contentHash, input.idempotencyHash, input.requestFingerprint, input.actorId],
    );
  }

  async countEnabledSkus(connection: PoolConnection, cityCode: CityCode, skuIds: string[]): Promise<number> {
    if (skuIds.length === 0) return 0;
    const placeholders = skuIds.map(() => "?").join(",");
    const [rows] = await connection.query<(RowDataPacket & { matched: number | string })[]>(
      `SELECT COUNT(*) matched FROM service_skus
       WHERE city_code=? AND is_enabled=1 AND sku_id IN (${placeholders})`, [cityCode, ...skuIds],
    );
    return number(rows[0]?.matched ?? 0);
  }

  async updateRuleState(connection: PoolConnection, input: {
    cityCode: CityCode; id: string; version: number; status: MarketingRuleRevision["status"]; actorId: string;
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE marketing_rule_revisions
       SET status=?, reviewed_by=CASE WHEN ?='reviewed' THEN ? ELSE reviewed_by END,
           reviewed_at=CASE WHEN ?='reviewed' THEN CURRENT_TIMESTAMP(3) ELSE reviewed_at END,
           published_by=CASE WHEN ?='published' THEN ? ELSE published_by END,
           published_at=CASE WHEN ?='published' THEN CURRENT_TIMESTAMP(3) ELSE published_at END,
           version=version+1
       WHERE city_code=? AND rule_revision_id=? AND version=?`,
      [input.status, input.status, input.actorId, input.status, input.status, input.actorId,
        input.status, input.cityCode, input.id, input.version],
    );
    return result.affectedRows === 1;
  }

  async listDefinitions(context: RequestContext, cityCode: CityCode): Promise<CouponDefinition[]> {
    this.assertContext(context, cityCode);
    const [rows] = await this.pool.query<DefinitionRow[]>(
      `SELECT * FROM coupon_definitions WHERE city_code=? ORDER BY created_at DESC LIMIT 500`, [cityCode],
    );
    return rows.map(mapDefinition);
  }

  async findDefinitionForUpdate(connection: PoolConnection, cityCode: CityCode, id: string): Promise<CouponDefinition | null> {
    const [rows] = await connection.query<DefinitionRow[]>(
      `SELECT * FROM coupon_definitions WHERE city_code=? AND coupon_definition_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, id],
    );
    return rows[0] ? mapDefinition(rows[0]) : null;
  }

  async findDefinitionCreateReplay(connection: PoolConnection, cityCode: CityCode, actorId: string, hash: string): Promise<{
    definition: CouponDefinition; requestFingerprint: string;
  } | null> {
    const [rows] = await connection.query<DefinitionRow[]>(
      `SELECT * FROM coupon_definitions WHERE city_code=? AND created_by=?
       AND create_idempotency_key_hash=? LIMIT 1 FOR UPDATE`, [cityCode, actorId, hash],
    );
    return rows[0] ? { definition: mapDefinition(rows[0]), requestFingerprint: rows[0].create_request_fingerprint } : null;
  }

  async insertDefinition(connection: PoolConnection, input: {
    id: string; cityCode: CityCode; campaignId: string; ruleRevisionId: string; name: string;
    faceValueMinor: number; minSpendMinor: number; issuanceCap: number; compensationCap: number;
    validFrom: Date; validUntil: Date; actorId: string; idempotencyHash: string; requestFingerprint: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO coupon_definitions
       (coupon_definition_id,marketing_campaign_id,rule_revision_id,city_code,name,status,currency,
        face_value_minor,min_spend_minor,issuance_cap,compensation_cap,valid_from,valid_until,
        create_idempotency_key_hash,create_request_fingerprint,created_by)
       VALUES (?,?,?,?,?,'draft','CNY',?,?,?,?,?,?,?,?,?)`,
      [input.id, input.campaignId, input.ruleRevisionId, input.cityCode, input.name,
        input.faceValueMinor, input.minSpendMinor, input.issuanceCap, input.compensationCap,
        input.validFrom, input.validUntil, input.idempotencyHash, input.requestFingerprint, input.actorId],
    );
  }

  async updateDefinitionState(connection: PoolConnection, input: {
    cityCode: CityCode; id: string; version: number; status: CouponDefinition["status"];
  }): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_definitions SET status=?,version=version+1
       WHERE city_code=? AND coupon_definition_id=? AND version=?`,
      [input.status, input.cityCode, input.id, input.version],
    );
    return result.affectedRows === 1;
  }

  async listGrants(context: RequestContext, cityCode: CityCode, customerId?: string): Promise<CouponGrant[]> {
    this.assertContext(context, cityCode);
    const params: unknown[] = [cityCode];
    const customer = customerId ? " AND customer_id=?" : "";
    if (customerId) params.push(customerId);
    const [rows] = await this.pool.query<GrantRow[]>(
      `SELECT * FROM coupon_grants WHERE city_code=?${customer} ORDER BY created_at DESC LIMIT 500`, params,
    );
    return rows.map(mapGrant);
  }

  async listCustomerGrants(
    context: RequestContext,
    cityCode: CityCode,
    customerId: string,
    status?: CouponGrant["status"],
  ): Promise<CouponGrant[]> {
    this.assertContext(context, cityCode);
    const statusPredicate = status
      ? ` AND status=?${status === "available" ? " AND expires_at>CURRENT_TIMESTAMP(3)" : ""}`
      : "";
    const params: unknown[] = status ? [cityCode, customerId, status] : [cityCode, customerId];
    const [rows] = await this.pool.query<GrantRow[]>(
      `SELECT * FROM coupon_grants
       WHERE city_code=? AND customer_id=?${statusPredicate}
       ORDER BY created_at DESC LIMIT 500`,
      params,
    );
    return rows.map(mapGrant);
  }

  async findGrantForUpdate(connection: PoolConnection, cityCode: CityCode, id: string): Promise<CouponGrant | null> {
    const [rows] = await connection.query<GrantRow[]>(
      `SELECT * FROM coupon_grants WHERE city_code=? AND coupon_grant_id=? LIMIT 1 FOR UPDATE`, [cityCode, id],
    );
    return rows[0] ? mapGrant(rows[0]) : null;
  }

  async findGrantReplay(connection: PoolConnection, cityCode: CityCode, actorId: string, hash: string): Promise<{
    grant: CouponGrant; requestFingerprint: string;
  } | null> {
    const [rows] = await connection.query<GrantRow[]>(
      `SELECT * FROM coupon_grants WHERE city_code=? AND created_by=? AND idempotency_key_hash=?
       LIMIT 1 FOR UPDATE`, [cityCode, actorId, hash],
    );
    return rows[0] ? { grant: mapGrant(rows[0]), requestFingerprint: rows[0].request_fingerprint } : null;
  }

  async incrementIssuance(connection: PoolConnection, cityCode: CityCode, definitionId: string, expectedVersion: number): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_definitions SET issued_count=issued_count+1,version=version+1
       WHERE city_code=? AND coupon_definition_id=? AND version=? AND status='active'
         AND issued_count<issuance_cap`, [cityCode, definitionId, expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async customerExists(connection: PoolConnection, customerId: string): Promise<boolean> {
    const [rows] = await connection.query<(RowDataPacket & { found: number })[]>(
      `SELECT 1 found FROM customers WHERE id=? LIMIT 1`, [customerId],
    );
    return rows.length === 1;
  }

  async insertGrant(connection: PoolConnection, input: {
    id: string; cityCode: CityCode; definition: CouponDefinition; customerId: string;
    issuanceReason: CouponGrant["issuanceReason"]; issuanceRef: string; expiresAt: Date;
    actorId: string; idempotencyHash: string; requestFingerprint: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO coupon_grants
       (coupon_grant_id,coupon_definition_id,marketing_campaign_id,rule_revision_id,city_code,
        customer_id,status,issuance_reason,issuance_ref,available_at,expires_at,
        idempotency_key_hash,request_fingerprint,created_by)
       VALUES (?,?,?,?,?,?,'available',?,?,CURRENT_TIMESTAMP(3),?,?,?,?)`,
      [input.id, input.definition.couponDefinitionId, input.definition.marketingCampaignId,
        input.definition.ruleRevisionId, input.cityCode, input.customerId, input.issuanceReason,
        input.issuanceRef, input.expiresAt, input.idempotencyHash, input.requestFingerprint, input.actorId],
    );
  }

  async revokeGrant(connection: PoolConnection, cityCode: CityCode, id: string, version: number): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_grants SET status='revoked',version=version+1
       WHERE city_code=? AND coupon_grant_id=? AND version=? AND status IN ('granted','available','released')`,
      [cityCode, id, version],
    );
    return result.affectedRows === 1;
  }

  async loadDecisionEligibilityForUpdate(
    connection: PoolConnection, cityCode: CityCode, customerId: string, grantId: string,
  ): Promise<DecisionEligibility | null> {
    const [grantRows] = await connection.query<GrantRow[]>(
      `SELECT * FROM coupon_grants
       WHERE city_code=? AND customer_id=? AND coupon_grant_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, customerId, grantId],
    );
    const grantRow = grantRows[0];
    if (!grantRow) return null;
    const grant = mapGrant(grantRow);
    const [definitionRows] = await connection.query<DefinitionRow[]>(
      `SELECT * FROM coupon_definitions WHERE city_code=? AND coupon_definition_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, grant.couponDefinitionId],
    );
    const [ruleRows] = await connection.query<RuleRow[]>(
      `SELECT * FROM marketing_rule_revisions WHERE city_code=? AND rule_revision_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, grant.ruleRevisionId],
    );
    const [campaignRows] = await connection.query<CampaignRow[]>(
      `SELECT * FROM marketing_campaigns WHERE city_code=? AND marketing_campaign_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, grant.marketingCampaignId],
    );
    if (!definitionRows[0] || !ruleRows[0] || !campaignRows[0]) return null;
    const definition = mapDefinition(definitionRows[0]);
    const ruleRevision = mapRuleRevision(ruleRows[0]);
    const campaign = mapCampaign(campaignRows[0]);
    return { grant, definition, ruleRevision, campaign, ruleContentHash: ruleRows[0].content_hash };
  }

  async findCanonicalPublicQuote(connection: PoolConnection, input: {
    cityCode: CityCode; skuId: string;
  }): Promise<{
    priceRuleId: string; version: number; currency: string; unitAmountDecimal: string;
    canonicalQuote: NonNullable<Awaited<ReturnType<typeof loadCanonicalPublicPriceQuoteForUpdate>>>;
  } | null> {
    const quote = await loadCanonicalPublicPriceQuoteForUpdate(
      connection, input.cityCode, input.skuId,
    );
    return quote ? {
      priceRuleId: quote.rule.priceRuleId,
      version: quote.rule.version,
      currency: quote.rule.currency,
      unitAmountDecimal: quote.unitAmountDecimal,
      canonicalQuote: quote,
    } : null;
  }

  async findDecisionReplay(connection: PoolConnection, cityCode: CityCode, customerId: string, hash: string): Promise<{
    decision: MarketingDiscountDecision; requestFingerprint: string;
  } | null> {
    const [rows] = await connection.query<DecisionRow[]>(
      `SELECT * FROM marketing_discount_decisions WHERE city_code=? AND customer_id=?
       AND issue_idempotency_key_hash=? LIMIT 1 FOR UPDATE`, [cityCode, customerId, hash],
    );
    return rows[0] ? { decision: mapDecision(rows[0]), requestFingerprint: rows[0].request_fingerprint } : null;
  }

  async insertDecision(connection: PoolConnection, input: {
    id: string; cityCode: CityCode; customerId: string; skuId: string; quantity: number;
    priceRuleId: string; priceRuleVersion: number; eligibility: DecisionEligibility;
    grossAmountMinor: number; discountAmountMinor: number; netAmountMinor: number;
    requestFingerprint: string; idempotencyHash: string; expiresAt: Date;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO marketing_discount_decisions
       (discount_decision_id,city_code,customer_id,sku_id,quantity,price_rule_id,price_rule_version,
        rule_revision_id,rule_content_hash,coupon_definition_id,coupon_grant_id,currency,gross_amount_minor,
        discount_amount_minor,net_amount_minor,request_fingerprint,issue_idempotency_key_hash,status,expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'CNY',?,?,?,?,?,'issued',?)`,
      [input.id, input.cityCode, input.customerId, input.skuId, input.quantity, input.priceRuleId,
        input.priceRuleVersion, input.eligibility.ruleRevision.ruleRevisionId,
        input.eligibility.ruleContentHash,
        input.eligibility.definition.couponDefinitionId, input.eligibility.grant.couponGrantId,
        input.grossAmountMinor, input.discountAmountMinor, input.netAmountMinor,
        input.requestFingerprint, input.idempotencyHash, input.expiresAt],
    );
  }

  async findDecisionForUpdate(connection: PoolConnection, cityCode: CityCode, customerId: string, id: string): Promise<MarketingDiscountDecision | null> {
    const [rows] = await connection.query<DecisionRow[]>(
      `SELECT * FROM marketing_discount_decisions WHERE city_code=? AND customer_id=?
       AND discount_decision_id=? LIMIT 1 FOR UPDATE`, [cityCode, customerId, id],
    );
    return rows[0] ? mapDecision(rows[0]) : null;
  }

  async findAcceptedDecisionByOrderCommand(
    connection: PoolConnection, cityCode: CityCode, customerId: string, orderCommandKeyHash: string,
  ): Promise<MarketingDiscountDecision | null> {
    const [rows] = await connection.query<DecisionRow[]>(
      `SELECT * FROM marketing_discount_decisions
       WHERE city_code=? AND customer_id=? AND accepted_order_command_key_hash=? AND status='accepted'
       LIMIT 1 FOR UPDATE`, [cityCode, customerId, orderCommandKeyHash],
    );
    return rows[0] ? mapDecision(rows[0]) : null;
  }

  async findReservationByDecision(
    connection: PoolConnection, cityCode: CityCode, decisionId: string,
  ): Promise<CouponReservation | null> {
    const [rows] = await connection.query<ReservationRow[]>(
      `SELECT * FROM coupon_reservations WHERE city_code=? AND discount_decision_id=? LIMIT 1`,
      [cityCode, decisionId],
    );
    return rows[0] ? mapReservation(rows[0]) : null;
  }

  async findReservationForUpdate(
    connection: PoolConnection, cityCode: CityCode, reservationId: string,
  ): Promise<CouponReservation | null> {
    const [rows] = await connection.query<ReservationRow[]>(
      `SELECT * FROM coupon_reservations
       WHERE city_code=? AND coupon_reservation_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, reservationId],
    );
    return rows[0] ? mapReservation(rows[0]) : null;
  }

  async findRedemptionByReservationForUpdate(
    connection: PoolConnection, cityCode: CityCode, reservationId: string,
  ): Promise<CouponRedemption | null> {
    const [rows] = await connection.query<RedemptionRow[]>(
      `SELECT * FROM coupon_redemptions
       WHERE city_code=? AND coupon_reservation_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, reservationId],
    );
    return rows[0] ? mapRedemption(rows[0]) : null;
  }

  async orderHasMarketingAcceptanceEvidenceForUpdate(
    connection: PoolConnection, reservation: CouponReservation,
  ): Promise<boolean> {
    const [orderRows] = await connection.query<(RowDataPacket & { found: number })[]>(
      `SELECT 1 found FROM orders
       WHERE city_code=? AND order_id=? AND customer_id=? LIMIT 1 FOR UPDATE`,
      [reservation.cityCode, reservation.orderId, reservation.customerId],
    );
    if (orderRows.length === 0) return false;
    const [snapshotRows] = await connection.query<(RowDataPacket & { quote_snapshot: unknown })[]>(
      `SELECT quote_snapshot FROM order_price_snapshots
       WHERE city_code=? AND order_id=? LIMIT 1 FOR UPDATE`,
      [reservation.cityCode, reservation.orderId],
    );
    if (!snapshotRows[0]) return false;
    const raw = snapshotRows[0].quote_snapshot;
    const snapshot = typeof raw === "string" ? JSON.parse(raw) as Record<string, unknown> : raw as Record<string, unknown>;
    const marketingDecision = snapshot?.marketingDecision;
    if (!marketingDecision || typeof marketingDecision !== "object") return false;
    const evidence = marketingDecision as Record<string, unknown>;
    return evidence.decisionId === reservation.discountDecisionId
      || evidence.reservationId === reservation.couponReservationId;
  }

  async releaseExpiredReservation(
    connection: PoolConnection,
    reservation: CouponReservation,
    reason: string,
    now: Date,
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_reservations
       SET status='released',released_reason=?,version=version+1
       WHERE city_code=? AND coupon_reservation_id=? AND status='active' AND version=?
         AND expires_at<=?`,
      [reason, reservation.cityCode, reservation.couponReservationId, reservation.version, now],
    );
    return result.affectedRows === 1;
  }

  async transitionGrantForExpiredReservation(
    connection: PoolConnection,
    cityCode: CityCode,
    grantId: string,
    expectedVersion: number,
    from: "reserved" | "released",
    to: "released" | "available",
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_grants SET status=?,version=version+1
       WHERE city_code=? AND coupon_grant_id=? AND status=? AND version=?`,
      [to, cityCode, grantId, from, expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async rejectDecisionForExpiredReservation(
    connection: PoolConnection,
    decision: MarketingDiscountDecision,
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE marketing_discount_decisions SET status='rejected',version=version+1
       WHERE city_code=? AND discount_decision_id=? AND customer_id=?
         AND status='issued' AND version=?`,
      [decision.cityCode, decision.discountDecisionId, decision.customerId, decision.version],
    );
    return result.affectedRows === 1;
  }

  async findRedemptionByDecision(
    connection: PoolConnection, cityCode: CityCode, decisionId: string,
  ): Promise<CouponRedemption | null> {
    const [rows] = await connection.query<RedemptionRow[]>(
      `SELECT * FROM coupon_redemptions WHERE city_code=? AND discount_decision_id=? LIMIT 1`,
      [cityCode, decisionId],
    );
    return rows[0] ? mapRedemption(rows[0]) : null;
  }

  async loadCompensationSourceForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    orderId: string,
  ): Promise<CompensationSourceEvidence | null> {
    const [redemptionRows] = await connection.query<RedemptionRow[]>(
      `SELECT * FROM coupon_redemptions
       WHERE city_code=? AND order_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, orderId],
    );
    const redemptionRow = redemptionRows[0];
    if (!redemptionRow) return null;
    const redemption = mapRedemption(redemptionRow);
    const eligibility = await this.loadDecisionEligibilityForUpdate(
      connection,
      cityCode,
      redemption.customerId,
      redemption.couponGrantId,
    );
    if (!eligibility) return null;
    const [orderRows] = await connection.query<(RowDataPacket & {
      total_amount_decimal: string;
      status: string;
      customer_id: string;
    })[]>(
      `SELECT CAST(total_amount AS CHAR) AS total_amount_decimal,status,customer_id
       FROM orders WHERE city_code=? AND order_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, orderId],
    );
    const order = orderRows[0];
    if (!order || order.customer_id !== redemption.customerId) return null;
    return {
      ...eligibility,
      redemption,
      orderTotalDecimal: order.total_amount_decimal,
      orderStatus: order.status,
    };
  }

  async findCompensationByDeliveryForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    deliveryId: string,
  ): Promise<MarketingCompensationGrant | null> {
    const [rows] = await connection.query<CompensationRow[]>(
      `SELECT * FROM marketing_compensations
       WHERE city_code=? AND source_delivery_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, deliveryId],
    );
    return rows[0] ? mapCompensation(rows[0]) : null;
  }

  async findCompensationByTriggerForUpdate(
    connection: PoolConnection,
    input: {
      cityCode: CityCode;
      redemptionId: string;
      triggerType: MarketingCompensationGrant["triggerType"];
      triggerId: string;
    },
  ): Promise<MarketingCompensationGrant | null> {
    const [rows] = await connection.query<CompensationRow[]>(
      `SELECT * FROM marketing_compensations
       WHERE city_code=? AND source_coupon_redemption_id=? AND trigger_type=? AND trigger_id=?
       LIMIT 1 FOR UPDATE`,
      [input.cityCode, input.redemptionId, input.triggerType, input.triggerId],
    );
    return rows[0] ? mapCompensation(rows[0]) : null;
  }

  async incrementCompensationIssuance(
    connection: PoolConnection,
    cityCode: CityCode,
    definitionId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_definitions
       SET compensation_issued_count=compensation_issued_count+1,version=version+1
       WHERE city_code=? AND coupon_definition_id=? AND version=?
         AND compensation_issued_count<compensation_cap`,
      [cityCode, definitionId, expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async insertCompensation(
    connection: PoolConnection,
    input: {
      id: string;
      cityCode: CityCode;
      customerId: string;
      redemptionId: string;
      triggerType: MarketingCompensationGrant["triggerType"];
      triggerId: string;
      deliveryId: string;
      eventId: string;
      payloadHash: string;
      status: "pending" | "denied";
      amountMinor: number;
      decisionReason: string | null;
    },
  ): Promise<void> {
    await connection.query(
      `INSERT INTO marketing_compensations
       (compensation_id,city_code,customer_id,source_coupon_redemption_id,trigger_type,trigger_id,
        source_delivery_id,source_event_id,source_payload_hash,status,currency,amount_minor,decision_reason)
       VALUES (?,?,?,?,?,?,?,?,?,?,'CNY',?,?)`,
      [input.id, input.cityCode, input.customerId, input.redemptionId, input.triggerType,
        input.triggerId, input.deliveryId, input.eventId, input.payloadHash, input.status,
        input.amountMinor, input.decisionReason],
    );
  }

  async markCompensationGranted(
    connection: PoolConnection,
    cityCode: CityCode,
    compensationId: string,
    grantId: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE marketing_compensations
       SET status='granted',resulting_coupon_grant_id=?,expires_at=?,version=version+1
       WHERE city_code=? AND compensation_id=? AND status='pending' AND version=1`,
      [grantId, expiresAt, cityCode, compensationId],
    );
    return result.affectedRows === 1;
  }

  async findCompensationForUpdate(
    connection: PoolConnection,
    cityCode: CityCode,
    compensationId: string,
  ): Promise<MarketingCompensationGrant | null> {
    const [rows] = await connection.query<CompensationRow[]>(
      `SELECT * FROM marketing_compensations
       WHERE city_code=? AND compensation_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, compensationId],
    );
    return rows[0] ? mapCompensation(rows[0]) : null;
  }

  async reserveGrant(connection: PoolConnection, cityCode: CityCode, grantId: string, version: number): Promise<boolean> {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_grants SET status='reserved',version=version+1
       WHERE city_code=? AND coupon_grant_id=? AND version=? AND status='available'
         AND expires_at>CURRENT_TIMESTAMP(3)`, [cityCode, grantId, version],
    );
    return result.affectedRows === 1;
  }

  async insertReservation(connection: PoolConnection, input: {
    id: string; decision: MarketingDiscountDecision; orderId: string; expiresAt: Date;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO coupon_reservations
       (coupon_reservation_id,coupon_grant_id,discount_decision_id,order_id,city_code,customer_id,
        status,currency,discount_amount_minor,expires_at)
       VALUES (?,?,?,?,?,?,'active','CNY',?,?)`,
      [input.id, input.decision.couponGrantId, input.decision.discountDecisionId, input.orderId,
        input.decision.cityCode, input.decision.customerId, input.decision.discountAmountMinor, input.expiresAt],
    );
  }

  async redeemAcceptance(connection: PoolConnection, input: {
    decision: MarketingDiscountDecision; grantVersionAfterReserve: number; reservationId: string;
    orderId: string; orderCommandKeyHash: string; redemptionId: string; now: Date;
  }): Promise<boolean> {
    const [reservation] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_reservations SET status='redeemed',version=version+1
       WHERE city_code=? AND coupon_reservation_id=? AND status='active' AND version=1`,
      [input.decision.cityCode, input.reservationId],
    );
    const [grant] = await connection.query<ResultSetHeader>(
      `UPDATE coupon_grants SET status='redeemed',version=version+1
       WHERE city_code=? AND coupon_grant_id=? AND status='reserved' AND version=?`,
      [input.decision.cityCode, input.decision.couponGrantId, input.grantVersionAfterReserve],
    );
    const [decision] = await connection.query<ResultSetHeader>(
      `UPDATE marketing_discount_decisions
       SET status='accepted',accepted_order_id=?,accepted_order_command_key_hash=?,accepted_at=?,version=version+1
       WHERE city_code=? AND discount_decision_id=? AND status='issued' AND version=?
         AND expires_at>CURRENT_TIMESTAMP(3)`,
      [input.orderId, input.orderCommandKeyHash, input.now, input.decision.cityCode,
        input.decision.discountDecisionId, input.decision.version],
    );
    if (reservation.affectedRows !== 1 || grant.affectedRows !== 1 || decision.affectedRows !== 1) return false;
    await connection.query(
      `INSERT INTO coupon_redemptions
       (coupon_redemption_id,coupon_reservation_id,coupon_grant_id,discount_decision_id,order_id,
        city_code,customer_id,currency,discount_amount_minor,redeemed_at)
       VALUES (?,?,?,?,?,?,?,'CNY',?,?)`,
      [input.redemptionId, input.reservationId, input.decision.couponGrantId,
        input.decision.discountDecisionId, input.orderId, input.decision.cityCode,
        input.decision.customerId, input.decision.discountAmountMinor, input.now],
    );
    return true;
  }

  async insertAudit(connection: PoolConnection, audit: MarketingAuditRecord): Promise<void> {
    await connection.query(
      `INSERT INTO marketing_audit_records
       (marketing_audit_id,city_code,aggregate_type,aggregate_id,action,actor_id,actor_role,
        reason,expected_version,actual_version,trace_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [audit.marketingAuditId, audit.cityCode, audit.aggregateType, audit.aggregateId, audit.action,
        audit.actorId, audit.actorRole, audit.reason, audit.expectedVersion, audit.actualVersion,
        audit.traceId, new Date(audit.createdAt)],
    );
  }

  async listAudits(context: RequestContext, cityCode: CityCode, limit = 200): Promise<MarketingAuditRecord[]> {
    this.assertContext(context, cityCode);
    const [rows] = await this.pool.query<AuditRow[]>(
      `SELECT * FROM marketing_audit_records WHERE city_code=? ORDER BY created_at DESC LIMIT ?`,
      [cityCode, Math.max(1, Math.min(500, limit))],
    );
    return rows.map(mapAudit);
  }
}

export const marketingRepository = new MarketingRepository();
