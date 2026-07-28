import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  ReviewModerationQueueItem,
  ReviewVisibility,
} from "@xlb/types";
import type { ReviewQueueCursorPosition } from "./reviewQueueCursorPolicy.js";

/**
 * A read-only query surface for the investor-demo moderation queue. Keeping the
 * ownership predicate in this dedicated reader makes it impossible for the
 * demo path to accidentally fall back to a city-wide moderation query.
 */
export class StagingDemoReviewModerationReader {
  async listQueue(
    connection: PoolConnection,
    cityCode: CityCode,
    customerId: string,
    visibility: ReviewVisibility | null,
    limit: number,
    cursor?: ReviewQueueCursorPosition,
  ): Promise<ReviewModerationQueueItem[]> {
    const params: unknown[] = [cityCode, customerId];
    const visibilityFilter = visibility ? " AND v.visibility=?" : "";
    if (visibility) params.push(visibility);
    const cursorFilter = cursor
      ? " AND (r.created_at>? OR (r.created_at=? AND r.review_id>?))"
      : "";
    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      params.push(createdAt, createdAt, cursor.entityId);
    }
    params.push(limit);
    const [rows] = await connection.query<(RowDataPacket & {
      review_id: string;
      city_code: string;
      order_id: string;
      worker_id: string;
      rating: number;
      visibility: ReviewVisibility;
      moderation_version: number;
      visibility_row_version: number;
      created_at: Date;
    })[]>(
      `SELECT r.review_id,r.city_code,r.order_id,r.worker_id,r.rating,
              v.visibility,v.moderation_version,
              v.row_version AS visibility_row_version,r.created_at
         FROM order_reviews r
         INNER JOIN review_visibility_states v
           ON v.city_code=r.city_code AND v.review_id=r.review_id
        WHERE r.city_code=? AND r.customer_id=?${visibilityFilter}${cursorFilter}
        ORDER BY r.created_at ASC,r.review_id ASC LIMIT ?`,
      params,
    );
    return rows.map((row) => ({
      reviewId: row.review_id,
      cityCode: row.city_code as CityCode,
      orderId: row.order_id,
      workerId: row.worker_id,
      rating: Number(row.rating),
      comment: null,
      commentRestricted: true,
      visibility: row.visibility,
      moderationVersion: Number(row.moderation_version),
      visibilityVersion: Number(row.visibility_row_version),
      createdAt: row.created_at.toISOString(),
    }));
  }
}

export const stagingDemoReviewModerationReader =
  new StagingDemoReviewModerationReader();
