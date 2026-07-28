import { createHash, createHmac } from "node:crypto";
import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { loadEnv, type EnvConfig } from "@xlb/config";
import { getMysqlPool } from "../dal/mysqlPool.js";

export const STAGING_DEMO_RESET_CONFIRMATION = "RESET_XLB_INVESTOR_DEMO_V1";
export const STAGING_DEMO_PREFIX = "investor-demo-";

export const STAGING_DEMO_IDS = Object.freeze({
  customerId: "customer-demo-001",
  workerId: "investor-demo-worker-hz",
  adminUserId: "investor-demo-admin-hz",
  addressId: "investor-demo-address-hz",
  activeOrderId: "investor-demo-order-active",
  historyOrderId: "investor-demo-order-history",
  activeEventId: "investor-demo-event-order-active",
  activeDispatchTaskId: "investor-demo-dispatch-active",
  historyDispatchTaskId: "investor-demo-dispatch-history",
  historyAcceptanceId: "investor-demo-acceptance-history",
  historyFulfillmentId: "investor-demo-fulfillment-history",
  historyReviewId: "investor-demo-review-history",
  historyVisibilityId: "investor-demo-review-state-history",
  supportTicketId: "investor-demo-support-ticket",
  supportEventId: "investor-demo-support-event-created",
  marketingCampaignId: "investor-demo-campaign",
  marketingRuleRevisionId: "investor-demo-campaign-rule-v1",
  couponDefinitionId: "investor-demo-coupon-definition",
  couponGrantId: "investor-demo-coupon-grant",
  notificationSubscriberId: "investor-demo-notification-subscriber",
  notificationSubscriptionId: "investor-demo-notification-subscription",
  notificationDeliveryId: "investor-demo-notification-delivery",
  notificationTemplateId: "investor-demo-notification-template",
  notificationTemplateRevisionId: "investor-demo-notification-template-v1",
  notificationId: "investor-demo-notification-order",
  notificationReceiptId: "investor-demo-notification-receipt",
  notificationStateId: "investor-demo-notification-state",
  notificationPreferenceId: "investor-demo-notification-preference",
});

export type StagingDemoOperation = {
  label: string;
  table: string;
  sql: string;
  params: readonly unknown[];
  entityIds: readonly string[];
};

export type StagingDemoBootstrapTarget = {
  environment: "staging";
  mysqlHost: string;
  mysqlDatabase: string;
  cityCode: string;
  customerPhone: string;
  workerPhone: string;
  workerId: string;
  adminUsername: string;
  adminUserId: string;
  authPhoneHashSecret: string;
};

export type StagingDemoBootstrapSummary = {
  dryRun: boolean;
  environment: "staging";
  target: {
    mysqlHost: string;
    mysqlDatabase: string;
    cityCode: string;
  };
  operationCount: number;
  affectedRows: number;
  operations: Array<{
    label: string;
    table: string;
    entityIds: readonly string[];
    affectedRows: number;
  }>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function workerPhoneHash(phone: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`xlb:worker-phone:v1:${phone}`, "utf8")
    .digest("hex");
}

function op(
  label: string,
  table: string,
  sql: string,
  params: readonly unknown[],
  ...entityIds: string[]
): StagingDemoOperation {
  return { label, table, sql, params, entityIds };
}

function requireExactString(raw: NodeJS.ProcessEnv, name: string): string {
  const value = raw[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} must be explicitly configured`);
  return value;
}

export function validateStagingDemoBootstrapTarget(
  env: EnvConfig,
  raw: NodeJS.ProcessEnv = process.env,
): StagingDemoBootstrapTarget {
  if (env.nodeEnv !== "staging") {
    throw new Error("staging demo reset requires NODE_ENV=staging");
  }
  if (raw.STAGING_DEMO_RESET_ENABLED !== "true") {
    throw new Error("staging demo reset requires STAGING_DEMO_RESET_ENABLED=true");
  }
  if (raw.STAGING_DEMO_RESET_CONFIRMATION !== STAGING_DEMO_RESET_CONFIRMATION) {
    throw new Error(
      `staging demo reset requires STAGING_DEMO_RESET_CONFIRMATION=${STAGING_DEMO_RESET_CONFIRMATION}`,
    );
  }
  if (!env.stagingDemoCustomerAuthEnabled || !env.stagingInvestorDemoAuthEnabled) {
    throw new Error("staging demo reset requires both customer and investor demo authentication");
  }
  const expectedHost = requireExactString(raw, "STAGING_DEMO_RESET_EXPECTED_HOST");
  const expectedDatabase = requireExactString(raw, "STAGING_DEMO_RESET_EXPECTED_DATABASE");
  if (env.mysqlHost !== expectedHost) {
    throw new Error("MYSQL_HOST does not match STAGING_DEMO_RESET_EXPECTED_HOST");
  }
  if (env.mysqlDatabase !== expectedDatabase) {
    throw new Error("MYSQL_DATABASE does not match STAGING_DEMO_RESET_EXPECTED_DATABASE");
  }
  if (
    !/^[A-Za-z0-9._:-]{1,255}$/u.test(env.mysqlHost)
    || /[*?\s]/u.test(env.mysqlHost)
    || /prod(?:uction)?/iu.test(env.mysqlHost)
  ) {
    throw new Error("MYSQL_HOST is not an explicit non-production staging target");
  }
  if (
    !/^[a-z0-9_]*(?:staging|demo)[a-z0-9_]*$/u.test(env.mysqlDatabase)
    || /prod(?:uction)?/iu.test(env.mysqlDatabase)
  ) {
    throw new Error("MYSQL_DATABASE must be an explicit non-production staging/demo database");
  }
  if (
    env.stagingDemoWorkerId !== STAGING_DEMO_IDS.workerId
    || env.stagingDemoAdminUserId !== STAGING_DEMO_IDS.adminUserId
  ) {
    throw new Error("staging demo identity IDs do not match the fixed bootstrap manifest");
  }
  return {
    environment: "staging",
    mysqlHost: env.mysqlHost,
    mysqlDatabase: env.mysqlDatabase,
    cityCode: env.stagingDemoCityCode,
    customerPhone: env.stagingDemoCustomerPhone,
    workerPhone: env.stagingDemoWorkerPhone,
    workerId: env.stagingDemoWorkerId,
    adminUsername: env.stagingDemoAdminUsername,
    adminUserId: env.stagingDemoAdminUserId,
    authPhoneHashSecret: env.authPhoneHashSecret,
  };
}

export function buildStagingDemoOperations(
  target: StagingDemoBootstrapTarget,
): StagingDemoOperation[] {
  const ids = STAGING_DEMO_IDS;
  const fixedCreatedAt = "2026-07-28 09:00:00.000";
  const fixedCompletedAt = "2026-07-28 10:00:00.000";
  const scheduledAt = "2030-01-15 09:00:00.000";
  const expiresAt = "2037-01-01 00:00:00.000";
  const phoneMasked = `${target.workerPhone.slice(0, 3)}****${target.workerPhone.slice(-4)}`;
  const hash = (suffix: string) => sha256(`xlb:investor-demo:v1:${suffix}`);
  const outboxPayload = JSON.stringify({
    orderId: ids.activeOrderId,
    cityCode: target.cityCode,
    customerId: ids.customerId,
    skuId: "sku_home_daily_2h",
    demo: true,
  });
  const renderParameters = JSON.stringify({
    orderId: ids.activeOrderId,
    skuName: "2小时日常保洁",
  });
  const payloadHash = sha256(outboxPayload);
  const targetFingerprint = hash(`notification-target:${ids.customerId}`);
  const renderParametersHash = sha256(renderParameters);

  return [
    op(
      "customer_identity",
      "customers",
      `INSERT INTO customers (id, phone, name, avatar_url, default_city_code)
       VALUES (?, ?, '投资人演示客户', NULL, ?)
       ON DUPLICATE KEY UPDATE phone=VALUES(phone), name=VALUES(name),
         avatar_url=NULL, default_city_code=VALUES(default_city_code)`,
      [ids.customerId, target.customerPhone, target.cityCode],
      ids.customerId,
    ),
    op(
      "admin_identity",
      "admin_users",
      `INSERT INTO admin_users (id, username, role, city_scopes_json)
       VALUES (?, ?, 'operator', JSON_ARRAY(?))
       ON DUPLICATE KEY UPDATE username=VALUES(username), role='operator',
         city_scopes_json=JSON_ARRAY(?)`,
      [target.adminUserId, target.adminUsername, target.cityCode, target.cityCode],
      target.adminUserId,
    ),
    op(
      "admin_scope_cleanup",
      "admin_city_scopes",
      `DELETE FROM admin_city_scopes
       WHERE admin_user_id=?
         AND city_code<>?`,
      [target.adminUserId, target.cityCode],
      target.adminUserId,
    ),
    op(
      "admin_city_scope",
      "admin_city_scopes",
      `INSERT INTO admin_city_scopes (admin_user_id, city_code)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE city_code=VALUES(city_code)`,
      [target.adminUserId, target.cityCode],
      target.adminUserId,
    ),
    op(
      "worker_identity",
      "worker_profiles",
      `INSERT INTO worker_profiles (
         worker_id, display_name, phone_masked, phone_hash, status,
         dispatch_status, is_certified, distance_km
       ) VALUES (?, '投资人演示师傅', ?, ?, 'active', 'available', 1, 2.00)
       ON DUPLICATE KEY UPDATE display_name=VALUES(display_name),
         phone_masked=VALUES(phone_masked), phone_hash=VALUES(phone_hash),
         status='active', dispatch_status='available', is_certified=1, distance_km=2.00`,
      [
        target.workerId,
        phoneMasked,
        workerPhoneHash(target.workerPhone, target.authPhoneHashSecret),
      ],
      target.workerId,
    ),
    op(
      "worker_other_city_disable",
      "worker_city_bindings",
      `UPDATE worker_city_bindings SET is_enabled=0
       WHERE worker_id=?
         AND city_code<>?`,
      [target.workerId, target.cityCode],
      target.workerId,
    ),
    op(
      "worker_city_binding",
      "worker_city_bindings",
      `INSERT INTO worker_city_bindings (worker_id, city_code, is_enabled)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_enabled=1`,
      [target.workerId, target.cityCode],
      target.workerId,
    ),
    op(
      "worker_online_state",
      "worker_online_status",
      `INSERT INTO worker_online_status (worker_id, city_code, is_online)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_online=1`,
      [target.workerId, target.cityCode],
      target.workerId,
    ),
    op(
      "worker_dispatch_preferences",
      "worker_dispatch_preferences",
      `INSERT INTO worker_dispatch_preferences (
         worker_id, city_code, service_radius_km, location_sharing_enabled,
         rating_score, penalty_score
       ) VALUES (?, ?, 10.00, 0, 5.00, 0.00)
       ON DUPLICATE KEY UPDATE service_radius_km=10.00,
         location_sharing_enabled=0, rating_score=5.00, penalty_score=0.00`,
      [target.workerId, target.cityCode],
      target.workerId,
    ),
    op(
      "worker_certification",
      "worker_certifications",
      `INSERT INTO worker_certifications (
         certification_id, worker_id, city_code, cert_type, cert_name, status,
         submitted_at, reviewed_at, reviewer_id, reject_reason
       ) VALUES (
         'investor-demo-certification-basic', ?, ?, 'home_service_basic',
         '演示基础上门服务资格', 'approved', ?, ?, ?, NULL
       )
       ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id), city_code=VALUES(city_code),
         cert_name=VALUES(cert_name), status='approved', reviewed_at=VALUES(reviewed_at),
         reviewer_id=VALUES(reviewer_id), reject_reason=NULL`,
      [target.workerId, target.cityCode, fixedCreatedAt, fixedCreatedAt, target.adminUserId],
      "investor-demo-certification-basic",
    ),
    op(
      "worker_qualification",
      "worker_qualifications",
      `INSERT INTO worker_qualifications (
         worker_id, city_code, sku_id, is_eligible, source_certification_id
       ) VALUES (?, ?, 'sku_home_daily_2h', 1, 'investor-demo-certification-basic')
       ON DUPLICATE KEY UPDATE is_eligible=1,
         source_certification_id='investor-demo-certification-basic'`,
      [target.workerId, target.cityCode],
      target.workerId,
    ),
    op(
      "customer_address",
      "customer_addresses",
      `INSERT INTO customer_addresses (
         address_id, customer_id, city_code, idempotency_key, contact_name,
         contact_phone, province, city, district, detail_address, is_default
       ) VALUES (?, ?, ?, 'investor-demo-address-v1', '演示客户', ?,
         '浙江省', '杭州市', '拱墅区', '演示路 100 号（虚拟地址）', 1)
       ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id),
         city_code=VALUES(city_code), idempotency_key=VALUES(idempotency_key),
         contact_name=VALUES(contact_name), contact_phone=VALUES(contact_phone),
         province=VALUES(province), city=VALUES(city), district=VALUES(district),
         detail_address=VALUES(detail_address), is_default=1`,
      [ids.addressId, ids.customerId, target.cityCode, target.customerPhone],
      ids.addressId,
    ),
    ...buildOrderOperations(target, {
      orderId: ids.activeOrderId,
      status: "pending_dispatch",
      scheduledAt,
      createdAt: fixedCreatedAt,
    }),
    ...buildOrderOperations(target, {
      orderId: ids.historyOrderId,
      status: "service_completed",
      scheduledAt,
      createdAt: fixedCreatedAt,
    }),
    op(
      "active_order_event",
      "event_outbox",
      `INSERT INTO event_outbox (
         event_id, event_type, event_major_version, aggregate_type, aggregate_id,
         city_code, payload_json, status, created_at, published_at, attempt_count,
         max_attempts, available_at, processing_started_at, lease_owner, lease_token,
         lease_expires_at, last_error_code, last_error_message, last_failed_at,
         dead_lettered_at
       ) VALUES (?, 'order.created', 0, 'order', ?, ?, CAST(? AS JSON),
         'published', ?, ?, 0, 5, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
       ON DUPLICATE KEY UPDATE event_type='order.created', event_major_version=0,
         aggregate_type='order', aggregate_id=VALUES(aggregate_id),
         city_code=VALUES(city_code), payload_json=VALUES(payload_json),
         status='published', published_at=VALUES(published_at), attempt_count=0,
         available_at=VALUES(available_at), processing_started_at=NULL,
         lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL,
         last_error_code=NULL, last_error_message=NULL, last_failed_at=NULL,
         dead_lettered_at=NULL`,
      [
        ids.activeEventId,
        ids.activeOrderId,
        target.cityCode,
        outboxPayload,
        fixedCreatedAt,
        fixedCreatedAt,
        fixedCreatedAt,
      ],
      ids.activeEventId,
    ),
    op(
      "active_dispatch",
      "dispatch_tasks",
      `INSERT INTO dispatch_tasks (
         dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
         source_event_id, stream_name, stream_entry_id, status, attempt_count,
         max_attempts, last_reason, target_latitude, target_longitude,
         geo_provider_envelope_json, created_at
       ) VALUES (?, ?, ?, ?, 'sku_home_daily_2h', 89.00, ?,
         CONCAT('xlb:dispatch:', ?), 'investor-demo-stream-0', 'queued', 0, 3,
         'staging demo reset', NULL, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id), sku_id=VALUES(sku_id),
         amount=89.00, source_event_id=VALUES(source_event_id),
         stream_name=VALUES(stream_name), stream_entry_id=VALUES(stream_entry_id),
         status='queued', attempt_count=0, max_attempts=3,
         last_reason='staging demo reset', target_latitude=NULL,
         target_longitude=NULL, geo_provider_envelope_json=NULL`,
      [
        ids.activeDispatchTaskId,
        target.cityCode,
        ids.activeOrderId,
        ids.customerId,
        ids.activeEventId,
        target.cityCode,
        fixedCreatedAt,
      ],
      ids.activeDispatchTaskId,
    ),
    op(
      "history_dispatch",
      "dispatch_tasks",
      `INSERT INTO dispatch_tasks (
         dispatch_task_id, city_code, order_id, customer_id, sku_id, amount,
         source_event_id, stream_name, stream_entry_id, status, attempt_count,
         max_attempts, last_reason, target_latitude, target_longitude,
         geo_provider_envelope_json, created_at
       ) VALUES (?, ?, ?, ?, 'sku_home_daily_2h', 89.00,
         'investor-demo-event-order-history', CONCAT('xlb:dispatch:', ?),
         'investor-demo-stream-history', 'completed', 1, 3,
         '演示服务已完成', NULL, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE customer_id=VALUES(customer_id), sku_id=VALUES(sku_id),
         amount=89.00, status='completed', attempt_count=1, max_attempts=3,
         last_reason='演示服务已完成', target_latitude=NULL,
         target_longitude=NULL, geo_provider_envelope_json=NULL`,
      [
        ids.historyDispatchTaskId,
        target.cityCode,
        ids.historyOrderId,
        ids.customerId,
        target.cityCode,
        fixedCreatedAt,
      ],
      ids.historyDispatchTaskId,
    ),
    op(
      "history_acceptance",
      "worker_task_acceptances",
      `INSERT INTO worker_task_acceptances (
         acceptance_id, dispatch_task_id, city_code, order_id, worker_id,
         sku_id, status, accepted_at
       ) VALUES (?, ?, ?, ?, ?, 'sku_home_daily_2h', 'accepted', ?)
       ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id), status='accepted',
         accepted_at=VALUES(accepted_at)`,
      [
        ids.historyAcceptanceId,
        ids.historyDispatchTaskId,
        target.cityCode,
        ids.historyOrderId,
        target.workerId,
        fixedCreatedAt,
      ],
      ids.historyAcceptanceId,
    ),
    op(
      "history_fulfillment",
      "fulfillments",
      `INSERT INTO fulfillments (
         fulfillment_id, acceptance_id, dispatch_task_id, order_id, city_code,
         worker_id, sku_id, status, started_at, completed_at, completion_note
       ) VALUES (?, ?, ?, ?, ?, ?, 'sku_home_daily_2h', 'completed', ?, ?,
         '演示服务按约完成')
       ON DUPLICATE KEY UPDATE worker_id=VALUES(worker_id), status='completed',
         started_at=VALUES(started_at), completed_at=VALUES(completed_at),
         completion_note='演示服务按约完成'`,
      [
        ids.historyFulfillmentId,
        ids.historyAcceptanceId,
        ids.historyDispatchTaskId,
        ids.historyOrderId,
        target.cityCode,
        target.workerId,
        fixedCreatedAt,
        fixedCompletedAt,
      ],
      ids.historyFulfillmentId,
    ),
    op(
      "history_review",
      "order_reviews",
      `INSERT INTO order_reviews (
         review_id, city_code, order_id, customer_id, worker_id, fulfillment_id,
         rating, comment, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, 5, '服务准时，流程清晰（演示评价）', 'created', ?)
       ON DUPLICATE KEY UPDATE rating=5,
         comment='服务准时，流程清晰（演示评价）', status='created'`,
      [
        ids.historyReviewId,
        target.cityCode,
        ids.historyOrderId,
        ids.customerId,
        target.workerId,
        ids.historyFulfillmentId,
        fixedCompletedAt,
      ],
      ids.historyReviewId,
    ),
    op(
      "history_review_state",
      "review_visibility_states",
      `INSERT INTO review_visibility_states (
         visibility_state_id, city_code, review_id, visibility,
         moderation_version, current_decision_id, row_version
       ) VALUES (?, ?, ?, 'pending_moderation', 0, NULL, 1)
       ON DUPLICATE KEY UPDATE visibility='pending_moderation',
         moderation_version=0, current_decision_id=NULL, row_version=1`,
      [ids.historyVisibilityId, target.cityCode, ids.historyReviewId],
      ids.historyVisibilityId,
    ),
    ...buildCouponOperations(target, hash, fixedCreatedAt, expiresAt),
    ...buildNotificationOperations(target, {
      payloadHash,
      targetFingerprint,
      renderParameters,
      renderParametersHash,
      fixedCreatedAt,
    }),
    op(
      "support_ticket",
      "support_tickets",
      `INSERT INTO support_tickets (
         ticket_id, city_code, source, requester_id, type, priority, status,
         subject, description, related_order_id, related_worker_id,
         linked_aftersale_complaint_id, assigned_agent_id, assigned_skill_group_id,
         sla_first_response_due_at, sla_resolution_due_at, first_responded_at,
         resolved_at, closed_at, resolution_code, idempotency_key, version
       ) VALUES (?, ?, 'customer', ?, 'order_question', 'normal', 'open',
         '演示订单服务时间确认', '仅供投资人演示的虚拟客服工单。',
         ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
         'investor-demo-support-ticket-v1', 1)
       ON DUPLICATE KEY UPDATE priority='normal', status='open',
         subject=VALUES(subject), description=VALUES(description),
         related_order_id=VALUES(related_order_id),
         related_worker_id=VALUES(related_worker_id),
         assigned_agent_id=NULL, assigned_skill_group_id=NULL,
         first_responded_at=NULL, resolved_at=NULL, closed_at=NULL,
         resolution_code=NULL, version=1`,
      [
        ids.supportTicketId,
        target.cityCode,
        ids.customerId,
        ids.activeOrderId,
        target.workerId,
      ],
      ids.supportTicketId,
    ),
    op(
      "support_ticket_event",
      "support_ticket_events",
      `INSERT INTO support_ticket_events (
         ticket_event_id, city_code, ticket_id, event_type, actor_type, actor_id,
         visibility, content, payload_json, idempotency_key, created_at
       ) VALUES (?, ?, ?, 'created', 'customer', ?, 'all',
         '演示工单已创建', JSON_OBJECT('demo', TRUE),
         'investor-demo-support-event-v1', ?)
       ON DUPLICATE KEY UPDATE event_type='created', actor_type='customer',
         actor_id=VALUES(actor_id), visibility='all', content='演示工单已创建',
         payload_json=JSON_OBJECT('demo', TRUE)`,
      [
        ids.supportEventId,
        target.cityCode,
        ids.supportTicketId,
        ids.customerId,
        fixedCreatedAt,
      ],
      ids.supportEventId,
    ),
  ];
}

function buildOrderOperations(
  target: StagingDemoBootstrapTarget,
  input: {
    orderId: string;
    status: "pending_dispatch" | "service_completed";
    scheduledAt: string;
    createdAt: string;
  },
): StagingDemoOperation[] {
  return [
    op(
      `order_${input.status}`,
      "orders",
      `INSERT INTO orders (
         order_id, city_code, address_province, address_city, address_district,
         detail_address, contact_name, contact_phone, scheduled_at,
         scheduled_time_slot, customer_id, sku_id, sku_name, quantity, unit,
         price_rule_id, price_text, price_type, base_price, currency,
         total_amount, status, created_at
       ) VALUES (?, ?, '浙江省', '杭州市', '拱墅区',
         '演示路 100 号（虚拟地址）', '演示客户', ?, ?, 'morning', ?,
         'sku_home_daily_2h', '2小时日常保洁', 1, '次',
         'price_hangzhou_sku_home_daily_2h', '¥89/2小时', 'fixed',
         89.00, 'CNY', 89.00, ?, ?)
       ON DUPLICATE KEY UPDATE city_code=VALUES(city_code),
         address_province=VALUES(address_province), address_city=VALUES(address_city),
         address_district=VALUES(address_district), detail_address=VALUES(detail_address),
         contact_name=VALUES(contact_name), contact_phone=VALUES(contact_phone),
         scheduled_at=VALUES(scheduled_at), scheduled_time_slot='morning',
         customer_id=VALUES(customer_id), sku_id=VALUES(sku_id),
         sku_name=VALUES(sku_name), quantity=1, unit='次',
         price_rule_id=VALUES(price_rule_id), price_text=VALUES(price_text),
         price_type='fixed', base_price=89.00, currency='CNY',
         total_amount=89.00, status=VALUES(status)`,
      [
        input.orderId,
        target.cityCode,
        target.customerPhone,
        input.scheduledAt,
        STAGING_DEMO_IDS.customerId,
        input.status,
        input.createdAt,
      ],
      input.orderId,
    ),
  ];
}

function buildCouponOperations(
  target: StagingDemoBootstrapTarget,
  hash: (suffix: string) => string,
  fixedCreatedAt: string,
  expiresAt: string,
): StagingDemoOperation[] {
  const ids = STAGING_DEMO_IDS;
  const startAt = "2026-01-01 00:00:00.000";
  const ruleContentHash = hash("coupon-rule-content");
  return [
    op(
      "coupon_campaign",
      "marketing_campaigns",
      `INSERT INTO marketing_campaigns (
         marketing_campaign_id, city_code, name, status, active_rule_revision_id,
         start_at, end_at, reviewed_by, reviewed_at,
         create_idempotency_key_hash, create_request_fingerprint, version, created_by
       ) VALUES (?, ?, '投资人演示优惠', 'active', NULL, ?, ?, 'demo-reviewer', ?,
         ?, ?, 1, 'demo-reset-service')
       ON DUPLICATE KEY UPDATE name=VALUES(name), status='active',
         active_rule_revision_id=NULL, start_at=VALUES(start_at), end_at=VALUES(end_at),
         reviewed_by='demo-reviewer', reviewed_at=VALUES(reviewed_at), version=1`,
      [
        ids.marketingCampaignId,
        target.cityCode,
        startAt,
        expiresAt,
        fixedCreatedAt,
        hash("coupon-campaign-idempotency"),
        hash("coupon-campaign-request"),
      ],
      ids.marketingCampaignId,
    ),
    op(
      "coupon_rule",
      "marketing_rule_revisions",
      `INSERT INTO marketing_rule_revisions (
         rule_revision_id, marketing_campaign_id, city_code, revision, status,
         allowed_sku_ids_json, content_hash, reviewed_by, reviewed_at,
         published_by, published_at, create_idempotency_key_hash,
         create_request_fingerprint, version, created_by
       ) VALUES (?, ?, ?, 1, 'published', JSON_ARRAY('sku_home_daily_2h'), ?,
         'demo-reviewer', ?, 'demo-publisher', ?, ?, ?, 1, 'demo-reset-service')
       ON DUPLICATE KEY UPDATE status='published',
         allowed_sku_ids_json=JSON_ARRAY('sku_home_daily_2h'),
         content_hash=VALUES(content_hash), reviewed_by='demo-reviewer',
         reviewed_at=VALUES(reviewed_at), published_by='demo-publisher',
         published_at=VALUES(published_at), version=1`,
      [
        ids.marketingRuleRevisionId,
        ids.marketingCampaignId,
        target.cityCode,
        ruleContentHash,
        fixedCreatedAt,
        fixedCreatedAt,
        hash("coupon-rule-idempotency"),
        hash("coupon-rule-request"),
      ],
      ids.marketingRuleRevisionId,
    ),
    op(
      "coupon_campaign_pointer",
      "marketing_campaigns",
      `UPDATE marketing_campaigns SET active_rule_revision_id=?
       WHERE marketing_campaign_id=? AND city_code=?`,
      [ids.marketingRuleRevisionId, ids.marketingCampaignId, target.cityCode],
      ids.marketingCampaignId,
    ),
    op(
      "coupon_definition",
      "coupon_definitions",
      `INSERT INTO coupon_definitions (
         coupon_definition_id, marketing_campaign_id, rule_revision_id, city_code,
         name, status, currency, face_value_minor, min_spend_minor, issuance_cap,
         issued_count, compensation_cap, compensation_issued_count,
         valid_from, valid_until, create_idempotency_key_hash,
         create_request_fingerprint, version, created_by
       ) VALUES (?, ?, ?, ?, '演示满减券', 'active', 'CNY', 1000, 5000, 100,
         1, 100, 0, ?, ?, ?, ?, 1, 'demo-reset-service')
       ON DUPLICATE KEY UPDATE name='演示满减券', status='active',
         face_value_minor=1000, min_spend_minor=5000, issuance_cap=100,
         issued_count=1, compensation_cap=100, compensation_issued_count=0,
         valid_from=VALUES(valid_from), valid_until=VALUES(valid_until), version=1`,
      [
        ids.couponDefinitionId,
        ids.marketingCampaignId,
        ids.marketingRuleRevisionId,
        target.cityCode,
        startAt,
        expiresAt,
        hash("coupon-definition-idempotency"),
        hash("coupon-definition-request"),
      ],
      ids.couponDefinitionId,
    ),
    op(
      "coupon_grant",
      "coupon_grants",
      `INSERT INTO coupon_grants (
         coupon_grant_id, coupon_definition_id, marketing_campaign_id,
         rule_revision_id, city_code, customer_id, status, issuance_reason,
         issuance_ref, available_at, expires_at, idempotency_key_hash,
         request_fingerprint, version, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, 'available', 'campaign_targeted',
         'investor-demo-bootstrap', ?, ?, ?, ?, 1, 'demo-reset-service')
       ON DUPLICATE KEY UPDATE status='available', available_at=VALUES(available_at),
         expires_at=VALUES(expires_at), version=1`,
      [
        ids.couponGrantId,
        ids.couponDefinitionId,
        ids.marketingCampaignId,
        ids.marketingRuleRevisionId,
        target.cityCode,
        ids.customerId,
        fixedCreatedAt,
        expiresAt,
        hash("coupon-grant-idempotency"),
        hash("coupon-grant-request"),
      ],
      ids.couponGrantId,
    ),
  ];
}

function buildNotificationOperations(
  target: StagingDemoBootstrapTarget,
  input: {
    payloadHash: string;
    targetFingerprint: string;
    renderParameters: string;
    renderParametersHash: string;
    fixedCreatedAt: string;
  },
): StagingDemoOperation[] {
  const ids = STAGING_DEMO_IDS;
  const contentHash = sha256("演示订单已创建|您的演示订单已进入待调度状态");
  return [
    op(
      "notification_subscriber",
      "platform_event_subscribers",
      `INSERT INTO platform_event_subscribers (
         subscriber_id, stable_name, owner_domain, owner_contact,
         handler_revision, purpose, max_pii_level, status,
         created_by_service_id, updated_by_service_id, row_version
       ) VALUES (?, 'investor-demo-notification', 'notification', NULL,
         'investor-demo-v1', 'staging investor demo only', 'P1', 'active',
         'demo-reset-service', 'demo-reset-service', 1)
       ON DUPLICATE KEY UPDATE handler_revision='investor-demo-v1',
         purpose='staging investor demo only', max_pii_level='P1',
         status='active', updated_by_service_id='demo-reset-service', row_version=1`,
      [ids.notificationSubscriberId],
      ids.notificationSubscriberId,
    ),
    op(
      "notification_subscription",
      "platform_event_subscriptions",
      `INSERT INTO platform_event_subscriptions (
         subscription_id, city_code, subscriber_id, event_type,
         event_major_version, compatibility_handler_revision,
         live_start_created_at, live_start_event_id, retention_class, status,
         lease_seconds, max_attempts, created_by_service_id,
         updated_by_service_id, row_version
       ) VALUES (?, ?, ?, 'order.created', 0, 'investor-demo-v1',
         NULL, NULL, 'R1', 'active', 30, 3,
         'demo-reset-service', 'demo-reset-service', 1)
       ON DUPLICATE KEY UPDATE status='active',
         compatibility_handler_revision='investor-demo-v1',
         live_start_created_at=NULL, live_start_event_id=NULL,
         lease_seconds=30, max_attempts=3, row_version=1`,
      [ids.notificationSubscriptionId, target.cityCode, ids.notificationSubscriberId],
      ids.notificationSubscriptionId,
    ),
    op(
      "notification_delivery",
      "platform_event_deliveries",
      `INSERT INTO platform_event_deliveries (
         delivery_id, city_code, subscriber_id, subscription_id, event_id,
         event_type, event_major_version, payload_hash, aggregate_type,
         aggregate_id, aggregate_version, aggregate_sequence, status,
         available_at, lease_owner, lease_token, lease_expires_at,
         attempt_count, max_attempts, last_error_code, last_error_message,
         last_failed_at, delivered_at, dead_lettered_at, row_version, created_at
       ) VALUES (?, ?, ?, ?, ?, 'order.created', 0, ?, 'order', ?, NULL, NULL,
         'delivered', ?, NULL, NULL, NULL, 1, 3, NULL, NULL, NULL, ?, NULL, 1, ?)
       ON DUPLICATE KEY UPDATE payload_hash=VALUES(payload_hash), status='delivered',
         lease_owner=NULL, lease_token=NULL, lease_expires_at=NULL,
         attempt_count=1, max_attempts=3, last_error_code=NULL,
         last_error_message=NULL, last_failed_at=NULL,
         delivered_at=VALUES(delivered_at), dead_lettered_at=NULL, row_version=1`,
      [
        ids.notificationDeliveryId,
        target.cityCode,
        ids.notificationSubscriberId,
        ids.notificationSubscriptionId,
        ids.activeEventId,
        input.payloadHash,
        ids.activeOrderId,
        input.fixedCreatedAt,
        input.fixedCreatedAt,
        input.fixedCreatedAt,
      ],
      ids.notificationDeliveryId,
    ),
    op(
      "notification_template",
      "notification_templates",
      `INSERT INTO notification_templates (
         template_id, city_code, template_key, event_type, recipient_type,
         category_code, owner_service_id, status, row_version
       ) VALUES (?, ?, 'investor-demo.order-created', 'order.created',
         'customer', 'orders', 'demo-reset-service', 'published', 1)
       ON DUPLICATE KEY UPDATE status='published', row_version=1`,
      [ids.notificationTemplateId, target.cityCode],
      ids.notificationTemplateId,
    ),
    op(
      "notification_template_revision",
      "notification_template_revisions",
      `INSERT INTO notification_template_revisions (
         template_revision_id, city_code, template_id, revision_number,
         revision_label, locale, title_pattern, body_pattern,
         parameter_names_json, content_hash, pii_level, status,
         created_by_service_id, reviewed_by_actor_id, published_by_actor_id,
         created_at, reviewed_at, published_at, retired_at
       ) VALUES (?, ?, ?, 1, 'investor-demo-v1', 'zh-CN',
         '演示订单已创建', '您的演示订单已进入待调度状态',
         JSON_ARRAY('orderId','skuName'), ?, 'P1', 'published',
         'demo-reset-service', 'demo-reviewer', 'demo-publisher',
         ?, ?, ?, NULL)
       ON DUPLICATE KEY UPDATE title_pattern=VALUES(title_pattern),
         body_pattern=VALUES(body_pattern), content_hash=VALUES(content_hash),
         status='published', reviewed_by_actor_id='demo-reviewer',
         published_by_actor_id='demo-publisher', reviewed_at=VALUES(reviewed_at),
         published_at=VALUES(published_at), retired_at=NULL`,
      [
        ids.notificationTemplateRevisionId,
        target.cityCode,
        ids.notificationTemplateId,
        contentHash,
        input.fixedCreatedAt,
        input.fixedCreatedAt,
        input.fixedCreatedAt,
      ],
      ids.notificationTemplateRevisionId,
    ),
    op(
      "notification_record",
      "notification_records",
      `INSERT INTO notification_records (
         notification_id, city_code, recipient_type, recipient_id,
         source_event_id, subscriber_id, event_type, event_major_version,
         template_revision_id, payload_hash, target_fingerprint,
         render_parameters_json, render_parameters_hash, rendered_title,
         rendered_body, occurred_at, created_at
       ) VALUES (?, ?, 'customer', ?, ?, ?, 'order.created', 0, ?, ?, ?,
         CAST(? AS JSON), ?, '演示订单已创建', '您的演示订单已进入待调度状态',
         ?, ?)
       ON DUPLICATE KEY UPDATE payload_hash=VALUES(payload_hash),
         target_fingerprint=VALUES(target_fingerprint),
         render_parameters_json=VALUES(render_parameters_json),
         render_parameters_hash=VALUES(render_parameters_hash),
         rendered_title=VALUES(rendered_title), rendered_body=VALUES(rendered_body),
         occurred_at=VALUES(occurred_at)`,
      [
        ids.notificationId,
        target.cityCode,
        ids.customerId,
        ids.activeEventId,
        ids.notificationSubscriberId,
        ids.notificationTemplateRevisionId,
        input.payloadHash,
        input.targetFingerprint,
        input.renderParameters,
        input.renderParametersHash,
        input.fixedCreatedAt,
        input.fixedCreatedAt,
      ],
      ids.notificationId,
    ),
    op(
      "notification_receipt",
      "notification_delivery_receipts",
      `INSERT INTO notification_delivery_receipts (
         receipt_id, city_code, subscriber_id, event_id, notification_id,
         template_revision_id, source_payload_hash, target_fingerprint,
         result, committed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?)
       ON DUPLICATE KEY UPDATE source_payload_hash=VALUES(source_payload_hash),
         target_fingerprint=VALUES(target_fingerprint), result='applied',
         committed_at=VALUES(committed_at)`,
      [
        ids.notificationReceiptId,
        target.cityCode,
        ids.notificationSubscriberId,
        ids.activeEventId,
        ids.notificationId,
        ids.notificationTemplateRevisionId,
        input.payloadHash,
        input.targetFingerprint,
        input.fixedCreatedAt,
      ],
      ids.notificationReceiptId,
    ),
    op(
      "notification_state",
      "notification_recipient_states",
      `INSERT INTO notification_recipient_states (
         state_id, city_code, notification_id, recipient_type, recipient_id,
         read_at, archived_at, hidden_at, row_version
       ) VALUES (?, ?, ?, 'customer', ?, NULL, NULL, NULL, 1)
       ON DUPLICATE KEY UPDATE read_at=NULL, archived_at=NULL,
         hidden_at=NULL, row_version=1`,
      [ids.notificationStateId, target.cityCode, ids.notificationId, ids.customerId],
      ids.notificationStateId,
    ),
    op(
      "notification_preference",
      "notification_recipient_preferences",
      `INSERT INTO notification_recipient_preferences (
         preference_id, city_code, recipient_type, recipient_id, category_code,
         preference_value, updated_by_actor_type, updated_by_actor_id, row_version
       ) VALUES (?, ?, 'customer', ?, 'orders', 'enabled',
         'notification_service', 'demo-reset-service', 1)
       ON DUPLICATE KEY UPDATE preference_value='enabled',
         updated_by_actor_type='notification_service',
         updated_by_actor_id='demo-reset-service', row_version=1`,
      [ids.notificationPreferenceId, target.cityCode, ids.customerId],
      ids.notificationPreferenceId,
    ),
  ];
}

export async function assertConnectedDatabase(
  connection: Pick<PoolConnection, "query">,
  expectedDatabase: string,
): Promise<void> {
  const [rows] = await connection.query<(RowDataPacket & { database_name: string | null })[]>(
    "SELECT DATABASE() AS database_name",
  );
  if (rows[0]?.database_name !== expectedDatabase) {
    throw new Error("connected database does not match the validated staging demo target");
  }
}

export async function applyStagingDemoOperations(
  connection: Pick<
    PoolConnection,
    "beginTransaction" | "commit" | "rollback" | "query"
  >,
  operations: readonly StagingDemoOperation[],
): Promise<Array<{
  label: string;
  table: string;
  entityIds: readonly string[];
  affectedRows: number;
}>> {
  await connection.beginTransaction();
  try {
    const results = [];
    for (const operation of operations) {
      const [result] = await connection.query<ResultSetHeader>(
        operation.sql,
        [...operation.params],
      );
      results.push({
        label: operation.label,
        table: operation.table,
        entityIds: operation.entityIds,
        affectedRows: result.affectedRows,
      });
    }
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function runStagingDemoBootstrap(options: {
  dryRun: boolean;
  rawEnv?: NodeJS.ProcessEnv;
}): Promise<StagingDemoBootstrapSummary> {
  const env = loadEnv();
  const target = validateStagingDemoBootstrapTarget(env, options.rawEnv);
  const operations = buildStagingDemoOperations(target);
  if (options.dryRun) {
    return {
      dryRun: true,
      environment: "staging",
      target: {
        mysqlHost: target.mysqlHost,
        mysqlDatabase: target.mysqlDatabase,
        cityCode: target.cityCode,
      },
      operationCount: operations.length,
      affectedRows: 0,
      operations: operations.map((operation) => ({
        label: operation.label,
        table: operation.table,
        entityIds: operation.entityIds,
        affectedRows: 0,
      })),
    };
  }

  const connection = await getMysqlPool().getConnection();
  try {
    await assertConnectedDatabase(connection, target.mysqlDatabase);
    const applied = await applyStagingDemoOperations(connection, operations);
    return {
      dryRun: false,
      environment: "staging",
      target: {
        mysqlHost: target.mysqlHost,
        mysqlDatabase: target.mysqlDatabase,
        cityCode: target.cityCode,
      },
      operationCount: operations.length,
      affectedRows: applied.reduce((total, item) => total + item.affectedRows, 0),
      operations: applied,
    };
  } finally {
    connection.release();
  }
}
