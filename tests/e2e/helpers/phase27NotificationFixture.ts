import { randomUUID } from "node:crypto";
import type { PlatformServiceIdentity } from "@xlb/types";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { PlatformDeliveryService } from "../../../backend/src/events/platformDeliveryService.js";
import {
  notificationCanonicalJson,
  notificationSha256,
} from "../../../backend/src/notification/notificationProjectionPolicy.js";
import { NotificationProjectionWorker } from "../../../backend/src/notification/notificationProjectionWorker.js";

const cityCode = "hangzhou";
const runPrefix = `p27e_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
const ownedSubscribers: string[] = [];
const ownedSubscriptions: string[] = [];
const ownedTemplates: string[] = [];
const ownedRevisions: string[] = [];

export type NotificationFixtureKind = "customer_order" | "worker_support";

export interface NotificationChannel {
  kind: NotificationFixtureKind;
  identity: PlatformServiceIdentity;
  subscriptionId: string;
  subscriberId: string;
  title: string;
}
function compactId(kind: string): string {
  return `${runPrefix}_${kind}_${randomUUID().slice(0, 8)}`;
}

export async function createNotificationChannel(kind: NotificationFixtureKind): Promise<NotificationChannel> {
  const pool = getMysqlPool();
  const customer = kind === "customer_order";
  const eventType = customer ? "order.created" : "support.ticket.resolved";
  const recipientType = customer ? "customer" : "worker";
  const handlerRevision = customer
    ? "implicit-v0-order-created-r1"
    : "implicit-v0-support-ticket-resolved-r1";
  const templateKey = customer
    ? "inapp.order.created.customer"
    : "inapp.support.ticket.resolved.worker";
  const parameterNames = [customer ? "orderId" : "ticketId"];
  const title = customer ? `Order created ${runPrefix}` : `Support resolved ${runPrefix}`;
  const bodyPattern = customer ? "Order {{orderId}} was created." : "Support ticket {{ticketId}} was resolved.";
  const subscriberId = compactId(customer ? "csub" : "wsub");
  const subscriptionId = compactId(customer ? "csc" : "wsc");
  const templateId = compactId(customer ? "ctpl" : "wtpl");
  const templateRevisionId = compactId(customer ? "crev" : "wrev");
  const serviceId = compactId(customer ? "csvc" : "wsvc");
  const identity: PlatformServiceIdentity = {
    identityKind: "platform_service",
    credentialKind: "internal_domain_contract",
    serviceId,
    subscriberId,
    cityCode,
  };

  await pool.query(
    `INSERT INTO platform_event_subscribers
      (subscriber_id,stable_name,owner_domain,handler_revision,purpose,max_pii_level,status,
       created_by_service_id,updated_by_service_id)
     VALUES (?,?, 'notification',?,'Phase27E browser-owned prospective fixture','P1','active',?,?)`,
    [subscriberId, `${runPrefix}.${recipientType}`, handlerRevision, serviceId, serviceId],
  );
  ownedSubscribers.push(subscriberId);
  await pool.query(
    `INSERT INTO platform_event_subscriptions
      (subscription_id,city_code,subscriber_id,event_type,event_major_version,
       compatibility_handler_revision,live_start_created_at,live_start_event_id,retention_class,status,
       lease_seconds,max_attempts,created_by_service_id,updated_by_service_id)
     VALUES (?,?,?, ?,0,?,DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 2 SECOND),'!','R1','active',30,3,?,?)`,
    [subscriptionId, cityCode, subscriberId, eventType, handlerRevision, serviceId, serviceId],
  );
  ownedSubscriptions.push(subscriptionId);

  const contentHash = notificationSha256(notificationCanonicalJson({
    templateId,
    templateKey,
    revisionLabel: "r1",
    locale: "zh-CN",
    eventType,
    recipientType,
    parameterNames,
    titleTemplate: title,
    bodyTemplate: bodyPattern,
    piiLevel: "P1",
  }));
  await pool.query(
    `INSERT INTO notification_templates
      (template_id,city_code,template_key,event_type,recipient_type,category_code,owner_service_id,status)
     VALUES (?,?,?,?,?,? ,?,'published')`,
    [templateId, cityCode, templateKey, eventType, recipientType, `p27e_${recipientType}`, serviceId],
  );
  ownedTemplates.push(templateId);
  await pool.query(
    `INSERT INTO notification_template_revisions
      (template_revision_id,city_code,template_id,revision_number,revision_label,locale,
       title_pattern,body_pattern,parameter_names_json,content_hash,pii_level,status,
       created_by_service_id,reviewed_by_actor_id,published_by_actor_id,reviewed_at,published_at)
     VALUES (?,?,?,1,'r1','zh-CN',?,?,?,?, 'P1','published',?,?,?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
    [
      templateRevisionId,
      cityCode,
      templateId,
      title,
      bodyPattern,
      JSON.stringify(parameterNames),
      contentHash,
      serviceId,
      `${runPrefix}_reviewer`,
      `${runPrefix}_publisher`,
    ],
  );
  ownedRevisions.push(templateRevisionId);

  return { kind, identity, subscriptionId, subscriberId, title };
}

export async function projectProspectiveEvent(channel: NotificationChannel): Promise<{ notificationId: string }> {
  const platform = new PlatformDeliveryService();
  const materialized = await platform.materializeCandidateBatch(channel.identity, channel.subscriptionId, 20);
  if (materialized.inserted !== 1) {
    throw new Error(`Phase27E expected exactly one prospective ${channel.kind} delivery, got ${JSON.stringify(materialized)}`);
  }
  const result = await new NotificationProjectionWorker().runOnce(channel.identity, {
    subscriptionId: channel.subscriptionId,
    owner: `${runPrefix}_${channel.kind}_owner`,
    limit: 20,
    leaseSeconds: 30,
  });
  if (result.claimed !== 1 || result.projected !== 1 || result.acknowledged !== 1 || result.failed !== 0) {
    throw new Error(`Phase27E projection failed: ${JSON.stringify(result)}`);
  }
  const [rows] = await getMysqlPool().query<(RowDataPacket & { notification_id: string })[]>(
    `SELECT n.notification_id
       FROM notification_records n
       INNER JOIN notification_delivery_receipts r
         ON r.city_code=n.city_code AND r.notification_id=n.notification_id
      WHERE n.city_code=? AND n.subscriber_id=?
      ORDER BY n.created_at DESC LIMIT 1`,
    [cityCode, channel.subscriberId],
  );
  if (!rows[0]?.notification_id) throw new Error("Phase27E projected notification missing");
  return { notificationId: rows[0].notification_id };
}

export async function cleanupNotificationFixtures(): Promise<void> {
  const pool = getMysqlPool();
  for (const subscriberId of ownedSubscribers) {
    await pool.query(
      `DELETE a FROM notification_actions a
       INNER JOIN notification_records n
         ON n.city_code=a.city_code AND n.notification_id=a.notification_id_copy
       WHERE n.subscriber_id=?`,
      [subscriberId],
    );
    await pool.query(
      `DELETE s FROM notification_recipient_states s
       INNER JOIN notification_records n
         ON n.city_code=s.city_code AND n.notification_id=s.notification_id
       WHERE n.subscriber_id=?`,
      [subscriberId],
    );
    await pool.query(
      "DELETE FROM notification_delivery_receipts WHERE subscriber_id=?",
      [subscriberId],
    );
    await pool.query("DELETE FROM notification_records WHERE subscriber_id=?", [subscriberId]);
  }
  for (const revisionId of ownedRevisions) {
    await pool.query("DELETE FROM notification_template_revisions WHERE city_code=? AND template_revision_id=?", [cityCode, revisionId]);
  }
  for (const templateId of ownedTemplates) {
    await pool.query("DELETE FROM notification_templates WHERE city_code=? AND template_id=?", [cityCode, templateId]);
  }
  for (const subscriptionId of ownedSubscriptions) {
    await pool.query(
      `DELETE FROM platform_event_delivery_attempts
       WHERE city_code=? AND delivery_id IN
         (SELECT delivery_id FROM platform_event_deliveries WHERE city_code=? AND subscription_id=?)`,
      [cityCode, cityCode, subscriptionId],
    );
    await pool.query("DELETE FROM platform_event_delivery_actions WHERE city_code=? AND subscription_id_copy=?", [cityCode, subscriptionId]);
    await pool.query("DELETE FROM platform_event_deliveries WHERE city_code=? AND subscription_id=?", [cityCode, subscriptionId]);
    await pool.query("DELETE FROM platform_event_materialization_checkpoints WHERE city_code=? AND subscription_id=?", [cityCode, subscriptionId]);
    await pool.query("DELETE FROM platform_event_subscriptions WHERE city_code=? AND subscription_id=?", [cityCode, subscriptionId]);
  }
  for (const subscriberId of ownedSubscribers) {
    await pool.query("DELETE FROM platform_event_subscribers WHERE subscriber_id=?", [subscriberId]);
  }
}
