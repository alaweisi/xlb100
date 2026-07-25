import type { RowDataPacket } from "mysql2/promise";
import type { OaPrincipal } from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";

type FingerprintRow = RowDataPacket & {
  process_fingerprint: string;
  activity_fingerprint: string;
  notification_fingerprint: string;
};

function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

/**
 * Returns an opaque, scope-safe cursor. The stream never carries business
 * payload; it only tells the browser to refresh through the normal authorized
 * JSON endpoints.
 */
export class OaRealtimeService {
  async fingerprint(principal: OaPrincipal): Promise<string> {
    if (principal.cityCodes.length === 0) return "empty";
    const cityList = placeholders(principal.cityCodes);
    const [rows] = await getMysqlPool().query<FingerprintRow[]>(
      `SELECT
         COALESCE((
           SELECT MAX(CONCAT(
             DATE_FORMAT(process.created_at, '%Y%m%d%H%i%s%f'),
             ':',
             process.event_id
           ))
           FROM oa_process_events process
           WHERE (process.city_code IS NULL OR process.city_code IN (${cityList}))
             AND EXISTS (
               SELECT 1
               FROM oa_organization_closure visible
               WHERE visible.ancestor_organization_id = ?
                 AND visible.descendant_organization_id = process.organization_id
             )
         ), '') AS process_fingerprint,
         COALESCE((
           SELECT MAX(CONCAT(
             DATE_FORMAT(activity.projected_at, '%Y%m%d%H%i%s%f'),
             ':',
             activity.activity_id
           ))
           FROM oa_activity_projection activity
           WHERE activity.city_code IN (${cityList})
             AND EXISTS (
               SELECT 1
               FROM oa_organization_closure visible
               WHERE visible.ancestor_organization_id = ?
                 AND visible.descendant_organization_id = activity.organization_id
             )
         ), '') AS activity_fingerprint,
         COALESCE((
           SELECT MAX(CONCAT(
             DATE_FORMAT(notification.updated_at, '%Y%m%d%H%i%s%f'),
             ':',
             notification.notification_id
           ))
           FROM oa_notifications notification
           WHERE notification.recipient_membership_id = ?
         ), '') AS notification_fingerprint`,
      [
        ...principal.cityCodes,
        principal.organization.organizationId,
        ...principal.cityCodes,
        principal.organization.organizationId,
        principal.membershipId,
      ],
    );
    const row = rows[0];
    return [
      row?.process_fingerprint ?? "",
      row?.activity_fingerprint ?? "",
      row?.notification_fingerprint ?? "",
      principal.authzVersion,
    ].join("|");
  }
}

export const oaRealtimeService = new OaRealtimeService();
