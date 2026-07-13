import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { runMigrations } from "../../backend/src/dal/migrationRunner.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const prefix = `p27c_${Date.now().toString(36)}_`;
const city = "hangzhou";
const otherCity = "shanghai";
const customerId = `${prefix}customer`;
const otherCustomerId = `${prefix}other_customer`;

type RecipientType = "customer" | "worker";

interface NotificationFixture {
  notificationId: string;
  recipientType: RecipientType;
  recipientId: string;
  cityCode: string;
  createdAt: string;
}

function id(kind: string): string {
  return `${prefix}${kind}_${randomUUID().slice(0, 8)}`;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function createNotification(options: {
  recipientType?: RecipientType;
  recipientId?: string;
  cityCode?: string;
  createdAt?: string;
  read?: boolean;
  archived?: boolean;
  hidden?: boolean;
} = {}): Promise<NotificationFixture> {
  const recipientType = options.recipientType ?? "customer";
  const recipientId = options.recipientId ?? customerId;
  const cityCode = options.cityCode ?? city;
  const suffix = randomUUID().slice(0, 8);
  const subscriberId = id("sub");
  const subscriptionId = id("subscription");
  const eventId = id("event");
  const notificationId = id("notification");
  const templateId = id("template");
  const revisionId = id("revision");
  const eventType = recipientType === "customer" ? "order.created" : "support.ticket.resolved";
  const handlerRevision = recipientType === "customer"
    ? "implicit-v0-order-created-r1"
    : "implicit-v0-support-ticket-resolved-r1";
  const createdAt = new Date(options.createdAt ?? Date.now());
  const reference = recipientType === "customer"
    ? { kind: "order_created", orderId: id("order") }
    : { kind: "support_ticket_resolved", ticketId: id("ticket") };

  await getMysqlPool().query(
    `INSERT INTO platform_event_subscribers
      (subscriber_id,stable_name,owner_domain,handler_revision,purpose,max_pii_level,status,
       created_by_service_id,updated_by_service_id)
     VALUES (?,?, 'notification',?,'Phase27C inbox test','P1','active','phase27c-test','phase27c-test')`,
    [subscriberId, `${prefix}stable_${suffix}`, handlerRevision],
  );
  await getMysqlPool().query(
    `INSERT INTO platform_event_subscriptions
      (subscription_id,city_code,subscriber_id,event_type,event_major_version,
       compatibility_handler_revision,live_start_created_at,live_start_event_id,retention_class,status,
       lease_seconds,max_attempts,created_by_service_id,updated_by_service_id)
     VALUES (?,?,?,?,0,?,DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 1 HOUR),'!','R1','active',30,3,
       'phase27c-test','phase27c-test')`,
    [subscriptionId, cityCode, subscriberId, eventType, handlerRevision],
  );
  await getMysqlPool().query(
    `INSERT INTO event_outbox
      (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status)
     VALUES (?,?,'phase27c_test',?,?,?,'pending')`,
    [eventId, eventType, id("aggregate"), cityCode, JSON.stringify(reference)],
  );
  await getMysqlPool().query(
    `INSERT INTO platform_event_deliveries
      (delivery_id,city_code,subscriber_id,subscription_id,event_id,event_type,event_major_version,
       payload_hash,aggregate_type,aggregate_id,status,max_attempts,delivered_at)
     VALUES (?,?,?,?,?,?,0,?,'phase27c_test',?,'delivered',3,CURRENT_TIMESTAMP(3))`,
    [id("delivery"), cityCode, subscriberId, subscriptionId, eventId, eventType, sha(eventId), id("aggregate")],
  );
  await getMysqlPool().query(
    `INSERT INTO notification_templates
      (template_id,city_code,template_key,event_type,recipient_type,category_code,owner_service_id,status)
     VALUES (?,?,?,?,?,?,'phase27c-test','published')`,
    [templateId, cityCode, `inbox.${recipientType}.${suffix}`, eventType, recipientType, `test_${suffix}`],
  );
  await getMysqlPool().query(
    `INSERT INTO notification_template_revisions
      (template_revision_id,city_code,template_id,revision_number,revision_label,locale,
       title_pattern,body_pattern,parameter_names_json,content_hash,pii_level,status,
       created_by_service_id,reviewed_by_actor_id,published_by_actor_id,reviewed_at,published_at)
     VALUES (?,?,?,1,'r1','zh-CN','Inbox title','Inbox body',?,?,'P1','published',
       'phase27c-test','reviewer','publisher',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
    [revisionId, cityCode, templateId, JSON.stringify(Object.keys(reference)), sha(revisionId)],
  );
  await getMysqlPool().query(
    `INSERT INTO notification_records
      (notification_id,city_code,recipient_type,recipient_id,source_event_id,subscriber_id,event_type,
       event_major_version,template_revision_id,payload_hash,target_fingerprint,render_parameters_json,
       render_parameters_hash,rendered_title,rendered_body,occurred_at,created_at)
     VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,'Inbox title','Inbox body',?,?)`,
    [
      notificationId,
      cityCode,
      recipientType,
      recipientId,
      eventId,
      subscriberId,
      eventType,
      revisionId,
      sha(eventId),
      sha(`${recipientType}:${recipientId}`),
      JSON.stringify(reference),
      sha(JSON.stringify(reference)),
      createdAt,
      createdAt,
    ],
  );
  await getMysqlPool().query(
    `INSERT INTO notification_recipient_states
      (state_id,city_code,notification_id,recipient_type,recipient_id,read_at,archived_at,hidden_at)
     VALUES (?,?,?,?,?,${options.read ? "CURRENT_TIMESTAMP(3)" : "NULL"},
       ${options.archived ? "CURRENT_TIMESTAMP(3)" : "NULL"},
       ${options.hidden ? "CURRENT_TIMESTAMP(3)" : "NULL"})`,
    [id("state"), cityCode, notificationId, recipientType, recipientId],
  );
  return { notificationId, recipientType, recipientId, cityCode, createdAt: createdAt.toISOString() };
}

async function cleanup(): Promise<void> {
  for (const cityCode of [city, otherCity]) {
    await getMysqlPool().query("DELETE FROM notification_actions WHERE city_code=? AND notification_id_copy LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM notification_recipient_states WHERE city_code=? AND notification_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM notification_delivery_receipts WHERE city_code=? AND notification_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM notification_records WHERE city_code=? AND notification_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM notification_template_revisions WHERE city_code=? AND template_revision_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM notification_templates WHERE city_code=? AND template_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_delivery_attempts WHERE delivery_id LIKE ?", [`${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_delivery_actions WHERE city_code=? AND delivery_id_copy LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_deliveries WHERE city_code=? AND delivery_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_materialization_checkpoints WHERE city_code=? AND subscription_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM platform_event_subscriptions WHERE city_code=? AND subscription_id LIKE ?", [cityCode, `${prefix}%`]);
    await getMysqlPool().query("DELETE FROM event_outbox WHERE city_code=? AND event_id LIKE ?", [cityCode, `${prefix}%`]);
  }
  await getMysqlPool().query("DELETE FROM platform_event_subscribers WHERE subscriber_id LIKE ?", [`${prefix}%`]);
}

describe.skipIf(!runDb)("Phase27C notification inbox lifecycle", { timeout: 60_000 }, () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await runMigrations();
    app = await buildApp({ rateLimit: { max: 10_000, windowMs: 60_000 } });
  });

  afterEach(cleanup);

  afterAll(async () => {
    await app.close();
    await cleanup();
  });

  it("lists only the exact recipient scope, excludes hidden state, and emits no internal fields", async () => {
    const visible = await createNotification();
    await createNotification({ recipientId: otherCustomerId });
    await createNotification({ cityCode: otherCity });
    await createNotification({ hidden: true });

    const response = await app.inject({
      method: "GET",
      url: "/api/customer/notifications",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: customerId, cityCode: city }),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].notificationId).toBe(visible.notificationId);
    expect(Object.keys(body.items[0]).sort()).toEqual([
      "archivedAt", "body", "createdAt", "eventType", "notificationId", "occurredAt",
      "readAt", "reference", "rowVersion", "templateRevisionId", "title",
    ].sort());
    expect(JSON.stringify(body)).not.toMatch(/cityCode|recipientId|recipientType|sourceEvent|subscriber|payloadHash|targetFingerprint|idempotency/i);
  });

  it("uses a signed scope-and-view-bound keyset cursor", async () => {
    await createNotification({ createdAt: "2026-07-13T02:00:00.000Z" });
    await createNotification({ createdAt: "2026-07-13T01:00:00.000Z" });
    const headers = bearerHeaders({ appType: "customer", role: "customer", userId: customerId, cityCode: city });
    const first = await app.inject({ method: "GET", url: "/api/customer/notifications?limit=1", headers });
    expect(first.statusCode).toBe(200);
    const cursor = first.json().nextCursor as string;
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    const second = await app.inject({ method: "GET", url: `/api/customer/notifications?limit=1&cursor=${cursor}`, headers });
    expect(second.statusCode).toBe(200);
    expect(second.json().items).toHaveLength(1);

    const wrongRecipient = await app.inject({
      method: "GET",
      url: `/api/customer/notifications?cursor=${cursor}`,
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: otherCustomerId, cityCode: city }),
    });
    expect(wrongRecipient.statusCode).toBe(400);
    const wrongView = await app.inject({ method: "GET", url: `/api/customer/notifications?view=archive&cursor=${cursor}`, headers });
    expect(wrongView.statusCode).toBe(400);
    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith("a") ? "b" : "a"}`;
    expect((await app.inject({ method: "GET", url: `/api/customer/notifications?cursor=${tampered}`, headers })).statusCode).toBe(400);
  });

  it("counts unread with all three state predicates and keeps archive reversible without changing read", async () => {
    const active = await createNotification();
    await createNotification({ read: true });
    await createNotification({ archived: true });
    await createNotification({ hidden: true });
    const headers = bearerHeaders({ appType: "customer", role: "customer", userId: customerId, cityCode: city });
    expect((await app.inject({ method: "GET", url: "/api/customer/notifications/unread-count", headers })).json()).toEqual({ ok: true, unreadCount: 1 });

    const archive = await app.inject({
      method: "POST",
      url: `/api/customer/notifications/${active.notificationId}/archive`,
      headers,
      payload: { expectedRowVersion: 1, idempotencyKey: "archive-key-0001", archived: true },
    });
    expect(archive.json()).toEqual({ ok: true, result: { outcome: "applied", rowVersion: 2 } });
    expect((await app.inject({ method: "GET", url: "/api/customer/notifications/unread-count", headers })).json().unreadCount).toBe(0);
    const archivedList = await app.inject({ method: "GET", url: "/api/customer/notifications?view=archive", headers });
    expect(archivedList.json().items.map((item: { notificationId: string }) => item.notificationId)).toContain(active.notificationId);

    const restore = await app.inject({
      method: "POST",
      url: `/api/customer/notifications/${active.notificationId}/archive`,
      headers,
      payload: { expectedRowVersion: 2, idempotencyKey: "archive-key-0002", archived: false },
    });
    expect(restore.json().result).toEqual({ outcome: "applied", rowVersion: 3 });
    const [rows] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT read_at,archived_at,row_version FROM notification_recipient_states WHERE notification_id=?",
      [active.notificationId],
    );
    expect(rows[0]?.read_at).toBeNull();
    expect(rows[0]?.archived_at).toBeNull();
    expect(Number(rows[0]?.row_version)).toBe(3);
    expect((await app.inject({ method: "GET", url: "/api/customer/notifications/unread-count", headers })).json().unreadCount).toBe(1);
  });

  it("enforces CAS and hashed idempotency with exact replay and mismatch conflict", async () => {
    const fixture = await createNotification();
    const headers = bearerHeaders({ appType: "customer", role: "customer", userId: customerId, cityCode: city });
    const request = {
      method: "POST" as const,
      url: `/api/customer/notifications/${fixture.notificationId}/read`,
      headers,
      payload: { expectedRowVersion: 1, idempotencyKey: "read-key-secret-0001" },
    };
    const concurrent = await Promise.all([app.inject(request), app.inject(request)]);
    expect(concurrent.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(concurrent.map((response) => response.json().result.outcome)).toEqual(["applied", "applied"]);
    expect(concurrent.map((response) => response.json().result.rowVersion)).toEqual([2, 2]);
    expect((await app.inject(request)).json().result).toEqual({ outcome: "applied", rowVersion: 2 });
    expect((await app.inject({ ...request, payload: { expectedRowVersion: 2, idempotencyKey: "read-key-secret-0001" } })).statusCode).toBe(409);
    expect((await app.inject({ ...request, payload: { expectedRowVersion: 1, idempotencyKey: "different-read-key" } })).json().result)
      .toEqual({ outcome: "already_applied", rowVersion: 2 });

    const [actions] = await getMysqlPool().query<RowDataPacket[]>(
      "SELECT idempotency_key_hash,request_fingerprint,action_result,expected_row_version,actual_row_version FROM notification_actions WHERE notification_id_copy=?",
      [fixture.notificationId],
    );
    expect(actions).toHaveLength(2);
    expect(actions.map((action) => action.idempotency_key_hash).sort()).toEqual([
      sha("different-read-key"),
      sha("read-key-secret-0001"),
    ].sort());
    expect(JSON.stringify(actions)).not.toContain("read-key-secret-0001");
    expect(actions[0]?.request_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("folds cross-scope and hidden mutations to 404 while serving the exact worker inbox", async () => {
    const customer = await createNotification();
    const hidden = await createNotification({ hidden: true });
    const workerId = `${prefix}worker`;
    const worker = await createNotification({ recipientType: "worker", recipientId: workerId });
    const mutation = (notificationId: string, userId: string, cityCode: string, key: string) => app.inject({
      method: "POST",
      url: `/api/customer/notifications/${notificationId}/read`,
      headers: bearerHeaders({ appType: "customer", role: "customer", userId, cityCode }),
      payload: { expectedRowVersion: 1, idempotencyKey: key },
    });

    expect((await mutation(customer.notificationId, otherCustomerId, city, "cross-user-key-01")).statusCode).toBe(404);
    expect((await mutation(customer.notificationId, customerId, otherCity, "cross-city-key-01")).statusCode).toBe(404);
    expect((await mutation(hidden.notificationId, customerId, city, "hidden-item-key-01")).statusCode).toBe(404);

    const response = await app.inject({
      method: "GET",
      url: "/api/worker/notifications",
      headers: bearerHeaders({ appType: "worker", role: "worker", userId: workerId, cityCode: city }),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: { notificationId: string }) => item.notificationId)).toEqual([worker.notificationId]);
  });
});
