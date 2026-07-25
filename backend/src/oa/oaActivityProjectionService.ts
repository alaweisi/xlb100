import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { stableHash } from "@xlb/shared/deterministic/stableHash.js";
import type { CityCode } from "@xlb/types";
import { withTransaction } from "../dal/transaction.js";

type ActivityCandidateRow = RowDataPacket & {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  city_code: CityCode;
  payload_json: unknown;
  created_at: Date | string;
  organization_id: string;
};

function sourceDomain(eventType: string): string {
  const separator = eventType.indexOf(".");
  return (separator > 0 ? eventType.slice(0, separator) : eventType).slice(0, 64);
}

function summarize(row: ActivityCandidateRow): string {
  return `${row.event_type} · ${row.aggregate_type} ${row.aggregate_id}`.slice(0, 500);
}

/**
 * Prospective, non-consuming projection for the OA branch activity feed.
 * It never leases or mutates event_outbox, so existing domain consumers retain
 * their delivery semantics. Raw event payloads are deliberately not copied.
 */
export class OaActivityProjectionService {
  async runOnce(cityCode: CityCode, limit = 100): Promise<{ processed: number }> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    return withTransaction(async (connection) => {
    const [rows] = await connection.query<ActivityCandidateRow[]>(
      `SELECT
         e.event_id, e.event_type, e.aggregate_type, e.aggregate_id,
         e.city_code, e.payload_json, e.created_at, branch.organization_id
       FROM event_outbox e
       INNER JOIN oa_organization_city_assignments branch
         ON branch.city_code = e.city_code
        AND branch.status = 'active'
        AND branch.valid_from <= CURRENT_TIMESTAMP(3)
        AND (branch.valid_to IS NULL OR branch.valid_to > CURRENT_TIMESTAMP(3))
       INNER JOIN oa_organizations organization
         ON organization.organization_id = branch.organization_id
        AND organization.organization_type = 'branch'
        AND organization.status = 'active'
       LEFT JOIN oa_activity_projection_cursors projection_cursor
         ON projection_cursor.organization_id = branch.organization_id
        AND projection_cursor.city_code = branch.city_code
       LEFT JOIN oa_activity_projection activity
         ON activity.organization_id = branch.organization_id
        AND activity.city_code = e.city_code
        AND activity.source_event_id = e.event_id
       WHERE e.city_code = ?
         AND activity.source_event_id IS NULL
         AND (
           (
             projection_cursor.organization_id IS NULL
             AND e.created_at >= CURRENT_TIMESTAMP(3) - INTERVAL 5 MINUTE
           )
           OR (
             projection_cursor.organization_id IS NOT NULL
             AND e.created_at >= projection_cursor.last_created_at - INTERVAL 5 MINUTE
           )
         )
       ORDER BY e.created_at, e.event_id
       LIMIT ?`,
      [cityCode, boundedLimit],
    );

    if (rows.length === 0) return { processed: 0 };
    const values = rows.flatMap((row) => [
      stableHash(`oa-activity:${row.organization_id}:${row.city_code}:${row.event_id}`),
      row.event_id,
      row.organization_id,
      row.city_code,
      sourceDomain(row.event_type),
      row.event_type,
      summarize(row),
      row.created_at,
      stableHash(row.payload_json),
    ]);
    const valuePlaceholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT IGNORE INTO oa_activity_projection (
         activity_id, source_event_id, organization_id, city_code, source_domain,
         event_type, summary, occurred_at, payload_hash
       ) VALUES ${valuePlaceholders}`,
      values,
    );
    const latestByOrganization = new Map<string, ActivityCandidateRow>();
    for (const row of rows) {
      const previous = latestByOrganization.get(row.organization_id);
      if (
        !previous ||
        new Date(row.created_at).getTime() > new Date(previous.created_at).getTime() ||
        (new Date(row.created_at).getTime() === new Date(previous.created_at).getTime() &&
          row.event_id > previous.event_id)
      ) {
        latestByOrganization.set(row.organization_id, row);
      }
    }
    for (const row of latestByOrganization.values()) {
      await connection.query(
        `INSERT INTO oa_activity_projection_cursors (
           organization_id, city_code, last_created_at, last_event_id
         ) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           last_event_id = IF(
             VALUES(last_created_at) > last_created_at
             OR (VALUES(last_created_at) = last_created_at AND VALUES(last_event_id) > last_event_id),
             VALUES(last_event_id),
             last_event_id
           ),
           last_created_at = GREATEST(last_created_at, VALUES(last_created_at))`,
        [row.organization_id, row.city_code, row.created_at, row.event_id],
      );
    }
    return { processed: result.affectedRows };
    });
  }
}

export const oaActivityProjectionService = new OaActivityProjectionService();
