import { randomUUID } from "node:crypto";
import type { PlatformEventSubscription, PlatformServiceIdentity } from "@xlb/types";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import {
  PlatformDeliveryAuthorizationError,
  PlatformDeliveryService,
} from "../../backend/src/events/platformDeliveryService.js";
import { PlatformDeliveryRepository } from "../../backend/src/events/platformDeliveryRepository.js";
import {
  PLATFORM_DELIVERY_CANONICAL_ERRORS,
  PlatformDeliveryCanonicalError,
} from "../../backend/src/events/platformDeliveryPolicy.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const prefix = `p27a_${Date.now().toString(36)}_`;
const testCity = `phase27a_test_${Date.now().toString(36)}`;

type Fixture = {
  subscriberId: string;
  subscriptionId: string;
  identity: PlatformServiceIdentity;
};

async function createFixture(
  status: "proposed" | "active" | "paused" | "revoked" = "active",
  maxAttempts = 3,
  eventMajorVersion = 0,
): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const subscriberId = `${prefix}sub_${suffix}`;
  const subscriptionId = `${prefix}sc_${suffix}`;
  const serviceId = `${prefix}service_${suffix}`;
  await getMysqlPool().query(
    `INSERT INTO platform_event_subscribers
      (subscriber_id,stable_name,owner_domain,handler_revision,purpose,max_pii_level,status,
       created_by_service_id,updated_by_service_id)
     VALUES (?,?, 'phase27a-test','implicit-v0-order-created-r1','isolated integration evidence','P1','active',?,?)`,
    [subscriberId, `${prefix}stable_${suffix}`, serviceId, serviceId],
  );
  await getMysqlPool().query(
    `INSERT INTO platform_event_subscriptions
      (subscription_id,city_code,subscriber_id,event_type,event_major_version,
       compatibility_handler_revision,live_start_created_at,live_start_event_id,retention_class,status,
       lease_seconds,max_attempts,created_by_service_id,updated_by_service_id)
     VALUES (?,?,?,'order.created',?,'implicit-v0-order-created-r1',
       DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR),'!', 'R1',?,30,?,?,?)`,
    [subscriptionId, testCity, subscriberId, eventMajorVersion, status, maxAttempts, serviceId, serviceId],
  );
  return {
    subscriberId,
    subscriptionId,
    identity: {
      identityKind: "platform_service",
      credentialKind: "internal_domain_contract",
      serviceId,
      subscriberId,
      cityCode: testCity,
    },
  };
}

async function createAdditionalActiveSubscription(
  fixture: Fixture,
  eventType: "support.ticket.resolved" = "support.ticket.resolved",
): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const subscriptionId = `${prefix}sc_alt_${suffix}`;
  await getMysqlPool().query(
    `INSERT INTO platform_event_subscriptions
      (subscription_id,city_code,subscriber_id,event_type,event_major_version,
       compatibility_handler_revision,live_start_created_at,live_start_event_id,retention_class,status,
       lease_seconds,max_attempts,created_by_service_id,updated_by_service_id)
     VALUES (?,?,?,?,0,'implicit-v0-support-ticket-resolved-r1',
       DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR),'!','R3','active',30,3,?,?)`,
    [
      subscriptionId,
      testCity,
      fixture.subscriberId,
      eventType,
      fixture.identity.serviceId,
      fixture.identity.serviceId,
    ],
  );
  return subscriptionId;
}

async function insertOrderCreatedEvent(
  eventId = `${prefix}evt_${randomUUID()}`,
  connection?: PoolConnection,
  createdAtSql = "CURRENT_TIMESTAMP(3)",
): Promise<string> {
  const orderId = `${prefix}ord_${randomUUID().slice(0, 8)}`;
  const payload = {
    orderId,
    cityCode: testCity,
    customerId: `${prefix}customer`,
    skuId: "phase27a-test-sku",
    totalAmount: 88,
    createdAt: new Date().toISOString(),
  };
  const executor = connection ?? getMysqlPool();
  await executor.query(
    `INSERT INTO event_outbox
      (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status,created_at)
     VALUES (?,'order.created','phase27a_test',?,?,?,'pending',${createdAtSql})`,
    [eventId, orderId, testCity, JSON.stringify(payload)],
  );
  return eventId;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function protectedCounts() {
  const tables = [
    "dispatch_tasks",
    "ledger_entries",
    "ledger_accruals",
    "business_webhook_deliveries",
    "orders",
    "payment_orders",
    "support_tickets",
  ];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [
    table,
    await count(`SELECT COUNT(*) count FROM \`${table}\``),
  ])));
}

async function sourceLifecycle(eventId: string) {
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(
    `SELECT status,processing_started_at,lease_owner,lease_token,lease_expires_at,
       attempt_count,max_attempts,available_at,last_error_code,last_error_message,
       last_failed_at,dead_lettered_at,published_at
     FROM event_outbox WHERE event_id=?`,
    [eventId],
  );
  return rows[0];
}

class LateCommitBeforeCheckpointRepository extends PlatformDeliveryRepository {
  observedNoGapBeforeLateCommit: boolean | undefined;
  private inserted = false;

  constructor(private readonly lateEventId: string) {
    super();
  }

  override async recordPartialReconciliation(
    subscription: PlatformEventSubscription,
    gapEventIds: string[],
  ): Promise<void> {
    if (!this.inserted) {
      const activeSubscription = subscription as PlatformEventSubscription & {
        liveStartCreatedAt: Date;
        liveStartEventId: string;
      };
      this.observedNoGapBeforeLateCommit = !(await this.hasReconciliationGap(activeSubscription));
      await insertOrderCreatedEvent(this.lateEventId);
      this.inserted = true;
    }
    await super.recordPartialReconciliation(subscription, gapEventIds);
  }
}

describe.skipIf(!runDb)("Phase27A Platform Delivery integration", { timeout: 60000 }, () => {
  beforeAll(async () => {
    await runMigrations();
    await getMysqlPool().query(
      `INSERT INTO cities (city_code,city_name,is_open) VALUES (?,'Phase27A Test City',1)
       ON DUPLICATE KEY UPDATE city_name=VALUES(city_name),is_open=VALUES(is_open)`,
      [testCity],
    );
  });

  afterAll(async () => {
    await getMysqlPool().query("DELETE FROM cities WHERE city_code=?", [testCity]);
  });

  afterEach(async () => {
    await getMysqlPool().query(
      `DELETE FROM platform_event_delivery_attempts
       WHERE delivery_id IN (SELECT delivery_id FROM platform_event_deliveries WHERE subscriber_id LIKE ?)`,
      [`${prefix}%`],
    );
    await getMysqlPool().query("DELETE FROM platform_event_delivery_actions WHERE subscriber_id_copy LIKE ?", [`${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_deliveries WHERE subscriber_id LIKE ?", [`${prefix}%`]);
    await getMysqlPool().query(
      `DELETE FROM platform_event_materialization_checkpoints
       WHERE subscription_id IN (SELECT subscription_id FROM platform_event_subscriptions WHERE subscriber_id LIKE ?)`,
      [`${prefix}%`],
    );
    await getMysqlPool().query("DELETE FROM platform_event_replay_generations WHERE subscriber_id LIKE ?", [`${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_subscriptions WHERE subscriber_id LIKE ?", [`${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_subscribers WHERE subscriber_id LIKE ?", [`${prefix}%`]);
    await getMysqlPool().query("DELETE FROM event_outbox WHERE event_id LIKE ?", [`${prefix}%`]);
  });

  it("fails closed with no active subscription and rejects human/cross-city identities", async () => {
    const fixture = await createFixture("paused");
    const eventId = await insertOrderCreatedEvent();
    const service = new PlatformDeliveryService();
    await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId))
      .rejects.toBeInstanceOf(PlatformDeliveryAuthorizationError);
    await expect(service.materializeCandidateBatch({ ...fixture.identity, cityCode: "shanghai" }, fixture.subscriptionId))
      .rejects.toBeInstanceOf(PlatformDeliveryAuthorizationError);
    await expect(service.materializeCandidateBatch({
      appType: "admin",
      role: "admin",
      userId: "admin-1",
      cityCode: "hangzhou",
      subscriberId: fixture.subscriberId,
    }, fixture.subscriptionId)).rejects.toBeInstanceOf(PlatformDeliveryAuthorizationError);
    for (const status of ["proposed", "revoked"] as const) {
      await getMysqlPool().query(
        "UPDATE platform_event_subscriptions SET status=? WHERE subscription_id=?",
        [status, fixture.subscriptionId],
      );
      await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId))
        .rejects.toBeInstanceOf(PlatformDeliveryAuthorizationError);
    }
    const wrongMajor = await createFixture("active", 3, 1);
    await expect(service.materializeCandidateBatch(wrongMajor.identity, wrongMajor.subscriptionId))
      .rejects.toBeInstanceOf(PlatformDeliveryAuthorizationError);
    expect(await count("SELECT COUNT(*) count FROM platform_event_deliveries WHERE event_id=?", [eventId])).toBe(0);
  });

  it("converges invalid raw shape to one bounded terminal rejection fact", async () => {
    const fixture = await createFixture();
    const eventId = `${prefix}evt_invalid_${randomUUID()}`;
    const payload = {
      orderId: `${prefix}ord_invalid`,
      cityCode: testCity,
      customerId: `${prefix}customer`,
      skuId: "phase27a-test-sku",
      totalAmount: 88,
      createdAt: new Date().toISOString(),
      phone: "must-not-be-copied",
    };
    await getMysqlPool().query(
      `INSERT INTO event_outbox
        (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status)
       VALUES (?,'order.created','phase27a_test',?,?,?,'pending')`,
      [eventId, `${prefix}ord_invalid`, testCity, JSON.stringify(payload)],
    );
    const sourceBefore = await sourceLifecycle(eventId);
    const protectedBefore = await protectedCounts();
    const service = new PlatformDeliveryService();
    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scannedGaps: 1,
      repaired: 0,
      rejected: 1,
      remainingGaps: false,
      completeness: "partial",
    });
    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scannedGaps: 0,
      rejected: 0,
      remainingGaps: false,
      completeness: "partial",
    });
    await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scanned: 1,
      inserted: 0,
      rejected: 1,
    });
    await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scanned: 0,
      rejected: 0,
    });
    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scannedGaps: 0,
      completeness: "partial",
    });
    expect(await count("SELECT COUNT(*) count FROM platform_event_deliveries WHERE event_id=?", [eventId])).toBe(0);
    const [actions] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT reason_code,reason,payload_hash_copy,subscription_id_copy,
         compatibility_handler_revision_copy,change_reference
       FROM platform_event_delivery_actions
       WHERE subscriber_id_copy=? AND event_id_copy=? AND action_kind='materialization_rejected'`,
      [fixture.subscriberId, eventId],
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      reason_code: "INVALID_EVENT_PAYLOAD",
      reason: "event payload does not exactly match the approved implicit-v0 compatibility shape",
      subscription_id_copy: fixture.subscriptionId,
      compatibility_handler_revision_copy: "implicit-v0-order-created-r1",
    });
    expect(JSON.stringify(actions[0])).not.toContain("phone");
    expect(JSON.stringify(actions[0])).not.toContain("must-not-be-copied");
    expect(await sourceLifecycle(eventId)).toEqual(sourceBefore);
    expect(await protectedCounts()).toEqual(protectedBefore);
  });

  it("keeps reconciliation non-terminal across pagination and zero-gap observations", async () => {
    const fixture = await createFixture();
    const eventIds = await Promise.all([
      insertOrderCreatedEvent(),
      insertOrderCreatedEvent(),
      insertOrderCreatedEvent(),
    ]);
    const sourceBefore = await Promise.all(eventIds.map(sourceLifecycle));
    const protectedBefore = await protectedCounts();
    const service = new PlatformDeliveryService();

    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId, 2)).resolves.toMatchObject({
      scannedGaps: 2,
      repaired: 2,
      rejected: 0,
      remainingGaps: true,
      commitSkewRisk: false,
      completeness: "partial",
    });
    const [partialRows] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT last_reconciliation_result FROM platform_event_materialization_checkpoints
       WHERE city_code=? AND subscription_id=?`,
      [testCity, fixture.subscriptionId],
    );
    expect(partialRows[0]?.last_reconciliation_result).toBe("partial");

    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId, 2)).resolves.toMatchObject({
      scannedGaps: 1,
      repaired: 1,
      remainingGaps: false,
      completeness: "partial",
    });
    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId, 2)).resolves.toMatchObject({
      scannedGaps: 0,
      repaired: 0,
      remainingGaps: false,
      completeness: "partial",
    });
    expect(await count(
      "SELECT COUNT(*) count FROM platform_event_deliveries WHERE subscriber_id=? AND event_id IN (?,?,?)",
      [fixture.subscriberId, ...eventIds],
    )).toBe(3);
    expect(await Promise.all(eventIds.map(sourceLifecycle))).toEqual(sourceBefore);
    expect(await protectedCounts()).toEqual(protectedBefore);
  });

  it("persists partial when an eligible event commits after the zero-gap check and repairs it later", async () => {
    const fixture = await createFixture();
    const firstEventId = await insertOrderCreatedEvent();
    const lateEventId = `${prefix}race_${randomUUID().slice(0, 8)}`;
    const repository = new LateCommitBeforeCheckpointRepository(lateEventId);
    const service = new PlatformDeliveryService(repository);
    const firstSourceBefore = await sourceLifecycle(firstEventId);
    const protectedBefore = await protectedCounts();

    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scannedGaps: 1,
      repaired: 1,
      remainingGaps: false,
      completeness: "partial",
    });
    expect(repository.observedNoGapBeforeLateCommit).toBe(true);
    const lateSourceBefore = await sourceLifecycle(lateEventId);
    expect(lateSourceBefore?.status).toBe("pending");
    expect(await count(
      "SELECT COUNT(*) count FROM platform_event_deliveries WHERE subscriber_id=? AND event_id=?",
      [fixture.subscriberId, lateEventId],
    )).toBe(0);

    const [checkpointAfterRace] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT last_reconciliation_result FROM platform_event_materialization_checkpoints
       WHERE city_code=? AND subscription_id=?`,
      [testCity, fixture.subscriptionId],
    );
    expect(checkpointAfterRace[0]?.last_reconciliation_result).toBe("partial");

    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scannedGaps: 1,
      repaired: 1,
      remainingGaps: false,
      completeness: "partial",
    });
    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scannedGaps: 0,
      repaired: 0,
      remainingGaps: false,
      completeness: "partial",
    });

    expect(await count(
      "SELECT COUNT(*) count FROM platform_event_deliveries WHERE subscriber_id=? AND event_id IN (?,?)",
      [fixture.subscriberId, firstEventId, lateEventId],
    )).toBe(2);
    expect(await count(
      `SELECT COUNT(*) count FROM platform_event_delivery_actions
       WHERE subscriber_id_copy=? AND action_kind='reconciliation_repair'
         AND event_id_copy IN (?,?)`,
      [fixture.subscriberId, firstEventId, lateEventId],
    )).toBe(2);
    expect(await sourceLifecycle(firstEventId)).toEqual(firstSourceBefore);
    expect(await sourceLifecycle(lateEventId)).toEqual(lateSourceBefore);
    expect(await protectedCounts()).toEqual(protectedBefore);
  });

  it("materializes idempotently while source and protected domains remain byte-for-byte lifecycle stable", async () => {
    const fixture = await createFixture();
    const eventId = await insertOrderCreatedEvent();
    const beforeSource = await sourceLifecycle(eventId);
    const beforeProtected = await protectedCounts();
    const service = new PlatformDeliveryService();

    await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scanned: 1,
      inserted: 1,
      rejected: 0,
      checkpointAdvanced: true,
    });
    await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scanned: 0,
      inserted: 0,
    });
    await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
      scannedGaps: 0,
      repaired: 0,
    });
    expect(await count(
      "SELECT COUNT(*) count FROM platform_event_deliveries WHERE subscriber_id=? AND event_id=?",
      [fixture.subscriberId, eventId],
    )).toBe(1);
    const crossCityEvent = await insertOrderCreatedEvent();
    await expect(getMysqlPool().query(
      `INSERT INTO platform_event_deliveries
        (delivery_id,city_code,subscriber_id,subscription_id,event_id,event_type,event_major_version,
         payload_hash,aggregate_type,aggregate_id,status,max_attempts)
       VALUES (?,'shanghai',?,?,?,'order.created',0,?,'phase27a_test','cross-city','pending',3)`,
      [
        `${prefix}cross_city`, fixture.subscriberId, fixture.subscriptionId, crossCityEvent,
        "a".repeat(64),
      ],
    )).rejects.toBeDefined();
    expect(await sourceLifecycle(eventId)).toEqual(beforeSource);
    expect(await protectedCounts()).toEqual(beforeProtected);
  });

  it("repairs real commit skew through retained-source anti-join without duplicate delivery", async () => {
    const fixture = await createFixture();
    const service = new PlatformDeliveryService();
    const connectionA = await getMysqlPool().getConnection();
    let committedA = false;
    const eventA = `${prefix}evt_a_${randomUUID()}`;
    const eventB = `${prefix}evt_b_${randomUUID()}`;
    try {
      await connectionA.beginTransaction();
      await insertOrderCreatedEvent(eventA, connectionA, "DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 10 SECOND)");
      await insertOrderCreatedEvent(eventB);

      await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
        scanned: 1,
        inserted: 1,
      });
      await connectionA.commit();
      committedA = true;

      await expect(service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
        scanned: 0,
      });
      await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
        scannedGaps: 1,
        repaired: 1,
        remainingGaps: false,
        commitSkewRisk: true,
        completeness: "partial",
      });
      await expect(service.reconcileRetainedSource(fixture.identity, fixture.subscriptionId)).resolves.toMatchObject({
        scannedGaps: 0,
        repaired: 0,
        commitSkewRisk: false,
        completeness: "partial",
      });
      expect(await count(
        "SELECT COUNT(*) count FROM platform_event_deliveries WHERE subscriber_id=? AND event_id IN (?,?)",
        [fixture.subscriberId, eventA, eventB],
      )).toBe(2);
      expect(await count(
        "SELECT COUNT(*) count FROM platform_event_delivery_actions WHERE subscriber_id_copy=? AND action_kind='reconciliation_repair'",
        [fixture.subscriberId],
      )).toBe(1);
      expect((await sourceLifecycle(eventA))?.status).toBe("pending");
      expect((await sourceLifecycle(eventB))?.status).toBe("pending");
    } finally {
      if (!committedA) {
        await connectionA.rollback().catch(() => undefined);
      }
      connectionA.release();
    }
  });

  it("denies acknowledge and fail through another active exact subscription", async () => {
    const fixture = await createFixture();
    const wrongSubscriptionId = await createAdditionalActiveSubscription(fixture);
    const eventId = await insertOrderCreatedEvent();
    const service = new PlatformDeliveryService();
    await service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId);
    const [claim] = await service.claim(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      owner: "owner-exact-subscription",
      limit: 1,
    });
    expect(claim).toBeDefined();

    const mutation = {
      subscriptionId: wrongSubscriptionId,
      deliveryId: claim!.deliveryId,
      owner: claim!.leaseOwner,
      leaseToken: claim!.leaseToken,
      expectedRowVersion: claim!.rowVersion,
    };
    const [deliveryBefore] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT * FROM platform_event_deliveries WHERE delivery_id=?",
      [claim!.deliveryId],
    );
    const [attemptBefore] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT * FROM platform_event_delivery_attempts WHERE delivery_id=? ORDER BY attempt_number",
      [claim!.deliveryId],
    );
    const sourceBefore = await sourceLifecycle(eventId);
    const protectedBefore = await protectedCounts();

    await expect(service.acknowledge(fixture.identity, mutation)).resolves.toMatchObject({ outcome: "conflict" });
    await expect(service.fail(fixture.identity, mutation, new Error("must not apply")))
      .resolves.toMatchObject({ outcome: "conflict" });

    const [deliveryAfter] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT * FROM platform_event_deliveries WHERE delivery_id=?",
      [claim!.deliveryId],
    );
    const [attemptAfter] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT * FROM platform_event_delivery_attempts WHERE delivery_id=? ORDER BY attempt_number",
      [claim!.deliveryId],
    );
    expect(deliveryAfter).toEqual(deliveryBefore);
    expect(attemptAfter).toEqual(attemptBefore);
    expect(await sourceLifecycle(eventId)).toEqual(sourceBefore);
    expect(await protectedCounts()).toEqual(protectedBefore);

    const correctMutation = { ...mutation, subscriptionId: fixture.subscriptionId };
    await expect(service.acknowledge(fixture.identity, correctMutation)).resolves.toMatchObject({
      outcome: "applied",
      status: "delivered",
    });
    await expect(service.acknowledge(fixture.identity, correctMutation)).resolves.toMatchObject({
      outcome: "already_applied",
      status: "delivered",
    });
  });

  it("persists one allowlisted projection in delivery and attempt without raw failure data", async () => {
    const fixture = await createFixture("active", 2);
    const eventId = await insertOrderCreatedEvent();
    const service = new PlatformDeliveryService();
    const sourceBefore = await sourceLifecycle(eventId);
    const protectedBefore = await protectedCounts();
    await service.materializeCandidateBatch(fixture.identity, fixture.subscriptionId);
    const [claim] = await service.claim(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      owner: "owner-safe-error-projection",
      limit: 1,
    });
    expect(claim).toBeDefined();

    const rawValues = [
      "13800138000",
      "杭州市西湖区测试路 1 号",
      "张三",
      "raw-access-token",
      "Authorization: Bearer raw-access-token",
      "provider response body",
      "<html>provider failed</html>",
      "<error>provider failed</error>",
      "second line",
    ];
    const untrustedFailure = Object.assign(
      new Error(`phone=${rawValues[0]} address=${rawValues[1]} name=${rawValues[2]}\n${rawValues.slice(3).join("\n")}`),
      {
        code: "INVALID_EVENT_PAYLOAD",
        providerBody: { token: rawValues[3], body: rawValues[5] },
      },
    );
    const mutation = {
      subscriptionId: fixture.subscriptionId,
      deliveryId: claim!.deliveryId,
      owner: claim!.leaseOwner,
      leaseToken: claim!.leaseToken,
      expectedRowVersion: claim!.rowVersion,
    };

    await expect(service.fail(fixture.identity, { ...mutation, expectedRowVersion: mutation.expectedRowVersion - 1 }, untrustedFailure))
      .resolves.toMatchObject({ outcome: "conflict", status: "processing" });
    await expect(service.fail(fixture.identity, mutation, untrustedFailure))
      .resolves.toMatchObject({ outcome: "applied", status: "retry_wait" });

    const [firstDelivery] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT status,last_error_code,last_error_message,row_version
       FROM platform_event_deliveries WHERE delivery_id=?`,
      [claim!.deliveryId],
    );
    const [firstAttempt] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT outcome,error_code,error_message
       FROM platform_event_delivery_attempts WHERE delivery_id=? AND attempt_number=1`,
      [claim!.deliveryId],
    );
    expect(firstDelivery[0]).toMatchObject({
      status: "retry_wait",
      last_error_code: "PLATFORM_DELIVERY_ERROR",
      last_error_message: "platform delivery failed",
    });
    expect(firstAttempt[0]).toMatchObject({
      outcome: "retry_wait",
      error_code: "PLATFORM_DELIVERY_ERROR",
      error_message: "platform delivery failed",
    });
    const firstPersisted = JSON.stringify({ delivery: firstDelivery[0], attempt: firstAttempt[0] });
    for (const raw of rawValues) expect(firstPersisted).not.toContain(raw);

    await expect(service.fail(fixture.identity, mutation, new Error("duplicate raw Provider body")))
      .resolves.toMatchObject({ outcome: "already_applied", status: "retry_wait" });
    const [afterDuplicateDelivery] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT status,last_error_code,last_error_message,row_version
       FROM platform_event_deliveries WHERE delivery_id=?`,
      [claim!.deliveryId],
    );
    const [afterDuplicateAttempt] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT outcome,error_code,error_message
       FROM platform_event_delivery_attempts WHERE delivery_id=? AND attempt_number=1`,
      [claim!.deliveryId],
    );
    expect(afterDuplicateDelivery).toEqual(firstDelivery);
    expect(afterDuplicateAttempt).toEqual(firstAttempt);

    await getMysqlPool().query(
      "UPDATE platform_event_deliveries SET available_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE delivery_id=?",
      [claim!.deliveryId],
    );
    const [retryClaim] = await service.claim(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      owner: "owner-safe-error-retry",
      limit: 1,
    });
    await expect(service.fail(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      deliveryId: retryClaim!.deliveryId,
      owner: retryClaim!.leaseOwner,
      leaseToken: retryClaim!.leaseToken,
      expectedRowVersion: retryClaim!.rowVersion,
    }, new PlatformDeliveryCanonicalError("INVALID_EVENT_PAYLOAD")))
      .resolves.toMatchObject({ outcome: "applied", status: "dead_letter" });

    const [terminalDelivery] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT status,last_error_code,last_error_message
       FROM platform_event_deliveries WHERE delivery_id=?`,
      [claim!.deliveryId],
    );
    const [terminalAttempt] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT outcome,error_code,error_message
       FROM platform_event_delivery_attempts WHERE delivery_id=? AND attempt_number=2`,
      [claim!.deliveryId],
    );
    expect(terminalDelivery[0]).toMatchObject({
      status: "dead_letter",
      last_error_code: "INVALID_EVENT_PAYLOAD",
      last_error_message: PLATFORM_DELIVERY_CANONICAL_ERRORS.INVALID_EVENT_PAYLOAD,
    });
    expect(terminalAttempt[0]).toMatchObject({
      outcome: "dead_letter",
      error_code: "INVALID_EVENT_PAYLOAD",
      error_message: PLATFORM_DELIVERY_CANONICAL_ERRORS.INVALID_EVENT_PAYLOAD,
    });
    expect(await sourceLifecycle(eventId)).toEqual(sourceBefore);
    expect(await protectedCounts()).toEqual(protectedBefore);
  });

  it("enforces one lease, owner/token/version CAS, retry, reaper, DLQ and subscriber isolation", async () => {
    const first = await createFixture("active", 2);
    const second = await createFixture("active", 2);
    const eventId = await insertOrderCreatedEvent();
    const service = new PlatformDeliveryService();
    const protectedBefore = await protectedCounts();
    await service.materializeCandidateBatch(first.identity, first.subscriptionId);
    await service.materializeCandidateBatch(second.identity, second.subscriptionId);

    const concurrent = await Promise.all([
      service.claim(first.identity, { subscriptionId: first.subscriptionId, owner: "owner-a", limit: 1 }),
      service.claim(first.identity, { subscriptionId: first.subscriptionId, owner: "owner-b", limit: 1 }),
    ]);
    expect(concurrent.flat()).toHaveLength(1);
    const firstClaim = concurrent.flat()[0]!;
    await expect(service.acknowledge(first.identity, {
      subscriptionId: first.subscriptionId,
      deliveryId: firstClaim.deliveryId,
      owner: "not-owner",
      leaseToken: firstClaim.leaseToken,
      expectedRowVersion: firstClaim.rowVersion,
    })).resolves.toMatchObject({ outcome: "conflict" });
    await expect(service.acknowledge(first.identity, {
      subscriptionId: first.subscriptionId,
      deliveryId: firstClaim.deliveryId,
      owner: firstClaim.leaseOwner,
      leaseToken: randomUUID(),
      expectedRowVersion: firstClaim.rowVersion,
    })).resolves.toMatchObject({ outcome: "conflict" });
    const firstFailRequest = {
      subscriptionId: first.subscriptionId,
      deliveryId: firstClaim.deliveryId,
      owner: firstClaim.leaseOwner,
      leaseToken: firstClaim.leaseToken,
      expectedRowVersion: firstClaim.rowVersion,
    };
    await expect(service.fail(first.identity, firstFailRequest, new Error("temporary token=secret")))
      .resolves.toMatchObject({ outcome: "applied", status: "retry_wait" });
    await expect(service.fail(first.identity, firstFailRequest, new Error("duplicate")))
      .resolves.toMatchObject({ outcome: "already_applied", status: "retry_wait" });

    await getMysqlPool().query(
      "UPDATE platform_event_deliveries SET available_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE delivery_id=?",
      [firstClaim.deliveryId],
    );
    const [retryClaim] = await service.claim(first.identity, {
      subscriptionId: first.subscriptionId,
      owner: "owner-retry",
      limit: 1,
    });
    expect(retryClaim?.attemptCount).toBe(2);
    await expect(service.fail(first.identity, {
      subscriptionId: first.subscriptionId,
      deliveryId: retryClaim!.deliveryId,
      owner: retryClaim!.leaseOwner,
      leaseToken: retryClaim!.leaseToken,
      expectedRowVersion: retryClaim!.rowVersion,
    }, Object.assign(new Error("poison"), { code: "INVALID_EVENT" })))
      .resolves.toMatchObject({ outcome: "applied", status: "dead_letter" });

    const [isolatedClaim] = await service.claim(second.identity, {
      subscriptionId: second.subscriptionId,
      owner: "owner-second-subscriber",
      limit: 1,
    });
    expect(isolatedClaim?.eventId).toBe(eventId);
    await getMysqlPool().query(
      "UPDATE platform_event_deliveries SET lease_expires_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE delivery_id=?",
      [isolatedClaim!.deliveryId],
    );
    await expect(service.acknowledge(second.identity, {
      subscriptionId: second.subscriptionId,
      deliveryId: isolatedClaim!.deliveryId,
      owner: isolatedClaim!.leaseOwner,
      leaseToken: isolatedClaim!.leaseToken,
      expectedRowVersion: isolatedClaim!.rowVersion,
    })).resolves.toMatchObject({ outcome: "conflict" });
    await expect(service.reapExpiredLeases(second.identity, second.subscriptionId)).resolves.toBe(1);
    const [afterReap] = await service.claim(second.identity, {
      subscriptionId: second.subscriptionId,
      owner: "owner-after-reap",
      limit: 1,
    });
    await expect(service.acknowledge(second.identity, {
      subscriptionId: second.subscriptionId,
      deliveryId: afterReap!.deliveryId,
      owner: afterReap!.leaseOwner,
      leaseToken: afterReap!.leaseToken,
      expectedRowVersion: afterReap!.rowVersion,
    })).resolves.toMatchObject({ outcome: "applied", status: "delivered" });
    await expect(service.acknowledge(second.identity, {
      subscriptionId: second.subscriptionId,
      deliveryId: afterReap!.deliveryId,
      owner: afterReap!.leaseOwner,
      leaseToken: afterReap!.leaseToken,
      expectedRowVersion: afterReap!.rowVersion,
    })).resolves.toMatchObject({ outcome: "already_applied", status: "delivered" });

    expect(await count(
      "SELECT COUNT(*) count FROM platform_event_delivery_attempts WHERE delivery_id IN (?,?)",
      [firstClaim.deliveryId, isolatedClaim!.deliveryId],
    )).toBe(4);
    expect((await sourceLifecycle(eventId))?.status).toBe("pending");
    expect(await protectedCounts()).toEqual(protectedBefore);
  });
});
