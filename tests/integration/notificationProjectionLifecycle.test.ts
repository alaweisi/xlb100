import { randomUUID } from "node:crypto";
import type { PlatformServiceIdentity } from "@xlb/types";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import { PlatformDeliveryService } from "../../backend/src/events/platformDeliveryService.js";
import { canonicalPayloadHash } from "../../backend/src/events/platformEventCompatibility.js";
import {
  notificationCanonicalJson,
  notificationSha256,
  NotificationProjectionError,
} from "../../backend/src/notification/notificationProjectionPolicy.js";
import { NotificationService } from "../../backend/src/notification/notificationService.js";
import { NotificationProjectionWorker } from "../../backend/src/notification/notificationProjectionWorker.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const prefix = `p27b_${Date.now().toString(36)}_`;
const testCity = `phase27b_test_${Date.now().toString(36)}`;
let fixtureSequence = 0;

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>(sql, params);
  return Number(rows[0]?.count ?? 0);
}

async function sourceLifecycle(eventId: string) {
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(
    `SELECT status,lease_owner,lease_token,lease_expires_at,attempt_count,
       last_error_code,last_error_message,published_at
     FROM event_outbox WHERE event_id=?`,
    [eventId],
  );
  return rows[0];
}

async function createClaimFixture(exactRuntimeTemplateKey = false) {
  const suffix = randomUUID().slice(0, 8);
  const subscriberId = `${prefix}sub_${suffix}`;
  const subscriptionId = `${prefix}sc_${suffix}`;
  const eventId = `${prefix}evt_${String(++fixtureSequence).padStart(4, "0")}_${suffix}`;
  const serviceId = `${prefix}service_${suffix}`;
  const customerId = `${prefix}customer_${suffix}`;
  const orderId = `${prefix}order_${suffix}`;
  const templateId = `${prefix}tpl_${suffix}`;
  const templateRevisionId = `${prefix}rev_${suffix}`;
  const identity: PlatformServiceIdentity = {
    identityKind: "platform_service",
    credentialKind: "internal_domain_contract",
    serviceId,
    subscriberId,
    cityCode: testCity,
  };
  await getMysqlPool().query(
    `INSERT INTO platform_event_subscribers
      (subscriber_id,stable_name,owner_domain,handler_revision,purpose,max_pii_level,status,
       created_by_service_id,updated_by_service_id)
     VALUES (?,?, 'notification','implicit-v0-order-created-r1','Phase27B dormant test','P1','active',?,?)`,
    [subscriberId, `${prefix}stable_${suffix}`, serviceId, serviceId],
  );
  await getMysqlPool().query(
    `INSERT INTO platform_event_subscriptions
      (subscription_id,city_code,subscriber_id,event_type,event_major_version,
       compatibility_handler_revision,live_start_created_at,live_start_event_id,retention_class,status,
       lease_seconds,max_attempts,created_by_service_id,updated_by_service_id)
     VALUES (?,?,?,'order.created',0,'implicit-v0-order-created-r1',
       DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR),'!','R1','active',30,3,?,?)`,
    [subscriptionId, testCity, subscriberId, serviceId, serviceId],
  );
  const occurredAt = new Date().toISOString();
  await getMysqlPool().query(
    `INSERT INTO event_outbox
      (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status)
     VALUES (?,'order.created','phase27b_test',?,?,?,'pending')`,
    [
      eventId,
      orderId,
      testCity,
      JSON.stringify({
        orderId,
        cityCode: testCity,
        customerId,
        skuId: "discard-only-sku",
        totalAmount: 88,
        createdAt: occurredAt,
      }),
    ],
  );
  await getMysqlPool().query(
    `UPDATE platform_event_subscriptions
     SET live_start_created_at=(SELECT created_at FROM event_outbox WHERE event_id=?),
         live_start_event_id=?
     WHERE subscription_id=?`,
    [eventId, eventId, subscriptionId],
  );
  const parameterNames = ["orderId"];
  const templateKey = exactRuntimeTemplateKey
    ? "inapp.order.created.customer"
    : `order.created.${suffix}`;
  const revisionLabel = "r1";
  const titleTemplate = "订单已创建";
  const bodyTemplate = "订单 {{orderId}} 已创建";
  const contentHash = notificationSha256(notificationCanonicalJson({
    templateId,
    templateKey,
    revisionLabel,
    locale: "zh-CN",
    eventType: "order.created",
    recipientType: "customer",
    parameterNames,
    titleTemplate,
    bodyTemplate,
    piiLevel: "P1",
  }));
  await getMysqlPool().query(
    `INSERT INTO notification_templates
      (template_id,city_code,template_key,event_type,recipient_type,category_code,
       owner_service_id,status)
     VALUES (?,?,?,'order.created','customer',?,?,'published')`,
    [templateId, testCity, templateKey, `transactional_${suffix}`, serviceId],
  );
  await getMysqlPool().query(
    `INSERT INTO notification_template_revisions
      (template_revision_id,city_code,template_id,revision_number,revision_label,locale,
       title_pattern,body_pattern,parameter_names_json,content_hash,pii_level,status,
       created_by_service_id,reviewed_by_actor_id,published_by_actor_id,reviewed_at,published_at)
     VALUES (?,?,?,1,?,'zh-CN',?,?,?,?, 'P1','published',?,?,?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
    [
      templateRevisionId,
      testCity,
      templateId,
      revisionLabel,
      titleTemplate,
      bodyTemplate,
      JSON.stringify(parameterNames),
      contentHash,
      serviceId,
      `${prefix}reviewer`,
      `${prefix}publisher`,
    ],
  );
  const platform = new PlatformDeliveryService();
  await platform.materializeCandidateBatch(identity, subscriptionId);
  const [claim] = await platform.claim(identity, {
    subscriptionId,
    owner: `${prefix}owner`,
    limit: 1,
    leaseSeconds: 30,
  });
  if (!claim) throw new Error("test claim missing");
  if (claim.eventId !== eventId) throw new Error("test claim did not select its exact fixture event");
  return {
    identity,
    subscriptionId,
    subscriberId,
    eventId,
    templateRevisionId,
    templateId,
    claim,
    customerId,
    orderId,
    occurredAt,
  };
}

async function insertPublishedRevision(
  fixture: Awaited<ReturnType<typeof createClaimFixture>>,
  revisionNumber: number,
): Promise<string> {
  const templateRevisionId = `${prefix}rev_${revisionNumber}_${randomUUID().slice(0, 8)}`;
  const revisionLabel = `r${revisionNumber}`;
  const parameterNames = ["orderId"];
  const titleTemplate = `订单已创建 v${revisionNumber}`;
  const bodyTemplate = `订单 {{orderId}} 已创建 v${revisionNumber}`;
  const contentHash = notificationSha256(notificationCanonicalJson({
    templateId: fixture.templateId,
    templateKey: "inapp.order.created.customer",
    revisionLabel,
    locale: "zh-CN",
    eventType: "order.created",
    recipientType: "customer",
    parameterNames,
    titleTemplate,
    bodyTemplate,
    piiLevel: "P1",
  }));
  await getMysqlPool().query(
    `INSERT INTO notification_template_revisions
      (template_revision_id,city_code,template_id,revision_number,revision_label,locale,
       title_pattern,body_pattern,parameter_names_json,content_hash,pii_level,status,
       created_by_service_id,reviewed_by_actor_id,published_by_actor_id,reviewed_at,published_at)
     VALUES (?,?,?,?,?,'zh-CN',?,?,?,?, 'P1','published',?,?,?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
    [
      templateRevisionId,
      testCity,
      fixture.templateId,
      revisionNumber,
      revisionLabel,
      titleTemplate,
      bodyTemplate,
      JSON.stringify(parameterNames),
      contentHash,
      fixture.identity.serviceId,
      `${prefix}reviewer`,
      `${prefix}publisher`,
    ],
  );
  return templateRevisionId;
}

describe.skipIf(!runDb)("Phase27B dormant Notification projection", { timeout: 60000 }, () => {
  beforeAll(async () => {
    await runMigrations();
    await getMysqlPool().query(
      `INSERT INTO cities (city_code,city_name,is_open) VALUES (?,'Phase27B Test City',1)
       ON DUPLICATE KEY UPDATE city_name=VALUES(city_name),is_open=VALUES(is_open)`,
      [testCity],
    );
  });

  afterEach(async () => {
    await getMysqlPool().query("DELETE FROM notification_actions WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM notification_tombstones WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM notification_recipient_states WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM notification_delivery_receipts WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM notification_records WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM notification_recipient_preferences WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM notification_template_revisions WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM notification_templates WHERE city_code=?", [testCity]);
    await getMysqlPool().query(
      `DELETE FROM platform_event_delivery_attempts
       WHERE delivery_id IN (SELECT delivery_id FROM platform_event_deliveries WHERE city_code=?)`,
      [testCity],
    );
    await getMysqlPool().query("DELETE FROM platform_event_delivery_actions WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM platform_event_deliveries WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM platform_event_materialization_checkpoints WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM platform_event_replay_generations WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM platform_event_subscriptions WHERE city_code=?", [testCity]);
    await getMysqlPool().query("DELETE FROM platform_event_subscribers WHERE subscriber_id LIKE ?", [`${prefix}%`]);
    await getMysqlPool().query("DELETE FROM event_outbox WHERE city_code=? AND event_id LIKE ?", [testCity, `${prefix}%`]);
  });

  afterAll(async () => {
    await getMysqlPool().query("DELETE FROM cities WHERE city_code=?", [testCity]);
  });

  it("atomically persists one minimal inbox effect and reuses it after an ack-lost retry", async () => {
    const fixture = await createClaimFixture();
    const sourceBefore = await sourceLifecycle(fixture.eventId);
    const service = new NotificationService();
    const request = {
      claim: {
        subscriptionId: fixture.subscriptionId,
        deliveryId: fixture.claim.deliveryId,
        owner: fixture.claim.leaseOwner,
        leaseToken: fixture.claim.leaseToken,
        expectedRowVersion: fixture.claim.rowVersion,
      },
      templateRevisionId: fixture.templateRevisionId,
    };
    const concurrent = await Promise.all([
      service.materializeClaim(fixture.identity, request),
      service.materializeClaim(fixture.identity, request),
    ]);
    expect(concurrent.map((result) => result.outcome).sort()).toEqual(["already_applied", "applied"]);
    const first = concurrent.find((result) => result.outcome === "applied")!;
    const repeated = await service.materializeClaim(fixture.identity, request);
    expect(repeated).toEqual({ ...first, outcome: "already_applied" });

    expect(await count("SELECT COUNT(*) count FROM notification_records WHERE city_code=?", [testCity])).toBe(1);
    expect(await count("SELECT COUNT(*) count FROM notification_delivery_receipts WHERE city_code=?", [testCity])).toBe(1);
    expect(await count("SELECT COUNT(*) count FROM notification_recipient_states WHERE city_code=?", [testCity])).toBe(1);
    expect(await count("SELECT COUNT(*) count FROM notification_actions WHERE city_code=?", [testCity])).toBe(1);
    const [rows] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT recipient_type,recipient_id,render_parameters_json,rendered_title,rendered_body,
         payload_hash,target_fingerprint
       FROM notification_records WHERE notification_id=?`,
      [first.notificationId],
    );
    expect(rows[0]).toMatchObject({
      recipient_type: "customer",
      recipient_id: fixture.customerId,
      rendered_title: "订单已创建",
      rendered_body: `订单 ${fixture.orderId} 已创建`,
    });
    const persisted = JSON.stringify(rows[0]);
    expect(persisted).not.toContain("discard-only-sku");
    expect(persisted).not.toContain("totalAmount");
    expect(persisted).not.toContain(fixture.claim.leaseToken);
    expect(await sourceLifecycle(fixture.eventId)).toEqual(sourceBefore);

    await expect(service.materializeClaim(fixture.identity, {
      ...request,
      templateRevisionId: `${prefix}different-revision`,
    })).rejects.toBeInstanceOf(NotificationProjectionError);
    await expect(service.materializeClaim(fixture.identity, {
      ...request,
      claim: { ...request.claim, leaseToken: randomUUID() },
    })).rejects.toMatchObject({ code: "CLAIM_NOT_AVAILABLE" });
    expect(await count("SELECT COUNT(*) count FROM notification_records WHERE city_code=?", [testCity])).toBe(1);
  });

  it("revalidates active subscription, handler revision, and source payload inside the target transaction", async () => {
    const mutations: Array<{
      name: string;
      run: (fixture: Awaited<ReturnType<typeof createClaimFixture>>) => Promise<void>;
    }> = [
      { name: "paused subscription", run: async (fixture) => {
        await getMysqlPool().query(
          "UPDATE platform_event_subscriptions SET status='paused' WHERE subscription_id=?",
          [fixture.subscriptionId],
        );
      } },
      { name: "changed handler revision", run: async (fixture) => {
        await getMysqlPool().query(
          "UPDATE platform_event_subscriptions SET compatibility_handler_revision='changed-after-projection' WHERE subscription_id=?",
          [fixture.subscriptionId],
        );
      } },
      { name: "changed source payload", run: async (fixture) => {
        const mutationConnection = await getMysqlPool().getConnection();
        await mutationConnection.beginTransaction();
        const changedPayload = {
          orderId: `${fixture.orderId}_changed`,
          cityCode: testCity,
          customerId: fixture.customerId,
          skuId: "discard-only-sku",
          totalAmount: 89,
          createdAt: fixture.occurredAt,
        };
        const changedPayloadHash = canonicalPayloadHash(changedPayload);
        await mutationConnection.query(
          "UPDATE event_outbox SET payload_json=? WHERE event_id=?",
          [JSON.stringify(changedPayload), fixture.eventId],
        );
        await mutationConnection.query(
          "UPDATE platform_event_deliveries SET payload_hash=? WHERE delivery_id=?",
          [changedPayloadHash, fixture.claim.deliveryId],
        );
        await mutationConnection.commit();
        mutationConnection.release();
        const [rows] = await getMysqlPool().query<RowDataPacket[]>(
          `SELECT e.payload_json,d.payload_hash FROM event_outbox e
           INNER JOIN platform_event_deliveries d ON d.event_id=e.event_id
           WHERE e.event_id=?`,
          [fixture.eventId],
        );
        const rawPayload = rows[0]?.payload_json;
        const payload = typeof rawPayload === "string"
          ? JSON.parse(rawPayload)
          : Buffer.isBuffer(rawPayload)
            ? JSON.parse(rawPayload.toString("utf8"))
            : rawPayload;
        expect(payload).toEqual(changedPayload);
        expect(canonicalPayloadHash(payload)).toBe(rows[0]?.payload_hash);
        expect(rows[0]?.payload_hash).not.toBe(fixture.claim.payloadHash);
      } },
    ];

    for (const mutation of mutations) {
      const fixture = await createClaimFixture();
      const platform = new PlatformDeliveryService();
      const claim = {
        subscriptionId: fixture.subscriptionId,
        deliveryId: fixture.claim.deliveryId,
        owner: fixture.claim.leaseOwner,
        leaseToken: fixture.claim.leaseToken,
        expectedRowVersion: fixture.claim.rowVersion,
      };
      const projection = await platform.projectClaimForNotification(fixture.identity, claim);
      if (!projection) throw new Error("initial projection missing");
      await mutation.run(fixture);
      const connection = await getMysqlPool().getConnection();
      await connection.beginTransaction();
      const result = await platform.revalidateNotificationProjectionClaim(
        fixture.identity,
        claim,
        projection,
        connection,
      ).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      await connection.rollback();
      connection.release();
      if (result.ok) {
        throw new Error(`${mutation.name} unexpectedly passed transaction revalidation`);
      }
      expect(result.error).toBeInstanceOf(Error);
      expect(await count(
        "SELECT COUNT(*) count FROM notification_records WHERE subscriber_id=? AND source_event_id=?",
        [fixture.subscriberId, fixture.eventId],
      )).toBe(0);
    }
  });

  it("rejects a receipt that combines one exact delivery key with another notification target", async () => {
    const deliveryFixture = await createClaimFixture();
    const targetFixture = await createClaimFixture();
    const service = new NotificationService();
    const target = await service.materializeClaim(targetFixture.identity, {
      claim: {
        subscriptionId: targetFixture.subscriptionId,
        deliveryId: targetFixture.claim.deliveryId,
        owner: targetFixture.claim.leaseOwner,
        leaseToken: targetFixture.claim.leaseToken,
        expectedRowVersion: targetFixture.claim.rowVersion,
      },
      templateRevisionId: targetFixture.templateRevisionId,
    });
    const [rows] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT template_revision_id,payload_hash,target_fingerprint
       FROM notification_records WHERE notification_id=?`,
      [target.notificationId],
    );
    const targetRow = rows[0]!;
    await getMysqlPool().query(
      "DELETE FROM notification_delivery_receipts WHERE notification_id=?",
      [target.notificationId],
    );
    await expect(getMysqlPool().query(
      `INSERT INTO notification_delivery_receipts
        (receipt_id,city_code,subscriber_id,event_id,notification_id,template_revision_id,
         source_payload_hash,target_fingerprint,result)
       VALUES (?,?,?,?,?,?,?,?,'applied')`,
      [
        `${prefix}mismatch_${randomUUID().slice(0, 8)}`,
        testCity,
        deliveryFixture.subscriberId,
        deliveryFixture.eventId,
        target.notificationId,
        targetRow.template_revision_id,
        targetRow.payload_hash,
        targetRow.target_fingerprint,
      ],
    )).rejects.toMatchObject({ code: "ER_NO_REFERENCED_ROW_2" });
  });

  it("selects the highest exact published template once and reuses that canonical receipt after ack loss", async () => {
    const fixture = await createClaimFixture(true);
    const revision2 = await insertPublishedRevision(fixture, 2);
    const service = new NotificationService();
    const claim = {
      subscriptionId: fixture.subscriptionId,
      deliveryId: fixture.claim.deliveryId,
      owner: fixture.claim.leaseOwner,
      leaseToken: fixture.claim.leaseToken,
      expectedRowVersion: fixture.claim.rowVersion,
    };
    const first = await service.materializeClaimWithCurrentTemplate(fixture.identity, claim);
    expect(first.outcome).toBe("applied");
    const revision3 = await insertPublishedRevision(fixture, 3);

    const retried = await service.materializeClaimWithCurrentTemplate(fixture.identity, claim);
    expect(retried).toEqual({ ...first, outcome: "already_applied" });
    const [rows] = await getMysqlPool().query<RowDataPacket[]>(
      `SELECT template_revision_id,rendered_title FROM notification_records
       WHERE notification_id=?`,
      [first.notificationId],
    );
    expect(rows[0]).toMatchObject({
      template_revision_id: revision2,
      rendered_title: "订单已创建 v2",
    });
    expect(rows[0]?.template_revision_id).not.toBe(revision3);
    expect(await count("SELECT COUNT(*) count FROM notification_records WHERE city_code=?", [testCity])).toBe(1);
  });

  it("runs the prospective B2 path and acknowledges once", async () => {
    const fixture = await createClaimFixture(true);
    const platform = new PlatformDeliveryService();
    await platform.fail(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      deliveryId: fixture.claim.deliveryId,
      owner: fixture.claim.leaseOwner,
      leaseToken: fixture.claim.leaseToken,
      expectedRowVersion: fixture.claim.rowVersion,
    }, new Error("test lease handoff"));
    await getMysqlPool().query(
      "UPDATE platform_event_deliveries SET available_at=CURRENT_TIMESTAMP(3) WHERE delivery_id=?",
      [fixture.claim.deliveryId],
    );

    const worker = new NotificationProjectionWorker();
    const first = await worker.runOnce(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      owner: `${prefix}runtime_owner`,
      limit: 1,
      leaseSeconds: 30,
    });
    expect(first).toEqual({
      claimed: 1,
      projected: 1,
      reused: 0,
      acknowledged: 1,
      failed: 0,
      conflicts: 0,
    });
    expect(await count("SELECT COUNT(*) count FROM notification_records WHERE city_code=?", [testCity])).toBe(1);
    const [deliveryRows] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT status FROM platform_event_deliveries WHERE delivery_id=?",
      [fixture.claim.deliveryId],
    );
    expect(deliveryRows[0]?.status).toBe("delivered");

    const repeated = await worker.runOnce(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      owner: `${prefix}runtime_owner_2`,
      limit: 1,
    });
    expect(repeated.claimed).toBe(0);
  });

  it("fails closed through the Phase27A retry lifecycle when no exact published template exists", async () => {
    const fixture = await createClaimFixture();
    const platform = new PlatformDeliveryService();
    await platform.fail(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      deliveryId: fixture.claim.deliveryId,
      owner: fixture.claim.leaseOwner,
      leaseToken: fixture.claim.leaseToken,
      expectedRowVersion: fixture.claim.rowVersion,
    }, new Error("test lease handoff"));
    await getMysqlPool().query(
      "UPDATE platform_event_deliveries SET available_at=CURRENT_TIMESTAMP(3) WHERE delivery_id=?",
      [fixture.claim.deliveryId],
    );

    const result = await new NotificationProjectionWorker().runOnce(fixture.identity, {
      subscriptionId: fixture.subscriptionId,
      owner: `${prefix}missing_template_owner`,
      limit: 1,
    });
    expect(result).toMatchObject({ claimed: 1, projected: 0, acknowledged: 0, failed: 1 });
    expect(await count("SELECT COUNT(*) count FROM notification_records WHERE city_code=?", [testCity])).toBe(0);
    const [deliveryRows] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT status,last_error_code,last_error_message FROM platform_event_deliveries WHERE delivery_id=?",
      [fixture.claim.deliveryId],
    );
    expect(deliveryRows[0]).toMatchObject({
      status: "retry_wait",
      last_error_code: "PLATFORM_DELIVERY_ERROR",
      last_error_message: "platform delivery failed",
    });
  });
});
