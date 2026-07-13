import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import type { PlatformServiceIdentity } from "@xlb/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import { PlatformDeliveryService } from "../../backend/src/events/platformDeliveryService.js";
import { ReputationProjectionWorker } from "../../backend/src/review/reputationProjectionWorker.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { adminAuthHeaders, bearerHeaders, workerAuthHeaders } from "./helpers/authTestHelper.js";
import { customerHeaders, createOrderForDispatch } from "./helpers/dispatchTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";
import { createCompletedFulfillment } from "./helpers/ledgerTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const nonce = `${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const adminAId = `p28_admin_a_${nonce}`;
const adminBId = `p28_admin_b_${nonce}`;
const subscriberId = `p28_sub_${nonce}`;
const createdSubscriptionId = `p28_sc_c_${nonce}`;
const visibilitySubscriptionId = `p28_sc_v_${nonce}`;
const generationId = `p28_gen_${nonce}`;
const serviceId = `p28_service_${nonce}`;
const adminA = adminAuthHeaders(adminAId, "hangzhou", "admin");
const adminB = adminAuthHeaders(adminBId, "hangzhou", "admin");
const operator = adminAuthHeaders(`p28_operator_${nonce}`, "hangzhou", "operator");
const auditor = adminAuthHeaders(`p28_auditor_${nonce}`, "hangzhou", "auditor");
const wrongCustomer = bearerHeaders({
  appType: "customer", role: "customer", userId: `p28_other_customer_${nonce}`, cityCode: "hangzhou",
});
const crossCityCustomer = bearerHeaders({
  appType: "customer", role: "customer", userId: "customer-dispatch-001", cityCode: "shanghai",
});
const worker = workerAuthHeaders("worker-demo-hangzhou", "hangzhou");
const otherWorker = workerAuthHeaders("worker-demo-hangzhou-alt", "hangzhou");

const platformIdentity: PlatformServiceIdentity = {
  identityKind: "platform_service",
  credentialKind: "internal_domain_contract",
  serviceId,
  subscriberId,
  cityCode: "hangzhou",
};

type ReviewFixture = {
  orderId: string;
  fulfillmentId: string;
  paymentOrderId: string;
  reviewId: string;
  comment: string;
};

async function scalarCount(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function protectedSnapshot(orderId: string, fulfillmentId: string) {
  const pool = getMysqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT o.status order_status,p.status payment_status,d.status dispatch_status,
            f.status fulfillment_status
       FROM orders o
       LEFT JOIN payment_orders p ON p.city_code=o.city_code AND p.order_id=o.order_id
       LEFT JOIN dispatch_tasks d ON d.city_code=o.city_code AND d.order_id=o.order_id
       LEFT JOIN fulfillments f ON f.city_code=o.city_code AND f.order_id=o.order_id
      WHERE o.city_code='hangzhou' AND o.order_id=? AND f.fulfillment_id=? LIMIT 1`,
    [orderId, fulfillmentId],
  );
  return {
    lifecycle: rows[0],
    ledgerEntries: await scalarCount(
      "SELECT COUNT(*) count FROM ledger_entries WHERE city_code='hangzhou' AND source_id=?",
      [fulfillmentId],
    ),
    settlementItems: await scalarCount(
      "SELECT COUNT(*) count FROM settlement_items WHERE city_code='hangzhou' AND fulfillment_id=?",
      [fulfillmentId],
    ),
    qualificationRows: await scalarCount(
      "SELECT COUNT(*) count FROM worker_qualifications WHERE city_code='hangzhou' AND worker_id='worker-demo-hangzhou'",
    ),
  };
}

async function createPaidIncomplete(app: FastifyInstance): Promise<string> {
  const { orderId, fulfillmentId } = await createCompletedFulfillment(app);
  // Deterministic integrity fixture: payment/order are complete but the
  // same-city fulfillment snapshot is not reviewable. No business endpoint
  // permits this regression; direct setup represents corrupted source state.
  await getMysqlPool().query(
    "UPDATE fulfillments SET status='in_progress' WHERE city_code='hangzhou' AND fulfillment_id=?",
    [fulfillmentId],
  );
  return orderId;
}

async function createCompletedUnpaid(app: FastifyInstance): Promise<string> {
  const { orderId, fulfillmentId } = await createAcceptedFulfillment(app);
  expect((await app.inject({
    method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: worker, payload: {},
  })).statusCode).toBe(200);
  expect((await app.inject({
    method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: worker,
    payload: { completionNote: "Phase28 unpaid review guard" },
  })).statusCode).toBe(200);
  expect((await app.inject({
    method: "POST", url: `/api/orders/${orderId}/confirm-service`, headers: customerHeaders, payload: {},
  })).statusCode).toBe(200);
  return orderId;
}

async function project(subscriptionId: string) {
  const platform = new PlatformDeliveryService();
  const materialized = await platform.materializeCandidateBatch(platformIdentity, subscriptionId, 100);
  expect(materialized.rejected).toBe(0);
  expect(materialized.inserted).toBeGreaterThanOrEqual(1);
  const result = await new ReputationProjectionWorker().runOnce(platformIdentity, {
    subscriptionId, owner: `p28_worker_${nonce}`, limit: 100, leaseSeconds: 30,
  });
  expect(result.failed).toBe(0);
  expect(result.conflicts).toBe(0);
  expect(result.acknowledged).toBe(result.claimed);
  return result;
}

describe.skipIf(!runDb)("Phase28 Review/Reputation real database lifecycle", { timeout: 120_000 }, () => {
  let app: FastifyInstance;
  let fixture: ReviewFixture;
  let previousPointer: { active_generation_id: string; row_version: number; activated_by_actor_id: string } | null = null;

  beforeAll(async () => {
    await runMigrations();
    await ensureHangzhouWorkerEligible();
    const pool = getMysqlPool();
    for (const [id, role] of [
      [adminAId, "admin"], [adminBId, "admin"],
      [`p28_operator_${nonce}`, "operator"], [`p28_auditor_${nonce}`, "auditor"],
    ] as const) {
      await pool.query(
        "INSERT INTO admin_users(id,username,role,city_scopes_json) VALUES(?,?,?,JSON_ARRAY('hangzhou'))",
        [id, id, role],
      );
      await pool.query("INSERT INTO admin_city_scopes(admin_user_id,city_code) VALUES(?,'hangzhou')", [id]);
    }
    const [pointers] = await pool.query<(RowDataPacket & {
      active_generation_id: string; row_version: number; activated_by_actor_id: string;
    })[]>(
      "SELECT active_generation_id,row_version,activated_by_actor_id FROM reputation_projection_pointers WHERE city_code='hangzhou'",
    );
    previousPointer = pointers[0] ?? null;
    await pool.query(
      `INSERT INTO reputation_projection_generations
        (generation_id,city_code,status,build_kind,requested_by_actor_type,requested_by_actor_id,
         reason,formula_revision,source_row_count,visible_row_count,ready_at,activated_at)
       VALUES (?,'hangzhou','active','live','reputation_service',?,
         'Phase28 isolated integration projection','visible_arithmetic_mean_v1',0,0,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
      [generationId, serviceId],
    );
    await pool.query(
      `INSERT INTO reputation_projection_pointers
        (city_code,active_generation_id,row_version,activated_by_actor_id)
       VALUES ('hangzhou',?,1,?)
       ON DUPLICATE KEY UPDATE active_generation_id=VALUES(active_generation_id),
         row_version=row_version+1,activated_by_actor_id=VALUES(activated_by_actor_id),
         activated_at=CURRENT_TIMESTAMP(3)`,
      [generationId, serviceId],
    );
    await pool.query(
      `INSERT INTO platform_event_subscribers
        (subscriber_id,stable_name,owner_domain,handler_revision,purpose,max_pii_level,status,
         created_by_service_id,updated_by_service_id)
       VALUES (?,?, 'reputation','review-v1-r1','Phase28 isolated integration projection','P1','active',?,?)`,
      [subscriberId, `phase28.integration.${nonce}`, serviceId, serviceId],
    );
    for (const [subscriptionId, eventType, revision] of [
      [createdSubscriptionId, "review.created", "review-created-v1-r1"],
      [visibilitySubscriptionId, "review.visibility.changed", "review-visibility-v1-r1"],
    ] as const) {
      await pool.query(
        `INSERT INTO platform_event_subscriptions
          (subscription_id,city_code,subscriber_id,event_type,event_major_version,
           compatibility_handler_revision,live_start_created_at,live_start_event_id,retention_class,
           status,lease_seconds,max_attempts,created_by_service_id,updated_by_service_id)
         VALUES (?,'hangzhou',?,?,1,?,CURRENT_TIMESTAMP(3),'!','R1','active',30,3,?,?)`,
        [subscriptionId, subscriberId, eventType, revision, serviceId, serviceId],
      );
    }
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    const pool = getMysqlPool();
    if (previousPointer) {
      await pool.query(
        `UPDATE reputation_projection_pointers
            SET active_generation_id=?,row_version=?,activated_by_actor_id=?
          WHERE city_code='hangzhou'`,
        [previousPointer.active_generation_id, previousPointer.row_version,
          previousPointer.activated_by_actor_id],
      );
    } else {
      await pool.query(
        "DELETE FROM reputation_projection_pointers WHERE city_code='hangzhou' AND active_generation_id=?",
        [generationId],
      );
    }
    await pool.query("DELETE FROM reputation_projection_receipts WHERE generation_id=?", [generationId]);
    await pool.query("DELETE FROM reputation_review_contributions WHERE generation_id=?", [generationId]);
    await pool.query("DELETE FROM reputation_worker_aggregates WHERE generation_id=?", [generationId]);
    for (const subscriptionId of [createdSubscriptionId, visibilitySubscriptionId]) {
      await pool.query(
        `DELETE FROM platform_event_delivery_attempts
          WHERE delivery_id IN (SELECT delivery_id FROM platform_event_deliveries WHERE subscription_id=?)`,
        [subscriptionId],
      );
      await pool.query("DELETE FROM platform_event_delivery_actions WHERE subscription_id_copy=?", [subscriptionId]);
      await pool.query("DELETE FROM platform_event_deliveries WHERE subscription_id=?", [subscriptionId]);
      await pool.query("DELETE FROM platform_event_materialization_checkpoints WHERE subscription_id=?", [subscriptionId]);
      await pool.query("DELETE FROM platform_event_subscriptions WHERE subscription_id=?", [subscriptionId]);
    }
    await pool.query("DELETE FROM platform_event_subscribers WHERE subscriber_id=?", [subscriberId]);
    await pool.query("DELETE FROM reputation_projection_generations WHERE generation_id=?", [generationId]);
    const adminIds = [adminAId, adminBId, `p28_operator_${nonce}`, `p28_auditor_${nonce}`];
    await pool.query("DELETE FROM admin_city_scopes WHERE admin_user_id IN (?,?,?,?)", adminIds);
    await pool.query("DELETE FROM admin_users WHERE id IN (?,?,?,?)", adminIds);
  });

  it("guards owner before idempotency and persists one immutable Review plus exact-v1 Outbox atomically", async () => {
    const completed = await createCompletedFulfillment(app);
    const comment = `Phase28 real owner-before-existing ${nonce}`;
    const beforeReviewCount = await scalarCount(
      "SELECT COUNT(*) count FROM order_reviews WHERE city_code='hangzhou' AND order_id=?",
      [completed.orderId],
    );
    expect(beforeReviewCount).toBe(0);

    const [first, concurrent] = await Promise.all([
      app.inject({ method: "POST", url: `/api/orders/${completed.orderId}/reviews`, headers: customerHeaders,
        payload: { rating: 5, comment } }),
      app.inject({ method: "POST", url: `/api/orders/${completed.orderId}/reviews`, headers: customerHeaders,
        payload: { rating: 5, comment } }),
    ]);
    expect(first.statusCode, first.body).toBe(200);
    expect(concurrent.statusCode, concurrent.body).toBe(200);
    expect(first.json().review.reviewId).toBe(concurrent.json().review.reviewId);
    expect([first.json().idempotent, concurrent.json().idempotent].sort()).toEqual([false, true]);
    const reviewId = first.json().review.reviewId as string;
    fixture = { ...completed, reviewId, comment };

    expect(await scalarCount(
      "SELECT COUNT(*) count FROM order_reviews WHERE city_code='hangzhou' AND order_id=?",
      [completed.orderId],
    )).toBe(1);
    const [facts] = await getMysqlPool().query<(RowDataPacket & {
      visibility: string; event_major_version: number; payload_json: unknown;
    })[]>(
      `SELECT v.visibility,e.event_major_version,e.payload_json
         FROM order_reviews r
         INNER JOIN review_visibility_states v ON v.city_code=r.city_code AND v.review_id=r.review_id
         INNER JOIN event_outbox e ON e.city_code=r.city_code AND e.aggregate_id=r.review_id
          AND e.event_type='review.created'
        WHERE r.city_code='hangzhou' AND r.review_id=?`,
      [reviewId],
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ visibility: "pending_moderation", event_major_version: 1 });
    const payload = typeof facts[0]!.payload_json === "string"
      ? JSON.parse(facts[0]!.payload_json) : facts[0]!.payload_json;
    expect(payload).toMatchObject({ reviewId, orderId: completed.orderId,
      workerId: "worker-demo-hangzhou", rating: 5, visibility: "pending_moderation" });
    expect(JSON.stringify(payload)).not.toContain(comment);
    expect(JSON.stringify(payload)).not.toContain("customer-dispatch-001");

    for (const headers of [wrongCustomer, crossCityCustomer]) {
      const result = await app.inject({
        method: "POST", url: `/api/orders/${completed.orderId}/reviews`, headers,
        payload: { rating: 1, comment: "must not disclose the existing review" },
      });
      expect(result.statusCode, result.body).toBe(404);
      expect(result.body).not.toContain(reviewId);
      expect(result.body).not.toContain(comment);
    }

    const unpaidOrderId = await createCompletedUnpaid(app);
    const incompleteOrderId = await createPaidIncomplete(app);
    for (const orderId of [unpaidOrderId, incompleteOrderId]) {
      const before = await scalarCount(
        "SELECT COUNT(*) count FROM order_reviews WHERE city_code='hangzhou' AND order_id=?",
        [orderId],
      );
      const response = await app.inject({
        method: "POST", url: `/api/orders/${orderId}/reviews`, headers: customerHeaders,
        payload: { rating: 4, comment: "unreviewable order must write nothing" },
      });
      expect(response.statusCode, response.body).toBe(409);
      expect(await scalarCount(
        "SELECT COUNT(*) count FROM order_reviews WHERE city_code='hangzhou' AND order_id=?",
        [orderId],
      )).toBe(before);
      expect(await scalarCount(
        "SELECT COUNT(*) count FROM event_outbox WHERE city_code='hangzhou' AND aggregate_id=? AND event_type='review.created'",
        [orderId],
      )).toBe(0);
    }
  });

  it("redacts queues, audits dedicated content reads, enforces self targets and four-eyes appeals", async () => {
    const queue = await app.inject({
      method: "GET", url: "/api/admin/reviews/moderation?visibility=pending_moderation", headers: operator,
    });
    expect(queue.statusCode, queue.body).toBe(200);
    const item = queue.json().items.find((entry: { reviewId: string }) => entry.reviewId === fixture.reviewId);
    expect(item).toMatchObject({ comment: null, commentRestricted: true,
      visibility: "pending_moderation", moderationVersion: 0, visibilityVersion: 1 });
    expect(JSON.stringify(item)).not.toContain(fixture.comment);
    expect((await app.inject({
      method: "GET", url: `/api/admin/reviews/${fixture.reviewId}/content`, headers: auditor,
    })).statusCode).toBe(403);
    const content = await app.inject({
      method: "GET", url: `/api/admin/reviews/${fixture.reviewId}/content`, headers: adminA,
    });
    expect(content.statusCode, content.body).toBe(200);
    expect(content.json().content).toEqual({ reviewId: fixture.reviewId, comment: fixture.comment });
    expect(await scalarCount(
      `SELECT COUNT(*) count FROM review_content_access_audits
        WHERE city_code='hangzhou' AND review_id=? AND actor_id=? AND actor_role='admin'
          AND access_purpose='moderation_detail'`,
      [fixture.reviewId, adminAId],
    )).toBe(1);

    const moderationRequest = {
      method: "POST" as const,
      url: `/api/admin/reviews/${fixture.reviewId}/moderation`,
      headers: adminA,
      payload: { decision: "hidden", reasonCode: "content_policy_violation",
        reason: "Phase28 four-eyes integration decision", expectedVersion: 1,
        idempotencyKey: `p28-hide-${nonce}` },
    };
    const [hidden, replay] = await Promise.all([
      app.inject(moderationRequest), app.inject(moderationRequest),
    ]);
    expect(hidden.statusCode, hidden.body).toBe(200);
    expect(replay.statusCode, replay.body).toBe(200);
    expect(hidden.json().visibility).toMatchObject({ visibility: "hidden", moderationVersion: 1, version: 2 });
    expect([hidden.json().idempotent, replay.json().idempotent].sort()).toEqual([false, true]);

    const otherWorkerTargets = await app.inject({
      method: "GET", url: "/api/worker/review-appeal-targets", headers: otherWorker,
    });
    expect(otherWorkerTargets.statusCode, otherWorkerTargets.body).toBe(200);
    expect(otherWorkerTargets.json().items.some((entry: { reviewId: string }) => entry.reviewId === fixture.reviewId)).toBe(false);
    const targets = await app.inject({
      method: "GET", url: "/api/worker/review-appeal-targets", headers: worker,
    });
    expect(targets.statusCode, targets.body).toBe(200);
    const target = targets.json().items.find((entry: { reviewId: string }) => entry.reviewId === fixture.reviewId);
    expect(target).toEqual(expect.objectContaining({ reviewId: fixture.reviewId,
      visibility: "hidden", moderationVersion: 1, activeAppealStatus: null }));
    expect(Object.keys(target).sort()).toEqual([
      "activeAppealStatus", "decidedAt", "moderationVersion", "reviewId", "visibility",
    ]);

    const workerAppealRequest = { method: "POST" as const,
      url: `/api/reviews/${fixture.reviewId}/appeals`, headers: worker,
      payload: { moderationVersion: 1, reason: "Worker requests independent review",
        idempotencyKey: `p28-worker-appeal-${nonce}` } };
    const [workerAppeal, workerAppealReplay] = await Promise.all([
      app.inject(workerAppealRequest), app.inject(workerAppealRequest),
    ]);
    expect(workerAppeal.statusCode, workerAppeal.body).toBe(200);
    expect(workerAppealReplay.statusCode, workerAppealReplay.body).toBe(200);
    expect(workerAppeal.json().appeal.appealId).toBe(workerAppealReplay.json().appeal.appealId);
    expect([workerAppeal.json().idempotent, workerAppealReplay.json().idempotent].sort())
      .toEqual([false, true]);
    const rejectedWorkerAppeal = await app.inject({
      method: "POST",
      url: `/api/admin/review-appeals/${workerAppeal.json().appeal.appealId}/resolve`,
      headers: adminB,
      payload: { resolution: "rejected", reason: "Independent reviewer confirms decision",
        expectedVersion: 1, idempotencyKey: `p28-worker-reject-${nonce}` },
    });
    expect(rejectedWorkerAppeal.statusCode, rejectedWorkerAppeal.body).toBe(200);
    const secondWorkerAppeal = await app.inject({
      method: "POST", url: `/api/reviews/${fixture.reviewId}/appeals`, headers: worker,
      payload: { moderationVersion: 1, reason: "A new active appeal after terminal rejection",
        idempotencyKey: `p28-worker-appeal-second-${nonce}` },
    });
    expect(secondWorkerAppeal.statusCode, secondWorkerAppeal.body).toBe(200);
    const withdrawalRequest = { method: "POST" as const,
      url: `/api/reviews/${fixture.reviewId}/appeals/withdraw`, headers: worker,
      payload: { moderationVersion: 1, idempotencyKey: `p28-worker-withdraw-${nonce}` } };
    const [withdrawnWorkerAppeal, withdrawalReplay] = await Promise.all([
      app.inject(withdrawalRequest), app.inject(withdrawalRequest),
    ]);
    expect(withdrawnWorkerAppeal.statusCode, withdrawnWorkerAppeal.body).toBe(200);
    expect(withdrawalReplay.statusCode, withdrawalReplay.body).toBe(200);
    expect(withdrawnWorkerAppeal.json().appeal.appealId).toBe(withdrawalReplay.json().appeal.appealId);
    expect([withdrawnWorkerAppeal.json().idempotent, withdrawalReplay.json().idempotent].sort())
      .toEqual([false, true]);
    expect(withdrawnWorkerAppeal.json().appeal).toMatchObject({
      appealId: secondWorkerAppeal.json().appeal.appealId,
      status: "withdrawn",
      version: 2,
    });

    const appeal = await app.inject({
      method: "POST", url: `/api/reviews/${fixture.reviewId}/appeals`, headers: customerHeaders,
      payload: { moderationVersion: 1, reason: "Please reconsider this hidden review",
        idempotencyKey: `p28-appeal-${nonce}` },
    });
    expect(appeal.statusCode, appeal.body).toBe(200);
    const appealId = appeal.json().appeal.appealId as string;
    const sameModerator = await app.inject({
      method: "POST", url: `/api/admin/review-appeals/${appealId}/resolve`, headers: adminA,
      payload: { resolution: "upheld", reason: "must fail four eyes", expectedVersion: 1,
        idempotencyKey: `p28-resolve-same-${nonce}` },
    });
    expect(sameModerator.statusCode, sameModerator.body).toBe(403);
    const resolutionRequest = { method: "POST" as const,
      url: `/api/admin/review-appeals/${appealId}/resolve`, headers: adminB,
      payload: { resolution: "upheld", reason: "Independent appeal reviewer restored visibility",
        expectedVersion: 1, idempotencyKey: `p28-resolve-other-${nonce}` } };
    const [resolved, resolutionReplay] = await Promise.all([
      app.inject(resolutionRequest), app.inject(resolutionRequest),
    ]);
    expect(resolved.statusCode, resolved.body).toBe(200);
    expect(resolutionReplay.statusCode, resolutionReplay.body).toBe(200);
    expect(resolved.json().appeal.appealId).toBe(resolutionReplay.json().appeal.appealId);
    expect([resolved.json().idempotent, resolutionReplay.json().idempotent].sort())
      .toEqual([false, true]);
    expect(resolved.json().appeal).toMatchObject({ appealId, status: "upheld", version: 2,
      resolvedByAdminId: adminBId });
    const customerView = await app.inject({
      method: "GET", url: `/api/orders/${fixture.orderId}/review`, headers: customerHeaders,
    });
    expect(customerView.statusCode, customerView.body).toBe(200);
    expect(customerView.json().review.visibility).toMatchObject({ visibility: "visible", moderationVersion: 2 });
  });

  it("projects exact-v1 Review events idempotently and leaves protected domains byte-for-byte stable", async () => {
    const before = await protectedSnapshot(fixture.orderId, fixture.fulfillmentId);
    const created = await project(createdSubscriptionId);
    expect(created.projected).toBe(1);
    const visibility = await project(visibilitySubscriptionId);
    expect(visibility.projected).toBe(2);

    const [deliveryEnvelopes] = await getMysqlPool().query<(RowDataPacket & {
      event_type: string; aggregate_type: string; aggregate_id: string;
      aggregate_version: number | null; aggregate_sequence: number | null;
    })[]>(
      `SELECT event_type,aggregate_type,aggregate_id,aggregate_version,aggregate_sequence
         FROM platform_event_deliveries
        WHERE subscription_id IN (?,?) AND aggregate_id=?
        ORDER BY event_type,aggregate_version`,
      [createdSubscriptionId, visibilitySubscriptionId, fixture.reviewId],
    );
    expect(deliveryEnvelopes.map((row) => ({
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: Number(row.aggregate_version),
      aggregateSequence: Number(row.aggregate_sequence),
    }))).toEqual([
      { eventType: "review.created", aggregateType: "order_review",
        aggregateId: fixture.reviewId, aggregateVersion: 1, aggregateSequence: 1 },
      { eventType: "review.visibility.changed", aggregateType: "order_review",
        aggregateId: fixture.reviewId, aggregateVersion: 1, aggregateSequence: 1 },
      { eventType: "review.visibility.changed", aggregateType: "order_review",
        aggregateId: fixture.reviewId, aggregateVersion: 2, aggregateSequence: 2 },
    ]);

    const self = await app.inject({ method: "GET", url: "/api/worker/reputation", headers: worker });
    expect(self.statusCode, self.body).toBe(200);
    expect(self.json().reputation).toMatchObject({
      workerId: "worker-demo-hangzhou", cityCode: "hangzhou", ratingCount: 1,
      ratingSum: 5, averageRating: 5, sourceGenerationId: generationId,
      ratingDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 1 },
    });
    const wrongSelf = await app.inject({ method: "GET", url: "/api/worker/reputation", headers: otherWorker });
    expect(wrongSelf.statusCode, wrongSelf.body).toBe(200);
    expect(wrongSelf.json().reputation).toBeNull();
    expect(JSON.stringify(self.json())).not.toContain(fixture.comment);
    expect(JSON.stringify(self.json())).not.toContain("customer-dispatch-001");
    expect(JSON.stringify(self.json())).not.toContain(fixture.reviewId);

    const platform = new PlatformDeliveryService();
    expect((await platform.materializeCandidateBatch(platformIdentity, createdSubscriptionId, 100)).inserted).toBe(0);
    expect((await platform.materializeCandidateBatch(platformIdentity, visibilitySubscriptionId, 100)).inserted).toBe(0);
    const after = await protectedSnapshot(fixture.orderId, fixture.fulfillmentId);
    expect(after).toEqual(before);
    expect(await scalarCount(
      "SELECT COUNT(*) count FROM reputation_review_contributions WHERE city_code='hangzhou' AND generation_id=? AND review_id=?",
      [generationId, fixture.reviewId],
    )).toBe(1);
    expect(await scalarCount(
      "SELECT COUNT(*) count FROM reputation_projection_receipts WHERE city_code='hangzhou' AND generation_id=? AND review_id=?",
      [generationId, fixture.reviewId],
    )).toBe(3);
  });

  it("serializes cross-target idempotency races without duplicate rows or HTTP 500", async () => {
    const createPendingReview = async (label: string) => {
      const completed = await createCompletedFulfillment(app);
      const response = await app.inject({
        method: "POST", url: `/api/orders/${completed.orderId}/reviews`, headers: customerHeaders,
        payload: { rating: 4, comment: `Phase28 idempotency race ${label} ${nonce}` },
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json().review.reviewId as string;
    };
    const assertOneWinner = (responses: Awaited<ReturnType<typeof app.inject>>[]) => {
      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      expect(responses.every((response) => response.statusCode !== 500)).toBe(true);
      return responses.findIndex((response) => response.statusCode === 200);
    };

    // The race under test starts at the Review/Reputation mutation boundary.
    // Build the two unrelated fulfillment fixtures serially so legacy dispatch/
    // fulfillment locking cannot make this test fail before that boundary.
    const reviewIds = [
      await createPendingReview("left"),
      await createPendingReview("right"),
    ];
    const moderationKey = `p28-cross-moderate-${nonce}`;
    const moderationRaceReason = `Phase28 cross-target moderation race ${nonce}`;
    const moderationResponses = await Promise.all(reviewIds.map((reviewId) => app.inject({
      method: "POST", url: `/api/admin/reviews/${reviewId}/moderation`, headers: adminA,
      payload: { decision: "hidden", reasonCode: "content_policy_violation",
        reason: moderationRaceReason, expectedVersion: 1,
        idempotencyKey: moderationKey },
    })));
    const moderatedIndex = assertOneWinner(moderationResponses);
    const otherIndex = moderatedIndex === 0 ? 1 : 0;
    const completeOtherModeration = await app.inject({
      method: "POST", url: `/api/admin/reviews/${reviewIds[otherIndex]}/moderation`, headers: adminA,
      payload: { decision: "hidden", reasonCode: "content_policy_violation",
        reason: "Phase28 prepare second appeal target", expectedVersion: 1,
        idempotencyKey: `p28-cross-moderate-other-${nonce}` },
    });
    expect(completeOtherModeration.statusCode, completeOtherModeration.body).toBe(200);
    expect(await scalarCount(
      `SELECT COUNT(*) count FROM review_moderation_decisions
        WHERE city_code='hangzhou' AND actor_id=? AND reason=?`,
      [adminAId, moderationRaceReason],
    )).toBe(1);

    const appealKey = `p28-cross-appeal-${nonce}`;
    const appealRaceReason = `Phase28 cross-target appeal race ${nonce}`;
    const appealResponses = await Promise.all(reviewIds.map((reviewId) => app.inject({
      method: "POST", url: `/api/reviews/${reviewId}/appeals`, headers: worker,
      payload: { moderationVersion: 1, reason: appealRaceReason,
        idempotencyKey: appealKey },
    })));
    const appealedIndex = assertOneWinner(appealResponses);
    const appealIds: string[] = [];
    appealIds[appealedIndex] = appealResponses[appealedIndex]!.json().appeal.appealId as string;
    const otherAppealIndex = appealedIndex === 0 ? 1 : 0;
    const otherAppeal = await app.inject({
      method: "POST", url: `/api/reviews/${reviewIds[otherAppealIndex]}/appeals`, headers: worker,
      payload: { moderationVersion: 1, reason: "Phase28 prepare second withdrawal target",
        idempotencyKey: `p28-cross-appeal-other-${nonce}` },
    });
    expect(otherAppeal.statusCode, otherAppeal.body).toBe(200);
    appealIds[otherAppealIndex] = otherAppeal.json().appeal.appealId as string;
    expect(await scalarCount(
      `SELECT COUNT(*) count FROM review_appeals
        WHERE city_code='hangzhou' AND reason=?`,
      [appealRaceReason],
    )).toBe(1);

    const withdrawalKey = `p28-cross-withdraw-${nonce}`;
    const withdrawalResponses = await Promise.all(reviewIds.map((reviewId) => app.inject({
      method: "POST", url: `/api/reviews/${reviewId}/appeals/withdraw`, headers: worker,
      payload: { moderationVersion: 1, idempotencyKey: withdrawalKey },
    })));
    const withdrawnIndex = assertOneWinner(withdrawalResponses);
    const remainingIndex = withdrawnIndex === 0 ? 1 : 0;
    const remainingWithdrawal = await app.inject({
      method: "POST", url: `/api/reviews/${reviewIds[remainingIndex]}/appeals/withdraw`, headers: worker,
      payload: { moderationVersion: 1, idempotencyKey: `p28-cross-withdraw-other-${nonce}` },
    });
    expect(remainingWithdrawal.statusCode, remainingWithdrawal.body).toBe(200);
    expect(await scalarCount(
      `SELECT COUNT(*) count FROM review_appeals
        WHERE city_code='hangzhou' AND appeal_id IN (?,?) AND status='withdrawn'`,
      appealIds,
    )).toBe(2);

    const resolutionAppeals = await Promise.all(reviewIds.map((reviewId, index) => app.inject({
      method: "POST", url: `/api/reviews/${reviewId}/appeals`, headers: worker,
      payload: { moderationVersion: 1, reason: `Phase28 resolution target ${index}`,
        idempotencyKey: `p28-resolution-appeal-${index}-${nonce}` },
    })));
    expect(resolutionAppeals.map((response) => response.statusCode)).toEqual([200, 200]);
    const resolutionAppealIds = resolutionAppeals.map(
      (response) => response.json().appeal.appealId as string,
    );
    const resolutionKey = `p28-cross-resolve-${nonce}`;
    const resolutionResponses = await Promise.all(resolutionAppealIds.map((appealId) => app.inject({
      method: "POST", url: `/api/admin/review-appeals/${appealId}/resolve`, headers: adminB,
      payload: { resolution: "rejected", reason: "Phase28 cross-target resolution race",
        expectedVersion: 1, idempotencyKey: resolutionKey },
    })));
    const resolvedIndex = assertOneWinner(resolutionResponses);
    const unresolvedIndex = resolvedIndex === 0 ? 1 : 0;
    const remainingResolution = await app.inject({
      method: "POST", url: `/api/admin/review-appeals/${resolutionAppealIds[unresolvedIndex]}/resolve`,
      headers: adminB,
      payload: { resolution: "rejected", reason: "Phase28 resolve remaining target",
        expectedVersion: 1, idempotencyKey: `p28-cross-resolve-other-${nonce}` },
    });
    expect(remainingResolution.statusCode, remainingResolution.body).toBe(200);
    expect(await scalarCount(
      `SELECT COUNT(*) count FROM review_appeals
        WHERE city_code='hangzhou' AND appeal_id IN (?,?) AND status='rejected'`,
      resolutionAppealIds,
    )).toBe(2);
  });
});
