import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import { adminAuthHeaders, bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const nonce = `${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const adminCreatorId = `p29_creator_${nonce}`;
const adminReviewerId = `p29_reviewer_${nonce}`;
const adminPublisherId = `p29_publisher_${nonce}`;
const customerId = `p29_customer_${nonce}`;
const adminCreator = adminAuthHeaders(adminCreatorId, "hangzhou", "admin");
const adminReviewer = adminAuthHeaders(adminReviewerId, "hangzhou", "admin");
const adminPublisher = adminAuthHeaders(adminPublisherId, "hangzhou", "admin");
const customer = bearerHeaders({ appType: "customer", role: "customer", userId: customerId, cityCode: "hangzhou" });

type FixtureIds = {
  campaignId?: string;
  ruleRevisionId?: string;
  definitionId?: string;
  grantId?: string;
  decisionId?: string;
  reservationId?: string;
  redemptionId?: string;
  orderId?: string;
};

const ids: FixtureIds = {};

function expectOk(response: { statusCode: number; body: string; json(): unknown }): Record<string, any> {
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as Record<string, any>;
}

async function scalarCount(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { count: number | string })[]>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function deleteByIds(table: string, column: string, values: Array<string | undefined>): Promise<void> {
  const filtered = values.filter((value): value is string => Boolean(value));
  if (filtered.length === 0) return;
  const placeholders = filtered.map(() => "?").join(",");
  await getMysqlPool().query(`DELETE FROM ${table} WHERE ${column} IN (${placeholders})`, filtered);
}

describe.skipIf(!runDb)("Phase29 Marketing/Coupon real database Order lifecycle", { timeout: 120_000 }, () => {
  let app: FastifyInstance;
  let skuId: string;

  beforeAll(async () => {
    await runMigrations();
    const pool = getMysqlPool();
    const [skus] = await pool.query<(RowDataPacket & { sku_id: string })[]>(
      `SELECT s.sku_id
         FROM service_skus s
         INNER JOIN price_rules p ON p.city_code=s.city_code AND p.sku_id=s.sku_id
        WHERE s.city_code='hangzhou' AND s.is_enabled=1 AND p.is_enabled=1
          AND s.sku_id NOT LIKE 'demo%'
        ORDER BY s.sku_id LIMIT 1`,
    );
    if (!skus[0]) throw new Error("Phase29 integration requires one enabled Hangzhou public SKU");
    skuId = skus[0].sku_id;

    await pool.query(
      "INSERT INTO customers(id,phone,name) VALUES(?,?,?)",
      [customerId, `139${String(Date.now()).slice(-8)}`, `Phase29 ${nonce}`],
    );
    for (const adminId of [adminCreatorId, adminReviewerId, adminPublisherId]) {
      await pool.query(
        "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,'admin',JSON_ARRAY('hangzhou'))",
        [adminId, adminId],
      );
      await pool.query(
        "INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,'hangzhou')",
        [adminId],
      );
    }
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    const aggregateIds = [
      ids.orderId, ids.decisionId, ids.reservationId, ids.redemptionId,
      ids.grantId, ids.definitionId, ids.ruleRevisionId, ids.campaignId,
    ];
    await deleteByIds("event_outbox", "aggregate_id", aggregateIds);
    await getMysqlPool().query(
      "DELETE FROM marketing_audit_records WHERE actor_id IN (?,?,?,?)",
      [adminCreatorId, adminReviewerId, adminPublisherId, customerId],
    );
    await getMysqlPool().query("DELETE FROM marketing_compensations WHERE customer_id=?", [customerId]);
    await getMysqlPool().query("DELETE FROM coupon_redemptions WHERE customer_id=?", [customerId]);
    await getMysqlPool().query("DELETE FROM coupon_reservations WHERE customer_id=?", [customerId]);
    await deleteByIds("order_price_snapshots", "order_id", [ids.orderId]);
    await getMysqlPool().query("DELETE FROM orders WHERE customer_id=?", [customerId]);
    await getMysqlPool().query("DELETE FROM marketing_discount_decisions WHERE customer_id=?", [customerId]);
    await getMysqlPool().query("DELETE FROM coupon_grants WHERE customer_id=?", [customerId]);
    await deleteByIds("coupon_definitions", "coupon_definition_id", [ids.definitionId]);
    if (ids.campaignId) {
      await getMysqlPool().query(
        "UPDATE marketing_campaigns SET active_rule_revision_id=NULL WHERE marketing_campaign_id=?",
        [ids.campaignId],
      );
    }
    await deleteByIds("marketing_rule_revisions", "rule_revision_id", [ids.ruleRevisionId]);
    await deleteByIds("marketing_campaigns", "marketing_campaign_id", [ids.campaignId]);
    await getMysqlPool().query(
      "DELETE FROM admin_city_scopes WHERE admin_user_id IN (?,?,?)",
      [adminCreatorId, adminReviewerId, adminPublisherId],
    );
    await getMysqlPool().query(
      "DELETE FROM admin_users WHERE id IN (?,?,?)",
      [adminCreatorId, adminReviewerId, adminPublisherId],
    );
    await getMysqlPool().query("DELETE FROM customers WHERE id=?", [customerId]);
  });

  it("closes three-Admin governance, coupon issuance, atomic redemption and Order replay", async () => {
    const clock = Date.now();
    const startAt = new Date(clock - 60 * 60 * 1000).toISOString();
    const endAt = new Date(clock + 24 * 60 * 60 * 1000).toISOString();
    const couponExpiresAt = new Date(clock + 12 * 60 * 60 * 1000).toISOString();

    const campaign = expectOk(await app.inject({
      method: "POST",
      url: "/api/admin/marketing/campaigns",
      headers: adminCreator,
      payload: {
        name: `Phase29 lifecycle ${nonce}`,
        startAt,
        endAt,
        idempotencyKey: `p29-campaign-${nonce}`,
      },
    })).campaign;
    ids.campaignId = campaign.marketingCampaignId;
    expect(campaign).toMatchObject({ cityCode: "hangzhou", status: "draft", version: 1 });

    const reviewedCampaign = expectOk(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/campaigns/${ids.campaignId}/review`,
      headers: adminReviewer,
      payload: { expectedVersion: 1, reason: "independent campaign review" },
    })).campaign;
    expect(reviewedCampaign).toMatchObject({ status: "reviewed", reviewedBy: adminReviewerId, version: 2 });

    const draftRule = expectOk(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/campaigns/${ids.campaignId}/rule-revisions`,
      headers: adminCreator,
      payload: { allowedSkuIds: [skuId], idempotencyKey: `p29-rule-${nonce}` },
    })).ruleRevision;
    ids.ruleRevisionId = draftRule.ruleRevisionId;
    expect(draftRule).toMatchObject({ status: "draft", createdBy: adminCreatorId, version: 1 });

    const selfReview = await app.inject({
      method: "POST",
      url: `/api/admin/marketing/rule-revisions/${ids.ruleRevisionId}/review`,
      headers: adminCreator,
      payload: { expectedVersion: 1, reason: "must be rejected" },
    });
    expect(selfReview.statusCode, selfReview.body).toBe(409);

    const reviewedRule = expectOk(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/rule-revisions/${ids.ruleRevisionId}/review`,
      headers: adminReviewer,
      payload: { expectedVersion: 1, reason: "independent rule review" },
    })).ruleRevision;
    expect(reviewedRule).toMatchObject({ status: "reviewed", reviewedBy: adminReviewerId, version: 2 });

    const publishedRule = expectOk(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/rule-revisions/${ids.ruleRevisionId}/publish`,
      headers: adminPublisher,
      payload: { expectedVersion: 2, reason: "third Admin publication" },
    })).ruleRevision;
    expect(publishedRule).toMatchObject({ status: "published", publishedBy: adminPublisherId, version: 3 });
    expect(publishedRule.ruleContentHash ?? publishedRule.contentHash).toBeUndefined();

    const scheduled = expectOk(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/campaigns/${ids.campaignId}/schedule`,
      headers: adminPublisher,
      payload: {
        ruleRevisionId: ids.ruleRevisionId,
        expectedVersion: 2,
        reason: "approved schedule",
      },
    })).campaign;
    expect(scheduled).toMatchObject({ status: "scheduled", activeRuleRevisionId: ids.ruleRevisionId, version: 3 });

    const activeCampaign = expectOk(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/campaigns/${ids.campaignId}/status`,
      headers: adminPublisher,
      payload: { status: "active", expectedVersion: 3, reason: "activate approved campaign" },
    })).campaign;
    expect(activeCampaign).toMatchObject({ status: "active", version: 4 });

    const definition = expectOk(await app.inject({
      method: "POST",
      url: "/api/admin/marketing/coupon-definitions",
      headers: adminCreator,
      payload: {
        marketingCampaignId: ids.campaignId,
        ruleRevisionId: ids.ruleRevisionId,
        name: `10 yuan ${nonce}`,
        allowedSkuIds: [skuId],
        currency: "CNY",
        faceValueMinor: 1_000,
        minSpendMinor: 1_001,
        issuanceCap: 2,
        compensationCap: 2,
        validFrom: startAt,
        validUntil: endAt,
        idempotencyKey: `p29-definition-${nonce}`,
      },
    })).couponDefinition;
    ids.definitionId = definition.couponDefinitionId;
    expect(definition).toMatchObject({ status: "draft", issuedCount: 0, faceValueMinor: 1_000, version: 1 });

    const activeDefinition = expectOk(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/coupon-definitions/${ids.definitionId}/status`,
      headers: adminPublisher,
      payload: { status: "active", expectedVersion: 1, reason: "activate finite coupon" },
    })).couponDefinition;
    expect(activeDefinition).toMatchObject({ status: "active", version: 2 });

    const grant = expectOk(await app.inject({
      method: "POST",
      url: "/api/admin/marketing/coupon-grants",
      headers: adminPublisher,
      payload: {
        couponDefinitionId: ids.definitionId,
        customerId,
        issuanceReason: "admin_manual",
        issuanceRef: `approval-${nonce}`,
        expiresAt: couponExpiresAt,
        reason: "approved integration grant",
        idempotencyKey: `p29-grant-${nonce}`,
      },
    })).couponGrant;
    ids.grantId = grant.couponGrantId;
    expect(grant).toMatchObject({ customerId, cityCode: "hangzhou", status: "available", version: 1 });

    const issuePayload = {
      skuId,
      quantity: 1,
      selectedCouponGrantId: ids.grantId,
      idempotencyKey: `p29-decision-${nonce}`,
    };
    const decisionResponse = expectOk(await app.inject({
      method: "POST",
      url: "/api/customer/marketing/discount-decisions",
      headers: customer,
      payload: issuePayload,
    }));
    const decision = decisionResponse.discountDecision;
    ids.decisionId = decision.discountDecisionId;
    expect(decision).toMatchObject({
      customerId,
      skuId,
      quantity: 1,
      currency: "CNY",
      status: "issued",
      discountAmountMinor: 1_000,
      version: 1,
    });
    expect(decision.netAmountMinor).toBe(decision.grossAmountMinor - 1_000);

    const decisionReplay = expectOk(await app.inject({
      method: "POST",
      url: "/api/customer/marketing/discount-decisions",
      headers: customer,
      payload: issuePayload,
    })).discountDecision;
    expect(decisionReplay.discountDecisionId).toBe(ids.decisionId);
    expect(await scalarCount(
      "SELECT COUNT(*) count FROM marketing_discount_decisions WHERE city_code='hangzhou' AND customer_id=?",
      [customerId],
    )).toBe(1);

    const orderPayload = {
      skuId,
      quantity: 1,
      addressProvince: "浙江省",
      addressCity: "杭州市",
      addressDistrict: "西湖区",
      detailAddress: "Phase29 集成测试地址 1 号",
      contactName: "Phase29 用户",
      contactPhone: "13800000000",
      scheduledAt: new Date(clock + 2 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledTimeSlot: "morning",
      discountDecisionId: ids.decisionId,
      discountDecisionRevision: decision.version,
      orderIdempotencyKey: `p29-order-${nonce}`,
    };
    const order = expectOk(await app.inject({
      method: "POST", url: "/api/orders", headers: customer, payload: orderPayload,
    })).order;
    ids.orderId = order.orderId;
    ids.reservationId = order.quoteSnapshot.marketingDecision.reservationId;
    ids.redemptionId = order.quoteSnapshot.marketingDecision.redemptionId;
    expect(order).toMatchObject({
      customerId,
      totalAmount: decision.netAmountMinor / 100,
      quoteSnapshot: {
        pricingSource: "marketing",
        grossAmountMinor: decision.grossAmountMinor,
        discountAmountMinor: decision.discountAmountMinor,
        netAmountMinor: decision.netAmountMinor,
        marketingDecision: {
          decisionId: ids.decisionId,
          decisionRevision: 2,
          ruleRevisionId: ids.ruleRevisionId,
          ruleContentHash: decision.ruleContentHash,
          grantId: ids.grantId,
          reservationId: ids.reservationId,
          redemptionId: ids.redemptionId,
          requestFingerprint: decision.requestFingerprint,
        },
      },
    });

    const replayOrder = expectOk(await app.inject({
      method: "POST", url: "/api/orders", headers: customer, payload: orderPayload,
    })).order;
    expect(replayOrder.orderId).toBe(ids.orderId);

    const beforeConflict = {
      orders: await scalarCount("SELECT COUNT(*) count FROM orders WHERE customer_id=?", [customerId]),
      reservations: await scalarCount("SELECT COUNT(*) count FROM coupon_reservations WHERE customer_id=?", [customerId]),
      redemptions: await scalarCount("SELECT COUNT(*) count FROM coupon_redemptions WHERE customer_id=?", [customerId]),
      events: await scalarCount(
        "SELECT COUNT(*) count FROM event_outbox WHERE city_code='hangzhou' AND aggregate_id IN (?,?,?,?)",
        [ids.orderId, ids.decisionId, ids.reservationId, ids.redemptionId],
      ),
    };
    const conflictingOrder = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: customer,
      payload: { ...orderPayload, orderIdempotencyKey: `p29-order-conflict-${nonce}` },
    });
    expect(conflictingOrder.statusCode, conflictingOrder.body).toBe(409);
    expect({
      orders: await scalarCount("SELECT COUNT(*) count FROM orders WHERE customer_id=?", [customerId]),
      reservations: await scalarCount("SELECT COUNT(*) count FROM coupon_reservations WHERE customer_id=?", [customerId]),
      redemptions: await scalarCount("SELECT COUNT(*) count FROM coupon_redemptions WHERE customer_id=?", [customerId]),
      events: await scalarCount(
        "SELECT COUNT(*) count FROM event_outbox WHERE city_code='hangzhou' AND aggregate_id IN (?,?,?,?)",
        [ids.orderId, ids.decisionId, ids.reservationId, ids.redemptionId],
      ),
    }).toEqual(beforeConflict);

    const [facts] = await getMysqlPool().query<(RowDataPacket & {
      grant_status: string;
      decision_status: string;
      accepted_order_id: string;
      reservation_status: string;
      redemption_count: number | string;
      quote_snapshot: string | Record<string, unknown>;
    })[]>(
      `SELECT g.status grant_status,d.status decision_status,d.accepted_order_id,
              r.status reservation_status,COUNT(cr.coupon_redemption_id) redemption_count,
              ops.quote_snapshot
         FROM coupon_grants g
         INNER JOIN marketing_discount_decisions d
           ON d.city_code=g.city_code AND d.coupon_grant_id=g.coupon_grant_id
         INNER JOIN coupon_reservations r
           ON r.city_code=d.city_code AND r.discount_decision_id=d.discount_decision_id
         INNER JOIN coupon_redemptions cr
           ON cr.city_code=r.city_code AND cr.coupon_reservation_id=r.coupon_reservation_id
         INNER JOIN order_price_snapshots ops
           ON ops.city_code=r.city_code AND ops.order_id=r.order_id
        WHERE g.city_code='hangzhou' AND g.coupon_grant_id=?
        GROUP BY g.status,d.status,d.accepted_order_id,r.status,ops.quote_snapshot`,
      [ids.grantId],
    );
    expect(facts[0]).toMatchObject({
      grant_status: "redeemed",
      decision_status: "accepted",
      accepted_order_id: ids.orderId,
      reservation_status: "redeemed",
    });
    expect(Number(facts[0]?.redemption_count)).toBe(1);
    const storedSnapshot = typeof facts[0]?.quote_snapshot === "string"
      ? JSON.parse(facts[0].quote_snapshot) : facts[0]?.quote_snapshot;
    expect(storedSnapshot).toMatchObject({
      grossAmountMinor: decision.grossAmountMinor,
      discountAmountMinor: decision.discountAmountMinor,
      netAmountMinor: decision.netAmountMinor,
      marketingDecision: {
        decisionId: ids.decisionId,
        reservationId: ids.reservationId,
        redemptionId: ids.redemptionId,
      },
    });
    expect(await scalarCount(
      `SELECT COUNT(*) count FROM event_outbox
        WHERE city_code='hangzhou'
          AND ((event_type='marketing.discount.decision.issued' AND aggregate_id=?)
            OR (event_type='marketing.coupon.reserved' AND aggregate_id=?)
            OR (event_type='marketing.coupon.redeemed' AND aggregate_id=?)
            OR (event_type='order.created' AND aggregate_id=?))`,
      [ids.decisionId, ids.reservationId, ids.redemptionId, ids.orderId],
    )).toBe(4);
  });
});
