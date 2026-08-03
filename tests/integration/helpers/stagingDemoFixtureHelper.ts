import type { RowDataPacket } from "mysql2/promise";
import { INVESTOR_DEMO_IDENTITIES } from "@xlb/types";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { STAGING_DEMO_IDS } from "../../../backend/src/demo/stagingDemoBootstrap.js";

type CleanupStep = Readonly<{
  label: string;
  sql: string;
  params: readonly unknown[];
}>;

const ids = STAGING_DEMO_IDS;
const demoDispatchTaskIds = [
  ids.activeDispatchTaskId,
  ids.historyDispatchTaskId,
] as const;
const demoOrderIds = [ids.activeOrderId, ids.historyOrderId] as const;

const cleanupSteps: readonly CleanupStep[] = [
  {
    label: "notification preference",
    sql: "DELETE FROM notification_recipient_preferences WHERE preference_id=?",
    params: [ids.notificationPreferenceId],
  },
  {
    label: "notification state",
    sql: "DELETE FROM notification_recipient_states WHERE state_id=?",
    params: [ids.notificationStateId],
  },
  {
    label: "notification receipt",
    sql: "DELETE FROM notification_delivery_receipts WHERE receipt_id=?",
    params: [ids.notificationReceiptId],
  },
  {
    label: "notification record",
    sql: "DELETE FROM notification_records WHERE notification_id=?",
    params: [ids.notificationId],
  },
  {
    label: "notification template revision",
    sql: "DELETE FROM notification_template_revisions WHERE template_revision_id=?",
    params: [ids.notificationTemplateRevisionId],
  },
  {
    label: "notification template",
    sql: "DELETE FROM notification_templates WHERE template_id=?",
    params: [ids.notificationTemplateId],
  },
  {
    label: "platform delivery attempts",
    sql: "DELETE FROM platform_event_delivery_attempts WHERE delivery_id=?",
    params: [ids.notificationDeliveryId],
  },
  {
    label: "platform delivery",
    sql: "DELETE FROM platform_event_deliveries WHERE delivery_id=?",
    params: [ids.notificationDeliveryId],
  },
  {
    label: "platform subscription",
    sql: "DELETE FROM platform_event_subscriptions WHERE subscription_id=?",
    params: [ids.notificationSubscriptionId],
  },
  {
    label: "platform subscriber",
    sql: "DELETE FROM platform_event_subscribers WHERE subscriber_id=?",
    params: [ids.notificationSubscriberId],
  },
  {
    label: "coupon grant",
    sql: "DELETE FROM coupon_grants WHERE coupon_grant_id=?",
    params: [ids.couponGrantId],
  },
  {
    label: "coupon definition",
    sql: "DELETE FROM coupon_definitions WHERE coupon_definition_id=?",
    params: [ids.couponDefinitionId],
  },
  {
    label: "marketing campaign pointer",
    sql: "UPDATE marketing_campaigns SET active_rule_revision_id=NULL WHERE marketing_campaign_id=?",
    params: [ids.marketingCampaignId],
  },
  {
    label: "marketing rule",
    sql: "DELETE FROM marketing_rule_revisions WHERE rule_revision_id=?",
    params: [ids.marketingRuleRevisionId],
  },
  {
    label: "marketing campaign",
    sql: "DELETE FROM marketing_campaigns WHERE marketing_campaign_id=?",
    params: [ids.marketingCampaignId],
  },
  {
    label: "support event",
    sql: "DELETE FROM support_ticket_events WHERE ticket_event_id=?",
    params: [ids.supportEventId],
  },
  {
    label: "support ticket",
    sql: "DELETE FROM support_tickets WHERE ticket_id=?",
    params: [ids.supportTicketId],
  },
  {
    label: "reputation projection receipt",
    sql: "DELETE FROM reputation_projection_receipts WHERE review_id=?",
    params: [ids.historyReviewId],
  },
  {
    label: "reputation contribution",
    sql: "DELETE FROM reputation_review_contributions WHERE review_id=?",
    params: [ids.historyReviewId],
  },
  {
    label: "review content access audit",
    sql: "DELETE FROM review_content_access_audits WHERE review_id=?",
    params: [ids.historyReviewId],
  },
  {
    label: "review appeal",
    sql: "DELETE FROM review_appeals WHERE review_id=?",
    params: [ids.historyReviewId],
  },
  {
    label: "review visibility",
    sql: "DELETE FROM review_visibility_states WHERE review_id=?",
    params: [ids.historyReviewId],
  },
  {
    label: "review moderation",
    sql: "DELETE FROM review_moderation_decisions WHERE review_id=?",
    params: [ids.historyReviewId],
  },
  {
    label: "order review",
    sql: "DELETE FROM order_reviews WHERE review_id=?",
    params: [ids.historyReviewId],
  },
  {
    label: "fulfillment",
    sql: "DELETE FROM fulfillments WHERE fulfillment_id=?",
    params: [ids.historyFulfillmentId],
  },
  {
    label: "worker acceptance",
    sql: "DELETE FROM worker_task_acceptances WHERE acceptance_id=?",
    params: [ids.historyAcceptanceId],
  },
  {
    label: "dispatch offers",
    sql: "DELETE FROM dispatch_offers WHERE dispatch_task_id IN (?, ?) OR worker_id=?",
    params: [...demoDispatchTaskIds, ids.workerId],
  },
  {
    label: "dispatch events",
    sql: "DELETE FROM dispatch_events WHERE dispatch_task_id IN (?, ?) OR worker_id=?",
    params: [...demoDispatchTaskIds, ids.workerId],
  },
  {
    label: "dispatch tasks",
    sql: "DELETE FROM dispatch_tasks WHERE dispatch_task_id IN (?, ?)",
    params: demoDispatchTaskIds,
  },
  {
    label: "event outbox",
    sql: "DELETE FROM event_outbox WHERE event_id=?",
    params: [ids.activeEventId],
  },
  {
    label: "orders",
    sql: "DELETE FROM orders WHERE order_id IN (?, ?)",
    params: demoOrderIds,
  },
  {
    label: "customer address",
    sql: "DELETE FROM customer_addresses WHERE address_id=?",
    params: [ids.addressId],
  },
  {
    label: "worker qualification",
    sql: "DELETE FROM worker_qualifications WHERE worker_id=?",
    params: [ids.workerId],
  },
  {
    label: "worker certification",
    sql: "DELETE FROM worker_certifications WHERE certification_id='investor-demo-certification-basic'",
    params: [],
  },
  {
    label: "worker location",
    sql: "DELETE FROM worker_locations WHERE worker_id=?",
    params: [ids.workerId],
  },
  {
    label: "worker dispatch preference",
    sql: "DELETE FROM worker_dispatch_preferences WHERE worker_id=?",
    params: [ids.workerId],
  },
  {
    label: "worker online state",
    sql: "DELETE FROM worker_online_status WHERE worker_id=?",
    params: [ids.workerId],
  },
  {
    label: "worker city binding",
    sql: "DELETE FROM worker_city_bindings WHERE worker_id=?",
    params: [ids.workerId],
  },
  {
    label: "worker identity",
    sql: "DELETE FROM worker_profiles WHERE worker_id=?",
    params: [ids.workerId],
  },
  {
    label: "admin city scope",
    sql: "DELETE FROM admin_city_scopes WHERE admin_user_id=?",
    params: [ids.adminUserId],
  },
  {
    label: "admin identity",
    sql: "DELETE FROM admin_users WHERE id=?",
    params: [ids.adminUserId],
  },
  {
    label: "customer seed baseline",
    sql: `INSERT INTO customers (id, phone, name, avatar_url, default_city_code)
          VALUES (?, ?, '演示用户', NULL, 'hangzhou')
          ON DUPLICATE KEY UPDATE phone=VALUES(phone), name=VALUES(name),
            avatar_url=VALUES(avatar_url), default_city_code=VALUES(default_city_code)`,
    params: [ids.customerId, INVESTOR_DEMO_IDENTITIES.customer.phone],
  },
];

type CleanupCounts = RowDataPacket & {
  dispatch_offer_count: number;
  dispatch_event_count: number;
  dispatch_task_count: number;
  non_queued_dispatch_task_count: number;
  worker_location_count: number;
  worker_preference_count: number;
  worker_online_count: number;
  worker_qualification_count: number;
  customer_seed_drift_count: number;
};

function cleanupError(step: string, error: unknown): Error {
  const errorType = error instanceof Error ? error.name : "UnknownError";
  const databaseError = error as {
    code?: unknown;
    sqlState?: unknown;
    sqlMessage?: unknown;
  };
  const code = typeof databaseError.code === "string"
    && /^[A-Z0-9_]+$/u.test(databaseError.code)
    ? databaseError.code
    : undefined;
  const sqlState = typeof databaseError.sqlState === "string"
    && /^[A-Z0-9]+$/u.test(databaseError.sqlState)
    ? databaseError.sqlState
    : undefined;
  const sqlMessage = typeof databaseError.sqlMessage === "string"
    ? databaseError.sqlMessage
    : "";
  const constraint = sqlMessage.match(/CONSTRAINT [`']([A-Za-z0-9_]+)[`']/u)?.[1];
  const table = sqlMessage.match(/\(`[^`]+`\.`([A-Za-z0-9_]+)`/u)?.[1];
  const residual = error instanceof Error
    && error.message.startsWith("remaining demo runtime rows:")
    ? error.message
    : undefined;
  const diagnostic = [code, sqlState, table, constraint, residual]
    .filter(Boolean)
    .join("/");
  return new Error(
    `staging demo fixture cleanup failed at ${step} (${errorType}${diagnostic ? `:${diagnostic}` : ""}); database transaction rolled back`,
  );
}

/**
 * The engineering suite shares one isolated database across serial files. Demo
 * bootstrap tests must therefore remove every fixed entity they create, in
 * reverse dependency order, so later ordinary dispatch tests see the seed
 * baseline rather than the investor-demo runtime.
 */
export async function cleanupStagingDemoFixture(): Promise<void> {
  const connection = await getMysqlPool().getConnection();
  let step = "begin";
  try {
    await connection.beginTransaction();
    for (const item of cleanupSteps) {
      step = item.label;
      await connection.query(item.sql, [...item.params]);
    }

    step = "post-cleanup verification";
    const [rows] = await connection.query<CleanupCounts[]>(
      `SELECT
         (SELECT COUNT(*) FROM dispatch_offers
           WHERE dispatch_task_id IN (?, ?) OR worker_id=?) AS dispatch_offer_count,
         (SELECT COUNT(*) FROM dispatch_events
           WHERE dispatch_task_id IN (?, ?) OR worker_id=?) AS dispatch_event_count,
         (SELECT COUNT(*) FROM dispatch_tasks
           WHERE dispatch_task_id IN (?, ?)) AS dispatch_task_count,
         (SELECT COUNT(*) FROM dispatch_tasks
           WHERE dispatch_task_id IN (?, ?) AND status <> 'queued')
           AS non_queued_dispatch_task_count,
         (SELECT COUNT(*) FROM worker_locations WHERE worker_id=?)
           AS worker_location_count,
         (SELECT COUNT(*) FROM worker_dispatch_preferences WHERE worker_id=?)
           AS worker_preference_count,
         (SELECT COUNT(*) FROM worker_online_status WHERE worker_id=?)
           AS worker_online_count,
         (SELECT COUNT(*) FROM worker_qualifications WHERE worker_id=?)
           AS worker_qualification_count,
         1 - (SELECT COUNT(*) FROM customers
           WHERE id=? AND phone=? AND name='演示用户'
             AND avatar_url IS NULL AND default_city_code='hangzhou')
           AS customer_seed_drift_count`,
      [
        ...demoDispatchTaskIds,
        ids.workerId,
        ...demoDispatchTaskIds,
        ids.workerId,
        ...demoDispatchTaskIds,
        ...demoDispatchTaskIds,
        ids.workerId,
        ids.workerId,
        ids.workerId,
        ids.workerId,
        ids.customerId,
        INVESTOR_DEMO_IDENTITIES.customer.phone,
      ],
    );
    const counts = rows[0];
    if (!counts || Object.values(counts).some((value) => Number(value) !== 0)) {
      const summary = counts
        ? Object.entries(counts)
            .map(([key, value]) => `${key}=${Number(value)}`)
            .join(",")
        : "missing-count-row";
      throw new Error(`remaining demo runtime rows: ${summary}`);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw cleanupError(step, error);
  } finally {
    connection.release();
  }
}
