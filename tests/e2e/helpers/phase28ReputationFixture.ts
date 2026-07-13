import { randomUUID } from "node:crypto";
import type { PlatformServiceIdentity } from "@xlb/types";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { PlatformDeliveryService } from "../../../backend/src/events/platformDeliveryService.js";
import { ReputationProjectionWorker } from "../../../backend/src/review/reputationProjectionWorker.js";

const prefix = `p28e_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
const subscriberId = `${prefix}_subscriber`;
const createdSubscriptionId = `${prefix}_created`;
const visibilitySubscriptionId = `${prefix}_visibility`;
const generationId = `${prefix}_generation`;
const serviceId = `${prefix}_service`;
const identity: PlatformServiceIdentity = {
  identityKind: "platform_service",
  credentialKind: "internal_domain_contract",
  serviceId,
  subscriberId,
  cityCode: "hangzhou",
};
let previousPointer: {
  active_generation_id: string;
  row_version: number;
  activated_by_actor_id: string;
} | null = null;

export function phase28GenerationId(): string { return generationId; }

export async function setupPhase28ReputationProjection(): Promise<void> {
  const pool = getMysqlPool();
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
       'Phase28 browser acceptance projection','visible_arithmetic_mean_v1',0,0,
       CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
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
     VALUES (?,?, 'reputation','review-v1-r1','Phase28 browser acceptance','P1','active',?,?)`,
    [subscriberId, `${prefix}.reputation`, serviceId, serviceId],
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
}

async function projectSubscription(subscriptionId: string): Promise<void> {
  const platform = new PlatformDeliveryService();
  const materialized = await platform.materializeCandidateBatch(identity, subscriptionId, 100);
  if (materialized.rejected !== 0 || materialized.inserted < 1) {
    throw new Error(`Phase28 browser materialization failed: ${JSON.stringify(materialized)}`);
  }
  const result = await new ReputationProjectionWorker().runOnce(identity, {
    subscriptionId,
    owner: `${prefix}_owner`,
    limit: 100,
    leaseSeconds: 30,
  });
  if (result.failed !== 0 || result.conflicts !== 0 || result.acknowledged !== result.claimed) {
    throw new Error(`Phase28 browser projection failed: ${JSON.stringify(result)}`);
  }
}

export async function projectPhase28ReviewLifecycle(): Promise<void> {
  await projectSubscription(createdSubscriptionId);
  await projectSubscription(visibilitySubscriptionId);
}

export async function cleanupPhase28ReputationProjection(): Promise<void> {
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
}
