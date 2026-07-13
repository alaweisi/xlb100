import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  PlatformReviewCreatedV1CompatibilityProjection,
  PlatformReviewVisibilityChangedV1CompatibilityProjection,
  WorkerReputation,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";

export const REPUTATION_FORMULA_REVISION = "visible_arithmetic_mean_v1";

type ReputationProjection = PlatformReviewCreatedV1CompatibilityProjection
  | PlatformReviewVisibilityChangedV1CompatibilityProjection;

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

function ratingColumn(rating: number): string {
  if (![1, 2, 3, 4, 5].includes(rating)) throw new Error("invalid reputation rating");
  return `rating_${rating}_count`;
}

export class ReputationProjectionConflictError extends Error {}

export class ReputationRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async findWorkerReputation(cityCode: CityCode, workerId: string): Promise<WorkerReputation | null> {
    const [rows] = await this.pool.query<(RowDataPacket & {
      generation_id: string; rating_count: number; rating_sum: number;
      rating_1_count: number; rating_2_count: number; rating_3_count: number;
      rating_4_count: number; rating_5_count: number; formula_revision: string;
      source_watermark: string | null; updated_at: Date;
    })[]>(
      `SELECT a.generation_id,a.rating_count,a.rating_sum,a.rating_1_count,
              a.rating_2_count,a.rating_3_count,a.rating_4_count,a.rating_5_count,
              a.formula_revision,a.source_watermark,a.updated_at
         FROM reputation_projection_pointers p
         INNER JOIN reputation_worker_aggregates a
           ON a.city_code=p.city_code AND a.generation_id=p.active_generation_id
        WHERE p.city_code=? AND a.worker_id=? LIMIT 1`,
      [cityCode, workerId],
    );
    const row = rows[0];
    if (!row) return null;
    const ratingCount = Number(row.rating_count);
    const ratingSum = Number(row.rating_sum);
    return {
      workerId,
      cityCode,
      ratingCount,
      ratingSum,
      ratingDistribution: {
        "1": Number(row.rating_1_count), "2": Number(row.rating_2_count),
        "3": Number(row.rating_3_count), "4": Number(row.rating_4_count),
        "5": Number(row.rating_5_count),
      },
      averageRating: ratingCount === 0 ? null : Number((ratingSum / ratingCount).toFixed(2)),
      sourceGenerationId: row.generation_id,
      formulaRevision: row.formula_revision,
      sourceWatermark: row.source_watermark,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async ensureLiveGeneration(
    connection: PoolConnection,
    cityCode: CityCode,
    actorServiceId: string,
  ): Promise<string> {
    const [pointers] = await connection.query<(RowDataPacket & { active_generation_id: string })[]>(
      `SELECT active_generation_id FROM reputation_projection_pointers
        WHERE city_code=? LIMIT 1 FOR UPDATE`,
      [cityCode],
    );
    if (pointers[0]) return pointers[0].active_generation_id;
    const generationId = id("rpg");
    await connection.query(
      `INSERT INTO reputation_projection_generations
        (generation_id,city_code,status,build_kind,requested_by_actor_type,
         requested_by_actor_id,reason,formula_revision,source_row_count,
         visible_row_count,created_at,ready_at,activated_at)
       VALUES (?,?,'active','live','reputation_service',?,
         'first exact-v1 delivery initialized the dormant live generation',?,0,0,
         CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))`,
      [generationId, cityCode, actorServiceId, REPUTATION_FORMULA_REVISION],
    );
    await connection.query(
      `INSERT INTO reputation_projection_pointers
        (city_code,active_generation_id,row_version,activated_by_actor_id)
       VALUES (?,?,1,?)`,
      [cityCode, generationId, actorServiceId],
    );
    return generationId;
  }

  private async findReceipt(
    connection: PoolConnection,
    projection: ReputationProjection,
  ): Promise<(RowDataPacket & {
    generation_id: string; review_id: string; payload_hash: string;
    event_major_version: number;
  }) | null> {
    const [rows] = await connection.query<(RowDataPacket & {
      generation_id: string; review_id: string; payload_hash: string;
      event_major_version: number;
    })[]>(
      `SELECT generation_id,review_id,payload_hash,event_major_version
         FROM reputation_projection_receipts
        WHERE subscriber_id=? AND event_id=? LIMIT 1 FOR UPDATE`,
      [projection.subscriberId, projection.eventId],
    );
    return rows[0] ?? null;
  }

  private assertReceiptMatches(
    receipt: RowDataPacket & { generation_id: string; review_id: string;
      payload_hash: string; event_major_version: number },
    projection: ReputationProjection,
    generationId: string,
  ): void {
    if (receipt.generation_id !== generationId || receipt.review_id !== projection.reviewId
      || receipt.payload_hash !== projection.payloadHash
      || Number(receipt.event_major_version) !== 1) {
      throw new ReputationProjectionConflictError("projection receipt conflicts with exact source event");
    }
  }

  async materializeCreated(
    connection: PoolConnection,
    projection: PlatformReviewCreatedV1CompatibilityProjection,
    actorServiceId: string,
  ): Promise<"applied" | "reused"> {
    const generationId = await this.ensureLiveGeneration(connection, projection.cityCode, actorServiceId);
    const receipt = await this.findReceipt(connection, projection);
    if (receipt) {
      this.assertReceiptMatches(receipt, projection, generationId);
      return "reused";
    }
    const [reviews] = await connection.query<(RowDataPacket & {
      order_id: string; worker_id: string; rating: number;
    })[]>(
      `SELECT r.order_id,r.worker_id,r.rating FROM order_reviews r
       INNER JOIN review_visibility_states v
         ON v.city_code=r.city_code AND v.review_id=r.review_id
       WHERE r.city_code=? AND r.review_id=? LIMIT 1 FOR UPDATE`,
      [projection.cityCode, projection.reviewId],
    );
    const review = reviews[0];
    if (!review || review.order_id !== projection.orderId
      || review.worker_id !== projection.workerId
      || Number(review.rating) !== projection.rating
      || projection.visibility !== "pending_moderation") {
      throw new ReputationProjectionConflictError("review.created projection conflicts with canonical review");
    }
    const [existingContributions] = await connection.query<(RowDataPacket & {
      contribution_id: string; worker_id: string; rating: number; visibility: string;
      source_moderation_version: number;
    })[]>(
      `SELECT contribution_id,worker_id,rating,visibility,source_moderation_version
         FROM reputation_review_contributions
        WHERE city_code=? AND generation_id=? AND review_id=? LIMIT 1 FOR UPDATE`,
      [projection.cityCode, generationId, projection.reviewId],
    );
    const existingContribution = existingContributions[0];
    if (existingContribution) {
      if (existingContribution.worker_id !== projection.workerId
        || Number(existingContribution.rating) !== projection.rating) {
        throw new ReputationProjectionConflictError(
          "existing contribution conflicts with canonical review identity",
        );
      }
      await this.insertReceipt(connection, generationId, projection, "reused");
      return "reused";
    }
    await connection.query(
      `INSERT INTO reputation_review_contributions
        (contribution_id,city_code,generation_id,review_id,worker_id,rating,visibility,
         source_event_id,source_moderation_version,included_at,excluded_at)
       VALUES (?,?,?,?,?,?,'pending_moderation',?,0,NULL,NULL)
       ON DUPLICATE KEY UPDATE contribution_id=contribution_id`,
      [id("rpc"), projection.cityCode, generationId, projection.reviewId,
        projection.workerId, projection.rating, projection.eventId],
    );
    await this.insertReceipt(connection, generationId, projection, "applied");
    await this.updateWatermark(connection, projection.cityCode, generationId, projection.eventId);
    return "applied";
  }

  async materializeVisibilityChanged(
    connection: PoolConnection,
    projection: PlatformReviewVisibilityChangedV1CompatibilityProjection,
    actorServiceId: string,
  ): Promise<"applied" | "reused"> {
    const generationId = await this.ensureLiveGeneration(connection, projection.cityCode, actorServiceId);
    const receipt = await this.findReceipt(connection, projection);
    if (receipt) {
      this.assertReceiptMatches(receipt, projection, generationId);
      return "reused";
    }
    const [rows] = await connection.query<(RowDataPacket & {
      contribution_id: string; worker_id: string; rating: number; visibility: string;
      source_moderation_version: number;
    })[]>(
      `SELECT contribution_id,worker_id,rating,visibility,source_moderation_version
         FROM reputation_review_contributions
        WHERE city_code=? AND generation_id=? AND review_id=? LIMIT 1 FOR UPDATE`,
      [projection.cityCode, generationId, projection.reviewId],
    );
    const contribution = rows[0];
    if (!contribution) {
      throw new ReputationProjectionConflictError("review.created contribution must be projected first");
    }
    const [canonicalRows] = await connection.query<(RowDataPacket & {
      worker_id: string; rating: number; decision: string; previous_decision: string | null;
    })[]>(
      `SELECT r.worker_id,r.rating,d.decision,
          (SELECT previous.decision FROM review_moderation_decisions previous
            WHERE previous.city_code=d.city_code AND previous.review_id=d.review_id
              AND previous.moderation_version=d.moderation_version-1 LIMIT 1) AS previous_decision
         FROM order_reviews r
         INNER JOIN review_moderation_decisions d
           ON d.city_code=r.city_code AND d.review_id=r.review_id
          AND d.moderation_version=?
        WHERE r.city_code=? AND r.review_id=? LIMIT 1 FOR UPDATE`,
      [projection.moderationVersion, projection.cityCode, projection.reviewId],
    );
    const canonical = canonicalRows[0];
    const canonicalFrom = projection.moderationVersion === 1
      ? "pending_moderation"
      : canonical?.previous_decision;
    if (!canonical || canonical.worker_id !== projection.workerId
      || Number(canonical.rating) !== projection.rating
      || canonical.decision !== projection.toVisibility
      || canonicalFrom !== projection.fromVisibility
      || contribution.worker_id !== projection.workerId
      || Number(contribution.rating) !== projection.rating) {
      throw new ReputationProjectionConflictError("visibility projection conflicts with current contribution");
    }
    const currentVersion = Number(contribution.source_moderation_version);
    if (currentVersion > projection.moderationVersion) {
      await this.insertReceipt(connection, generationId, projection, "reused");
      return "reused";
    }
    if (currentVersion === projection.moderationVersion) {
      if (contribution.visibility !== projection.toVisibility) {
        throw new ReputationProjectionConflictError(
          "visibility projection version conflicts with contribution state",
        );
      }
      await this.insertReceipt(connection, generationId, projection, "reused");
      return "reused";
    }
    if (currentVersion + 1 !== projection.moderationVersion
      || contribution.visibility !== projection.fromVisibility) {
      throw new ReputationProjectionConflictError(
        "visibility projection is out of order and must be retried",
      );
    }
    const wasVisible = contribution.visibility === "visible";
    const isVisible = projection.toVisibility === "visible";
    if (wasVisible !== isVisible) {
      await this.applyAggregateDelta(connection, {
        cityCode: projection.cityCode, generationId, workerId: projection.workerId,
        rating: projection.rating, delta: isVisible ? 1 : -1,
        watermark: projection.eventId,
      });
    }
    await connection.query(
      `UPDATE reputation_review_contributions
          SET visibility=?,source_event_id=?,source_moderation_version=?,
              included_at=IF(?='visible',CURRENT_TIMESTAMP(3),NULL),
              excluded_at=IF(?='hidden',CURRENT_TIMESTAMP(3),NULL)
        WHERE contribution_id=? AND city_code=? AND generation_id=?`,
      [projection.toVisibility, projection.eventId, projection.moderationVersion,
        projection.toVisibility, projection.toVisibility, contribution.contribution_id,
        projection.cityCode, generationId],
    );
    await this.insertReceipt(connection, generationId, projection, "applied");
    await this.updateWatermark(connection, projection.cityCode, generationId, projection.eventId);
    return "applied";
  }

  private async applyAggregateDelta(
    connection: PoolConnection,
    input: { cityCode: CityCode; generationId: string; workerId: string;
      rating: number; delta: 1 | -1; watermark: string },
  ): Promise<void> {
    const column = ratingColumn(input.rating);
    if (input.delta === 1) {
      await connection.query(
        `INSERT INTO reputation_worker_aggregates
          (city_code,generation_id,worker_id,rating_count,rating_sum,${column},
           formula_revision,source_watermark,row_version)
         VALUES (?,?,?,?,?,1,?,?,1)
         ON DUPLICATE KEY UPDATE rating_count=rating_count+1,rating_sum=rating_sum+VALUES(rating_sum),
           ${column}=${column}+1,source_watermark=VALUES(source_watermark),row_version=row_version+1`,
        [input.cityCode, input.generationId, input.workerId, 1, input.rating,
          REPUTATION_FORMULA_REVISION, input.watermark],
      );
      return;
    }
    const [result] = await connection.query<import("mysql2/promise").ResultSetHeader>(
      `UPDATE reputation_worker_aggregates
          SET rating_count=rating_count-1,rating_sum=rating_sum-?,${column}=${column}-1,
              source_watermark=?,row_version=row_version+1
        WHERE city_code=? AND generation_id=? AND worker_id=?
          AND rating_count>0 AND rating_sum>=? AND ${column}>0`,
      [input.rating, input.watermark, input.cityCode, input.generationId,
        input.workerId, input.rating],
    );
    if (result.affectedRows !== 1) {
      throw new ReputationProjectionConflictError("reputation aggregate decrement would underflow");
    }
  }

  private async insertReceipt(
    connection: PoolConnection,
    generationId: string,
    projection: ReputationProjection,
    result: "applied" | "reused",
  ): Promise<void> {
    await connection.query(
      `INSERT INTO reputation_projection_receipts
        (receipt_id,city_code,generation_id,subscriber_id,event_id,review_id,
         event_major_version,payload_hash,result)
       VALUES (?,?,?,?,?,?,1,?,?)`,
      [id("rpr"), projection.cityCode, generationId, projection.subscriberId,
        projection.eventId, projection.reviewId, projection.payloadHash, result],
    );
  }

  private async updateWatermark(
    connection: PoolConnection,
    cityCode: CityCode,
    generationId: string,
    watermark: string,
  ): Promise<void> {
    await connection.query(
      `UPDATE reputation_projection_generations
          SET source_watermark=?,source_row_count=source_row_count+1,
              visible_row_count=(SELECT COUNT(*) FROM reputation_review_contributions
                WHERE city_code=? AND generation_id=? AND visibility='visible')
        WHERE city_code=? AND generation_id=?`,
      [watermark, cityCode, generationId, cityCode, generationId],
    );
  }

  async dryRunRebuild(cityCode: CityCode): Promise<{
    sourceRowCount: number; visibleRowCount: number; dryRunHash: string;
  }> {
    const [rows] = await this.pool.query<(RowDataPacket & {
      review_id: string; worker_id: string; rating: number; visibility: string;
      moderation_version: number;
    })[]>(
      `SELECT r.review_id,r.worker_id,r.rating,v.visibility,v.moderation_version
         FROM order_reviews r
         INNER JOIN review_visibility_states v
           ON v.city_code=r.city_code AND v.review_id=r.review_id
        WHERE r.city_code=? ORDER BY r.review_id ASC`,
      [cityCode],
    );
    const canonical = rows.map((row) => [row.review_id, row.worker_id, Number(row.rating),
      row.visibility, Number(row.moderation_version)].join("|")).join("\n");
    return {
      sourceRowCount: rows.length,
      visibleRowCount: rows.filter((row) => row.visibility === "visible").length,
      dryRunHash: createHash("sha256").update(canonical, "utf8").digest("hex"),
    };
  }
}

export const reputationRepository = new ReputationRepository();
