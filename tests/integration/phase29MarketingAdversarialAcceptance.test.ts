import { randomUUID } from "node:crypto";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import { platformDeliveryService } from "../../backend/src/events/platformDeliveryService.js";
import { canonicalPayloadHash } from "../../backend/src/events/platformEventCompatibility.js";
import { marketingService } from "../../backend/src/marketing/marketingService.js";
import { adminAuthHeaders, bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const nonce = `${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const cityCode = "hangzhou";
const adminId = `p29_adv_admin_${nonce}`;
const operatorId = `p29_adv_operator_${nonce}`;
const auditorId = `p29_adv_auditor_${nonce}`;
const customerIds = [0, 1, 2].map((index) => `p29_adv_c${index}_${nonce}`);
const admin = adminAuthHeaders(adminId, cityCode, "admin");
const operator = adminAuthHeaders(operatorId, cityCode, "operator");
const auditor = adminAuthHeaders(auditorId, cityCode, "auditor");
const customerHeaders = customerIds.map((userId) => bearerHeaders({
  appType: "customer", role: "customer", userId, cityCode,
}));
const worker = bearerHeaders({ appType: "worker", role: "worker", userId: `p29_adv_worker_${nonce}`, cityCode });

type JsonRecord = Record<string, any>;

function ok(response: LightMyRequestResponse): JsonRecord {
  expect(response.statusCode, response.body).toBe(200);
  return response.json() as JsonRecord;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { count: number | string })[]>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

describe.skipIf(!runDb)("Phase29 adversarial MySQL/HTTP acceptance", { timeout: 180_000 }, () => {
  let app: FastifyInstance;
  let skuId: string;
  let priceRuleId: string;
  let campaignId: string;
  let ruleRevisionId: string;
  let definitionId: string;
  let redeemedOrder: JsonRecord;
  const definitionIds: string[] = [];
  const fixtureFeeItemIds: string[] = [];
  const platformFixtureIds = {
    subscriberId: `p29_adv_sub_${nonce}`,
    subscriptionIds: [] as string[],
    subscriptionByEvent: new Map<string, string>(),
    deliveryIds: [] as string[],
    eventIds: [] as string[],
  };

  async function createDefinition(cap: number, label: string): Promise<string> {
    const clock = Date.now();
    const created = ok(await app.inject({
      method: "POST", url: "/api/admin/marketing/coupon-definitions", headers: admin,
      payload: {
        marketingCampaignId: campaignId,
        ruleRevisionId,
        name: `Adversarial ${label} ${nonce}`,
        allowedSkuIds: [skuId],
        currency: "CNY",
        faceValueMinor: 100,
        minSpendMinor: 101,
        issuanceCap: cap,
        compensationCap: 20,
        validFrom: new Date(clock - 60_000).toISOString(),
        validUntil: new Date(clock + 24 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: `p29-adv-def-${label}-${nonce}`,
      },
    })).couponDefinition;
    definitionIds.push(created.couponDefinitionId);
    ok(await app.inject({
      method: "POST",
      url: `/api/admin/marketing/coupon-definitions/${created.couponDefinitionId}/status`,
      headers: admin,
      payload: { status: "active", expectedVersion: 1, reason: "adversarial acceptance fixture" },
    }));
    return created.couponDefinitionId;
  }

  async function grant(customerIndex: number, label: string, targetDefinitionId = definitionId) {
    return ok(await app.inject({
      method: "POST", url: "/api/admin/marketing/coupon-grants", headers: admin,
      payload: {
        couponDefinitionId: targetDefinitionId,
        customerId: customerIds[customerIndex],
        issuanceReason: "admin_manual",
        issuanceRef: `p29-adv-${label}-${nonce}`,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        reason: "adversarial acceptance grant",
        idempotencyKey: `p29-adv-grant-${label}-${nonce}`,
      },
    })).couponGrant as JsonRecord;
  }

  async function decision(customerIndex: number, grantId: string, label: string) {
    return ok(await app.inject({
      method: "POST", url: "/api/customer/marketing/discount-decisions",
      headers: customerHeaders[customerIndex],
      payload: {
        skuId, quantity: 1, selectedCouponGrantId: grantId,
        idempotencyKey: `p29-adv-decision-${label}-${nonce}`,
      },
    })).discountDecision as JsonRecord;
  }

  function orderPayload(discountDecision: JsonRecord, label: string) {
    return {
      skuId,
      quantity: 1,
      addressProvince: "浙江省",
      addressCity: "杭州市",
      addressDistrict: "西湖区",
      detailAddress: `Phase29 adversarial address ${label}`,
      contactName: "Phase29 Customer",
      contactPhone: "13800000000",
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledTimeSlot: "morning",
      discountDecisionId: discountDecision.discountDecisionId,
      discountDecisionRevision: discountDecision.version,
      orderIdempotencyKey: `p29-adv-order-${label}-${nonce}`,
    };
  }

  function plainOrderPayload(label: string) {
    return {
      skuId,
      quantity: 1,
      addressProvince: "浙江省",
      addressCity: "杭州市",
      addressDistrict: "西湖区",
      detailAddress: `Phase29 recovery placeholder ${label}`,
      contactName: "Phase29 Customer",
      contactPhone: "13800000000",
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      scheduledTimeSlot: "afternoon",
    };
  }

  async function leaseCompensationClaim(
    eventType: "order.reverse.applied" | "refund.approved",
    payload: JsonRecord,
    label: string,
  ) {
    const subscriptionId = platformFixtureIds.subscriptionByEvent.get(eventType)
      ?? `p29_adv_subscription_${label}_${nonce}`;
    const eventId = `p29_adv_event_${label}_${nonce}`;
    const deliveryId = `p29_adv_delivery_${label}_${nonce}`;
    const revision = "marketing-compensation-v1";
    const aggregateType = eventType === "order.reverse.applied" ? "order_reverse" : "refund";
    const aggregateId = eventType === "order.reverse.applied" ? payload.reverseRequestId : payload.refundId;
    platformFixtureIds.eventIds.push(eventId);
    platformFixtureIds.deliveryIds.push(deliveryId);
    if (!platformFixtureIds.subscriptionByEvent.has(eventType)) {
      platformFixtureIds.subscriptionByEvent.set(eventType, subscriptionId);
      platformFixtureIds.subscriptionIds.push(subscriptionId);
      await getMysqlPool().query(
        `INSERT INTO platform_event_subscriptions
         (subscription_id,city_code,subscriber_id,event_type,event_major_version,
          compatibility_handler_revision,live_start_created_at,live_start_event_id,retention_class,status,
          lease_seconds,max_attempts,created_by_service_id,updated_by_service_id)
         VALUES (?,?,?,?,0,?,DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR),'fixture-live-start',
           'R2','active',30,3,'phase29-acceptance','phase29-acceptance')`,
        [subscriptionId, cityCode, platformFixtureIds.subscriberId, eventType, revision],
      );
    }
    await getMysqlPool().query(
      `INSERT INTO event_outbox
       (event_id,event_type,event_major_version,aggregate_type,aggregate_id,city_code,payload_json,status)
       VALUES (?,?,0,?,?,?,?,'pending')`,
      [eventId, eventType, aggregateType, aggregateId, cityCode, JSON.stringify(payload)],
    );
    await getMysqlPool().query(
      `INSERT INTO platform_event_deliveries
       (delivery_id,city_code,subscriber_id,subscription_id,event_id,event_type,event_major_version,
        payload_hash,aggregate_type,aggregate_id,status,max_attempts)
       VALUES (?,?,?,?,?,?,0,?,?,?,'pending',3)`,
      [deliveryId, cityCode, platformFixtureIds.subscriberId, subscriptionId, eventId, eventType,
        canonicalPayloadHash(payload), aggregateType, aggregateId],
    );
    const identity = {
      identityKind: "platform_service",
      credentialKind: "internal_domain_contract",
      serviceId: "phase29-acceptance",
      subscriberId: platformFixtureIds.subscriberId,
      cityCode,
    } as const;
    const claims = await platformDeliveryService.claim(identity, {
      subscriptionId, owner: `p29-adv-owner-${label}`, limit: 1,
    });
    expect(claims).toHaveLength(1);
    return { identity, claim: claims[0]! };
  }

  beforeAll(async () => {
    await runMigrations();
    const pool = getMysqlPool();
    const [skus] = await pool.query<(RowDataPacket & { sku_id: string; price_rule_id: string })[]>(
      `SELECT s.sku_id,p.price_rule_id
         FROM service_skus s
         INNER JOIN price_rules p ON p.city_code=s.city_code AND p.sku_id=s.sku_id
        WHERE s.city_code=? AND s.is_enabled=1 AND p.is_enabled=1
          AND s.sku_id NOT LIKE 'demo%'
        ORDER BY s.sku_id,p.version DESC LIMIT 1`,
      [cityCode],
    );
    if (!skus[0]) throw new Error("Phase29 adversarial acceptance requires an enabled public SKU");
    skuId = skus[0].sku_id;
    priceRuleId = skus[0].price_rule_id;

    for (const [index, customerId] of customerIds.entries()) {
      await pool.query("INSERT INTO customers(id,phone,name) VALUES(?,?,?)", [
        customerId, `137${String(Date.now() + index).slice(-8)}`, `P29 adversarial ${index}`,
      ]);
    }
    for (const [id, role] of [[adminId, "admin"], [operatorId, "operator"], [auditorId, "auditor"]] as const) {
      await pool.query(
        "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,?,JSON_ARRAY('hangzhou','shanghai'))",
        [id, id, role],
      );
      await pool.query(
        "INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,?),(?,?)",
        [id, cityCode, id, "shanghai"],
      );
    }
    app = await buildApp();
    await app.ready();
    await pool.query(
      `INSERT INTO platform_event_subscribers
       (subscriber_id,stable_name,owner_domain,handler_revision,purpose,max_pii_level,status,
        created_by_service_id,updated_by_service_id)
       VALUES (?,?, 'marketing','marketing-compensation-v1','Phase29 dormant acceptance','P1','active',
         'phase29-acceptance','phase29-acceptance')`,
      [platformFixtureIds.subscriberId, `phase29_adversarial_${nonce}`],
    );

    const clock = Date.now();
    const campaign = ok(await app.inject({
      method: "POST", url: "/api/admin/marketing/campaigns", headers: operator,
      payload: {
        name: `Phase29 adversarial ${nonce}`,
        startAt: new Date(clock - 60_000).toISOString(),
        endAt: new Date(clock + 48 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: `p29-adv-campaign-${nonce}`,
      },
    })).campaign;
    campaignId = campaign.marketingCampaignId;
    ok(await app.inject({
      method: "POST", url: `/api/admin/marketing/campaigns/${campaignId}/review`, headers: admin,
      payload: { expectedVersion: 1, reason: "independent fixture review" },
    }));
    const rule = ok(await app.inject({
      method: "POST", url: `/api/admin/marketing/campaigns/${campaignId}/rule-revisions`, headers: operator,
      payload: { allowedSkuIds: [skuId], idempotencyKey: `p29-adv-rule-${nonce}` },
    })).ruleRevision;
    ruleRevisionId = rule.ruleRevisionId;
    ok(await app.inject({
      method: "POST", url: `/api/admin/marketing/rule-revisions/${ruleRevisionId}/review`, headers: admin,
      payload: { expectedVersion: 1, reason: "independent fixture review" },
    }));
    // A distinct Admin identity is required to publish after review.
    const publisherId = `p29_adv_publisher_${nonce}`;
    await pool.query(
      "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,'admin',JSON_ARRAY('hangzhou'))",
      [publisherId, publisherId],
    );
    await pool.query("INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,?)", [publisherId, cityCode]);
    const publisher = adminAuthHeaders(publisherId, cityCode, "admin");
    ok(await app.inject({
      method: "POST", url: `/api/admin/marketing/rule-revisions/${ruleRevisionId}/publish`, headers: publisher,
      payload: { expectedVersion: 2, reason: "third identity fixture publication" },
    }));
    ok(await app.inject({
      method: "POST", url: `/api/admin/marketing/campaigns/${campaignId}/schedule`, headers: publisher,
      payload: { ruleRevisionId, expectedVersion: 2, reason: "fixture schedule" },
    }));
    ok(await app.inject({
      method: "POST", url: `/api/admin/marketing/campaigns/${campaignId}/status`, headers: publisher,
      payload: { status: "active", expectedVersion: 3, reason: "fixture activation" },
    }));
    definitionId = await createDefinition(100, "main");
  });

  afterAll(async () => {
    if (app) await app.close();
    const pool = getMysqlPool();
    if (fixtureFeeItemIds.length) {
      await pool.query(
        `DELETE FROM price_fee_items WHERE city_code=? AND fee_item_id IN (${fixtureFeeItemIds.map(() => "?").join(",")})`,
        [cityCode, ...fixtureFeeItemIds],
      );
    }
    await pool.query("UPDATE service_skus SET is_enabled=1 WHERE city_code=? AND sku_id=?", [cityCode, skuId]);
    await pool.query("UPDATE price_rules SET is_enabled=1 WHERE city_code=? AND price_rule_id=?", [cityCode, priceRuleId]);
    await pool.query("DELETE FROM marketing_audit_records WHERE actor_id LIKE ? OR trace_id LIKE ?", [`%${nonce}%`, `%${nonce}%`]);
    await pool.query("DELETE FROM marketing_compensations WHERE customer_id IN (?,?,?)", customerIds);
    if (platformFixtureIds.deliveryIds.length) {
      const placeholders = platformFixtureIds.deliveryIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM platform_event_delivery_attempts WHERE delivery_id IN (${placeholders})`, platformFixtureIds.deliveryIds);
      await pool.query(`DELETE FROM platform_event_deliveries WHERE delivery_id IN (${placeholders})`, platformFixtureIds.deliveryIds);
    }
    if (platformFixtureIds.subscriptionIds.length) {
      await pool.query(
        `DELETE FROM platform_event_subscriptions WHERE subscription_id IN (${platformFixtureIds.subscriptionIds.map(() => "?").join(",")})`,
        platformFixtureIds.subscriptionIds,
      );
    }
    await pool.query("DELETE FROM platform_event_subscribers WHERE subscriber_id=?", [platformFixtureIds.subscriberId]);
    if (platformFixtureIds.eventIds.length) {
      await pool.query(
        `DELETE FROM event_outbox WHERE event_id IN (${platformFixtureIds.eventIds.map(() => "?").join(",")})`,
        platformFixtureIds.eventIds,
      );
    }
    await pool.query("DELETE FROM event_outbox WHERE aggregate_id LIKE ?", [`%${nonce}%`]);
    await pool.query(
      `DELETE e FROM event_outbox e
       INNER JOIN marketing_discount_decisions d ON d.city_code=e.city_code AND d.discount_decision_id=e.aggregate_id
       WHERE d.customer_id IN (?,?,?)`,
      customerIds,
    );
    await pool.query(
      `DELETE e FROM event_outbox e
       INNER JOIN coupon_reservations r ON r.city_code=e.city_code AND r.coupon_reservation_id=e.aggregate_id
       WHERE r.customer_id IN (?,?,?)`,
      customerIds,
    );
    await pool.query(
      `DELETE e FROM event_outbox e
       INNER JOIN coupon_redemptions r ON r.city_code=e.city_code AND r.coupon_redemption_id=e.aggregate_id
       WHERE r.customer_id IN (?,?,?)`,
      customerIds,
    );
    await pool.query("DELETE FROM coupon_redemptions WHERE customer_id IN (?,?,?)", customerIds);
    await pool.query("DELETE FROM coupon_reservations WHERE customer_id IN (?,?,?)", customerIds);
    const [orders] = await pool.query<(RowDataPacket & { order_id: string })[]>(
      "SELECT order_id FROM orders WHERE customer_id IN (?,?,?)", customerIds,
    );
    if (orders.length) {
      const orderIds = orders.map((row) => row.order_id);
      const placeholders = orderIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM event_outbox WHERE aggregate_id IN (${placeholders})`, orderIds);
      await pool.query(`DELETE FROM order_price_snapshots WHERE order_id IN (${placeholders})`, orderIds);
    }
    await pool.query("DELETE FROM orders WHERE customer_id IN (?,?,?)", customerIds);
    await pool.query("DELETE FROM marketing_discount_decisions WHERE customer_id IN (?,?,?)", customerIds);
    await pool.query("DELETE FROM coupon_grants WHERE customer_id IN (?,?,?)", customerIds);
    if (definitionIds.length) {
      await pool.query(
        `DELETE FROM coupon_definitions WHERE coupon_definition_id IN (${definitionIds.map(() => "?").join(",")})`,
        definitionIds,
      );
    }
    if (campaignId) await pool.query("UPDATE marketing_campaigns SET active_rule_revision_id=NULL WHERE marketing_campaign_id=?", [campaignId]);
    if (ruleRevisionId) await pool.query("DELETE FROM marketing_rule_revisions WHERE rule_revision_id=?", [ruleRevisionId]);
    if (campaignId) await pool.query("DELETE FROM marketing_campaigns WHERE marketing_campaign_id=?", [campaignId]);
    await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id LIKE ?", [`%${nonce}%`]);
    await pool.query("DELETE FROM admin_users WHERE id LIKE ?", [`%${nonce}%`]);
    await pool.query("DELETE FROM customers WHERE id IN (?,?,?)", customerIds);
  });

  it("enforces final-unit issuance under concurrent HTTP requests", async () => {
    const capOneDefinition = await createDefinition(1, "last-unit");
    const requests = [0, 1].map((customerIndex) => app.inject({
      method: "POST", url: "/api/admin/marketing/coupon-grants", headers: admin,
      payload: {
        couponDefinitionId: capOneDefinition,
        customerId: customerIds[customerIndex],
        issuanceReason: "admin_manual",
        issuanceRef: `p29-adv-last-${customerIndex}-${nonce}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        reason: "last unit race",
        idempotencyKey: `p29-adv-last-${customerIndex}-${nonce}`,
      },
    }));
    const responses = await Promise.all(requests);
    expect(
      responses.map((response) => response.statusCode).sort(),
      responses.map((response) => response.body).join("\n"),
    ).toEqual([200, 409]);
    expect(await count("SELECT COUNT(*) count FROM coupon_grants WHERE coupon_definition_id=?", [capOneDefinition])).toBe(1);
    const [rows] = await getMysqlPool().query<(RowDataPacket & { issued_count: number | string })[]>(
      "SELECT issued_count FROM coupon_definitions WHERE coupon_definition_id=?", [capOneDefinition],
    );
    expect(Number(rows[0]?.issued_count)).toBe(1);
  });

  it("allows exactly one of two Orders to redeem the same grant", async () => {
    const coupon = await grant(0, "same-grant");
    // Issue both immutable decisions first. The acceptance race below, not
    // decision issuance, is the concurrency boundary under test.
    const leftDecision = await decision(0, coupon.couponGrantId, "same-grant-left");
    const rightDecision = await decision(0, coupon.couponGrantId, "same-grant-right");
    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/api/orders", headers: customerHeaders[0], payload: orderPayload(leftDecision, "same-left") }),
      app.inject({ method: "POST", url: "/api/orders", headers: customerHeaders[0], payload: orderPayload(rightDecision, "same-right") }),
    ]);
    expect(
      responses.map((response) => response.statusCode).sort(),
      responses.map((response) => response.body).join("\n"),
    ).toEqual([200, 409]);
    redeemedOrder = (responses.find((response) => response.statusCode === 200)!.json() as JsonRecord).order;
    expect(await count("SELECT COUNT(*) count FROM coupon_redemptions WHERE coupon_grant_id=?", [coupon.couponGrantId])).toBe(1);
    expect(await count(
      `SELECT COUNT(*) count FROM orders o
       INNER JOIN order_price_snapshots s ON s.city_code=o.city_code AND s.order_id=o.order_id
       WHERE o.customer_id=?
         AND JSON_UNQUOTE(JSON_EXTRACT(s.quote_snapshot,'$.marketingDecision.grantId'))=?`,
      [customerIds[0], coupon.couponGrantId],
    )).toBe(1);
  });

  it("keeps cross-city, cross-customer and role boundaries non-enumerable", async () => {
    const coupon = await grant(0, "scope");
    const missingId = `cgrant_missing_${nonce}`;
    const otherCustomer = await app.inject({
      method: "POST", url: "/api/customer/marketing/discount-decisions", headers: customerHeaders[1],
      payload: { skuId, quantity: 1, selectedCouponGrantId: coupon.couponGrantId, idempotencyKey: `cross-customer-${nonce}` },
    });
    const missing = await app.inject({
      method: "POST", url: "/api/customer/marketing/discount-decisions", headers: customerHeaders[1],
      payload: { skuId, quantity: 1, selectedCouponGrantId: missingId, idempotencyKey: `missing-${nonce}` },
    });
    const shanghaiCustomer = bearerHeaders({
      appType: "customer", role: "customer", userId: customerIds[0], cityCode: "shanghai",
    });
    const crossCity = await app.inject({
      method: "POST", url: "/api/customer/marketing/discount-decisions", headers: shanghaiCustomer,
      payload: { skuId, quantity: 1, selectedCouponGrantId: coupon.couponGrantId, idempotencyKey: `cross-city-${nonce}` },
    });
    expect([otherCustomer.statusCode, missing.statusCode, crossCity.statusCode]).toEqual([404, 404, 404]);
    expect(otherCustomer.json()).toEqual(missing.json());
    expect(crossCity.json()).toEqual(missing.json());

    const [workerCustomer, customerAdmin, auditorWrite, operatorApprove, auditorRead] = await Promise.all([
      app.inject({ method: "GET", url: "/api/customer/marketing/coupon-grants", headers: worker }),
      app.inject({ method: "GET", url: "/api/admin/marketing/campaigns", headers: customerHeaders[0] }),
      app.inject({ method: "POST", url: "/api/admin/marketing/campaigns", headers: auditor, payload: {} }),
      app.inject({ method: "POST", url: `/api/admin/marketing/coupon-grants/${coupon.couponGrantId}/revoke`, headers: operator, payload: { expectedVersion: 1, reason: "forbidden" } }),
      app.inject({ method: "GET", url: "/api/admin/marketing/campaigns", headers: auditor }),
    ]);
    expect([
      workerCustomer.statusCode,
      customerAdmin.statusCode,
      auditorWrite.statusCode,
      operatorApprove.statusCode,
      auditorRead.statusCode,
    ]).toEqual([403, 403, 403, 403, 200]);
  });

  it("rejects expired and fingerprint-drifted decisions without partial Order facts", async () => {
    const expiredGrant = await grant(0, "expiry");
    const expiredDecision = await decision(0, expiredGrant.couponGrantId, "expiry");
    await getMysqlPool().query(
      `UPDATE marketing_discount_decisions
          SET created_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 10 MINUTE),
              expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND)
        WHERE discount_decision_id=?`,
      [expiredDecision.discountDecisionId],
    );
    const expiredResponse = await app.inject({
      method: "POST", url: "/api/orders", headers: customerHeaders[0], payload: orderPayload(expiredDecision, "expired"),
    });
    expect(expiredResponse.statusCode).toBe(409);

    const driftGrant = await grant(0, "fingerprint");
    const driftDecision = await decision(0, driftGrant.couponGrantId, "fingerprint");
    await getMysqlPool().query(
      "UPDATE marketing_discount_decisions SET request_fingerprint=? WHERE discount_decision_id=?",
      ["f".repeat(64), driftDecision.discountDecisionId],
    );
    const driftResponse = await app.inject({
      method: "POST", url: "/api/orders", headers: customerHeaders[0], payload: orderPayload(driftDecision, "fingerprint"),
    });
    expect(driftResponse.statusCode).toBe(409);
    expect(await count("SELECT COUNT(*) count FROM coupon_reservations WHERE discount_decision_id IN (?,?)", [
      expiredDecision.discountDecisionId, driftDecision.discountDecisionId,
    ])).toBe(0);
  });

  it("uses Pricing's first ordered base row instead of MAX for Decision and Order evidence", async () => {
    const pool = getMysqlPool();
    const [existingBases] = await pool.query<(RowDataPacket & {
      fee_item_id: string; amount: string; sort_order: number;
    })[]>(
      `SELECT fee_item_id,CAST(amount AS CHAR) amount,sort_order
         FROM price_fee_items
        WHERE city_code=? AND price_rule_id=? AND fee_type='base' AND is_enabled=1
        ORDER BY sort_order,fee_item_id`,
      [cityCode, priceRuleId],
    );
    expect(existingBases.length).toBeGreaterThan(0);
    const pricingFirstBase = existingBases[0]!;
    const laterHigherAmount = (Number(pricingFirstBase.amount) + 40).toFixed(2);
    const secondBaseId = `p29_adv_base_${nonce}`;
    fixtureFeeItemIds.push(secondBaseId);
    await pool.query(
      `INSERT INTO price_fee_items
       (fee_item_id,city_code,price_rule_id,sku_id,fee_code,fee_name,fee_type,charge_method,
        amount,is_optional,is_enabled,sort_order)
       VALUES (?,?,?,?,?,?,'base','fixed',?,0,1,?)`,
      [secondBaseId, cityCode, priceRuleId, skuId, `p29_adv_base_${nonce}`,
        "Phase29 later higher base", laterHigherAmount, pricingFirstBase.sort_order + 10_000],
    );

    const publicQuote = ok(await app.inject({
      method: "GET", url: `/api/pricing/quote?skuId=${encodeURIComponent(skuId)}`,
      headers: customerHeaders[2],
    })).quote as JsonRecord;
    expect(publicQuote.breakdown.baseAmount).toBe(Number(pricingFirstBase.amount));
    expect(publicQuote.breakdown.baseAmount).not.toBe(Number(laterHigherAmount));
    const orderedBaseIds = publicQuote.breakdown.feeItems
      .filter((item: JsonRecord) => item.feeType === "base")
      .map((item: JsonRecord) => item.feeItemId);
    expect(orderedBaseIds[0]).toBe(pricingFirstBase.fee_item_id);
    expect(orderedBaseIds).toContain(secondBaseId);

    const coupon = await grant(2, "ordered-base");
    const issued = await decision(2, coupon.couponGrantId, "ordered-base");
    const expectedGrossMinor = Math.round(publicQuote.breakdown.totalAmount * 100);
    expect(issued.grossAmountMinor).toBe(expectedGrossMinor);
    expect(issued.netAmountMinor).toBe(expectedGrossMinor - issued.discountAmountMinor);

    const order = ok(await app.inject({
      method: "POST", url: "/api/orders", headers: customerHeaders[2],
      payload: orderPayload(issued, "ordered-base"),
    })).order as JsonRecord;
    expect(order.priceRuleId).toBe(publicQuote.priceRuleId);
    expect(order.quoteSnapshot.breakdown).toEqual(publicQuote.breakdown);
    expect(order.quoteSnapshot.unitAmount).toBe(publicQuote.breakdown.totalAmount);
    expect(order.quoteSnapshot.grossAmountMinor).toBe(issued.grossAmountMinor);
    expect(order.quoteSnapshot.discountAmountMinor).toBe(issued.discountAmountMinor);
    expect(order.quoteSnapshot.netAmountMinor).toBe(issued.netAmountMinor);
    expect(order.quoteSnapshot.totalAmount).toBe(issued.netAmountMinor / 100);
    expect(order.totalAmount).toBe(issued.netAmountMinor / 100);
  });

  it("serializes SKU disable against Order acceptance and fails closed", async () => {
    const coupon = await grant(2, "sku-disable");
    const issued = await decision(2, coupon.couponGrantId, "sku-disable");
    const barrier: PoolConnection = await getMysqlPool().getConnection();
    try {
      await barrier.beginTransaction();
      await barrier.query("UPDATE service_skus SET is_enabled=0 WHERE city_code=? AND sku_id=?", [cityCode, skuId]);
      const pendingOrder = app.inject({
        method: "POST", url: "/api/orders", headers: customerHeaders[2], payload: orderPayload(issued, "sku-disable"),
      });
      await new Promise((resolve) => setTimeout(resolve, 75));
      await barrier.commit();
      const response = await pendingOrder;
      expect(response.statusCode, response.body).toBe(400);
      expect(await count("SELECT COUNT(*) count FROM coupon_redemptions WHERE coupon_grant_id=?", [coupon.couponGrantId])).toBe(0);
    } finally {
      try { await barrier.rollback(); } catch { /* transaction may already be committed */ }
      barrier.release();
      await getMysqlPool().query("UPDATE service_skus SET is_enabled=1 WHERE city_code=? AND sku_id=?", [cityCode, skuId]);
    }
  });

  it("recovers one stale partial reservation exactly once under concurrent CAS", async () => {
    const coupon = await grant(1, "reservation-recovery");
    const issued = await decision(1, coupon.couponGrantId, "reservation-recovery");
    const placeholderOrder = ok(await app.inject({
      method: "POST", url: "/api/orders", headers: customerHeaders[1],
      payload: plainOrderPayload("reservation-recovery"),
    })).order;
    const reservationId = `cres_adv_${nonce}`;
    await getMysqlPool().query(
      "UPDATE coupon_grants SET status='reserved',version=version+1 WHERE coupon_grant_id=? AND status='available' AND version=1",
      [coupon.couponGrantId],
    );
    await getMysqlPool().query(
      `INSERT INTO coupon_reservations
       (coupon_reservation_id,coupon_grant_id,discount_decision_id,order_id,city_code,customer_id,
        status,currency,discount_amount_minor,expires_at,version,created_at)
       VALUES (?,?,?,?,?,?,'active','CNY',?,DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 MINUTE),1,
         DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 4 MINUTE))`,
      [reservationId, coupon.couponGrantId, issued.discountDecisionId, placeholderOrder.orderId,
        cityCode, customerIds[1], issued.discountAmountMinor],
    );
    const identity = {
      identityKind: "platform_service",
      credentialKind: "internal_domain_contract",
      serviceId: "phase29-reservation-recovery",
      subscriberId: platformFixtureIds.subscriberId,
      cityCode,
    } as const;
    const request = {
      couponReservationId: reservationId,
      expectedReservationVersion: 1,
      reason: "expired partial acceptance recovery",
      traceId: `p29-adv-recovery-${nonce}`,
    };
    const results = await Promise.all([
      marketingService.recoverExpiredReservation(identity, request),
      marketingService.recoverExpiredReservation(identity, request),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual(["released", "reused"]);
    const [facts] = await getMysqlPool().query<(RowDataPacket & {
      reservation_status: string; reservation_version: number | string;
      grant_status: string; grant_version: number | string;
      decision_status: string; decision_version: number | string;
    })[]>(
      `SELECT r.status reservation_status,r.version reservation_version,
              g.status grant_status,g.version grant_version,
              d.status decision_status,d.version decision_version
         FROM coupon_reservations r
         INNER JOIN coupon_grants g ON g.city_code=r.city_code AND g.coupon_grant_id=r.coupon_grant_id
         INNER JOIN marketing_discount_decisions d
           ON d.city_code=r.city_code AND d.discount_decision_id=r.discount_decision_id
        WHERE r.city_code=? AND r.coupon_reservation_id=?`,
      [cityCode, reservationId],
    );
    expect(facts[0]).toMatchObject({
      reservation_status: "released",
      grant_status: "available",
      decision_status: "rejected",
    });
    expect(Number(facts[0]?.reservation_version)).toBe(2);
    expect(Number(facts[0]?.grant_version)).toBe(4);
    expect(Number(facts[0]?.decision_version)).toBe(2);
    expect(await count(
      "SELECT COUNT(*) count FROM marketing_audit_records WHERE trace_id=?",
      [request.traceId],
    )).toBe(4);
    expect(await count(
      "SELECT COUNT(*) count FROM event_outbox WHERE city_code=? AND event_type='marketing.coupon.released' AND aggregate_id=?",
      [cityCode, reservationId],
    )).toBe(1);

    const authoritativeGrant = await grant(1, "reservation-authoritative");
    const authoritativeDecision = await decision(
      1, authoritativeGrant.couponGrantId, "reservation-authoritative",
    );
    const authoritativeOrder = ok(await app.inject({
      method: "POST", url: "/api/orders", headers: customerHeaders[1],
      payload: orderPayload(authoritativeDecision, "reservation-authoritative"),
    })).order;
    const authoritativeReservationId = authoritativeOrder.quoteSnapshot.marketingDecision.reservationId;
    await getMysqlPool().query(
      `UPDATE coupon_reservations
          SET status='active',version=version+1,
              created_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 4 MINUTE),
              expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 MINUTE)
        WHERE city_code=? AND coupon_reservation_id=?`,
      [cityCode, authoritativeReservationId],
    );
    const failClosed = await marketingService.recoverExpiredReservation(identity, {
      couponReservationId: authoritativeReservationId,
      expectedReservationVersion: 3,
      reason: "must preserve authoritative success evidence",
      traceId: `p29-adv-recovery-evidence-${nonce}`,
    });
    expect(failClosed.outcome).toBe("order_evidence_present");
    const [preserved] = await getMysqlPool().query<(RowDataPacket & {
      reservation_status: string; reservation_version: number | string;
      grant_status: string; decision_status: string; redemption_count: number | string;
    })[]>(
      `SELECT r.status reservation_status,r.version reservation_version,
              g.status grant_status,d.status decision_status,COUNT(cr.coupon_redemption_id) redemption_count
         FROM coupon_reservations r
         INNER JOIN coupon_grants g ON g.city_code=r.city_code AND g.coupon_grant_id=r.coupon_grant_id
         INNER JOIN marketing_discount_decisions d
           ON d.city_code=r.city_code AND d.discount_decision_id=r.discount_decision_id
         LEFT JOIN coupon_redemptions cr
           ON cr.city_code=r.city_code AND cr.coupon_reservation_id=r.coupon_reservation_id
        WHERE r.city_code=? AND r.coupon_reservation_id=?
        GROUP BY r.status,r.version,g.status,d.status`,
      [cityCode, authoritativeReservationId],
    );
    expect(preserved[0]).toMatchObject({
      reservation_status: "active",
      grant_status: "redeemed",
      decision_status: "accepted",
    });
    expect(Number(preserved[0]?.reservation_version)).toBe(3);
    expect(Number(preserved[0]?.redemption_count)).toBe(1);
    expect(await count(
      "SELECT COUNT(*) count FROM event_outbox WHERE city_code=? AND event_type='marketing.coupon.released' AND aggregate_id=?",
      [cityCode, authoritativeReservationId],
    )).toBe(0);
  });

  it("materializes only full-refund/cancel compensation from real leased claims", async () => {
    expect(redeemedOrder?.orderId).toBeTruthy();
    const before = await count("SELECT COUNT(*) count FROM marketing_compensations WHERE customer_id=?", [customerIds[0]]);
    const fullRefund = await leaseCompensationClaim("refund.approved", {
      refundId: `refund-full-${nonce}`,
      orderId: redeemedOrder.orderId,
      cityCode,
      customerId: customerIds[0],
      fulfillmentId: `fulfillment-full-${nonce}`,
      paymentOrderId: `payment-full-${nonce}`,
      amount: redeemedOrder.totalAmount,
      currency: "CNY",
      approvedAt: new Date().toISOString(),
      approvedByAdminId: adminId,
    }, "refund_full");
    const fullResult = await marketingService.materializeCompensationClaim(fullRefund.identity, fullRefund.claim);
    expect(fullResult).toMatchObject({
      outcome: "granted",
      compensation: { triggerType: "full_refund", status: "granted" },
      couponGrant: { customerId: customerIds[0], issuanceReason: "full_refund", status: "available" },
    });

    const partialRefund = await leaseCompensationClaim("refund.approved", {
      refundId: `refund-partial-${nonce}`,
      orderId: redeemedOrder.orderId,
      cityCode,
      customerId: customerIds[0],
      fulfillmentId: `fulfillment-partial-${nonce}`,
      paymentOrderId: `payment-partial-${nonce}`,
      amount: Math.max(0.01, redeemedOrder.totalAmount - 0.01),
      currency: "CNY",
      approvedAt: new Date().toISOString(),
      approvedByAdminId: adminId,
    }, "refund_partial");
    const partialResult = await marketingService.materializeCompensationClaim(partialRefund.identity, partialRefund.claim);
    expect(partialResult).toMatchObject({
      outcome: "denied",
      compensation: { status: "denied", decisionReason: "partial_refund_is_not_supported" },
      couponGrant: null,
    });

    await getMysqlPool().query("UPDATE orders SET status='cancelled' WHERE city_code=? AND order_id=?", [cityCode, redeemedOrder.orderId]);
    const cancellation = await leaseCompensationClaim("order.reverse.applied", {
      reverseRequestId: `reverse-${nonce}`,
      orderId: redeemedOrder.orderId,
      reverseType: "cancel",
      dispatchMutation: false,
    }, "cancel");
    const cancelResult = await marketingService.materializeCompensationClaim(cancellation.identity, cancellation.claim);
    expect(cancelResult).toMatchObject({
      outcome: "granted",
      compensation: { triggerType: "order_cancellation", status: "granted" },
      couponGrant: { customerId: customerIds[0], issuanceReason: "order_cancellation", status: "available" },
    });

    const beforeUnsupported = await count("SELECT COUNT(*) count FROM marketing_compensations WHERE customer_id=?", [customerIds[0]]);
    await expect(marketingService.materializeCompensationClaim(
      cancellation.identity,
      { ...cancellation.claim, eventType: "payment.failed" } as never,
    )).rejects.toThrow(/only cancel-applied or full-refund-approved/);
    expect(await count("SELECT COUNT(*) count FROM marketing_compensations WHERE customer_id=?", [customerIds[0]])).toBe(beforeUnsupported);
    expect(beforeUnsupported).toBe(before + 3);
  });
});
