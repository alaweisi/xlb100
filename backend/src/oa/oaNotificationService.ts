import type { RowDataPacket } from "mysql2/promise";
import type { OaNotification, OaPrincipal } from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";
import { OaCollaborationError } from "./oaCollaborationService.js";

type NotificationRow = RowDataPacket & {
  notification_id: string;
  organization_id: string;
  city_code: OaNotification["cityCode"];
  notification_type: string;
  title: string;
  body: string;
  source_type: string;
  source_id: string;
  deep_link: string | null;
  read_at: Date | string | null;
  archived_at: Date | string | null;
  version: number;
  created_at: Date | string;
};

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapNotification(row: NotificationRow): OaNotification {
  return {
    notificationId: row.notification_id,
    organizationId: row.organization_id,
    cityCode: row.city_code,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    sourceType: row.source_type,
    sourceId: row.source_id,
    deepLink: row.deep_link,
    readAt: iso(row.read_at),
    archivedAt: iso(row.archived_at),
    version: row.version,
    createdAt: iso(row.created_at)!,
  };
}

export class OaNotificationService {
  async list(
    principal: OaPrincipal,
    input: { status?: "all" | "unread" | "archived"; limit?: number } = {},
  ): Promise<{ notifications: OaNotification[]; unreadCount: number }> {
    const limit = Math.min(Math.max(Math.trunc(input.limit ?? 50), 1), 100);
    const status = input.status ?? "all";
    const condition = status === "unread"
      ? "archived_at IS NULL AND read_at IS NULL"
      : status === "archived"
        ? "archived_at IS NOT NULL"
        : "archived_at IS NULL";
    const [rows] = await getMysqlPool().query<NotificationRow[]>(
      `SELECT * FROM oa_notifications
       WHERE recipient_membership_id = ? AND ${condition}
       ORDER BY created_at DESC LIMIT ?`,
      [principal.membershipId, limit],
    );
    const [counts] = await getMysqlPool().query<(RowDataPacket & { unread_count: number })[]>(
      `SELECT COUNT(*) AS unread_count FROM oa_notifications
       WHERE recipient_membership_id = ? AND archived_at IS NULL AND read_at IS NULL`,
      [principal.membershipId],
    );
    return { notifications: rows.map(mapNotification), unreadCount: Number(counts[0]?.unread_count ?? 0) };
  }

  async unreadCount(principal: OaPrincipal): Promise<number> {
    return (await this.list(principal, { status: "unread", limit: 1 })).unreadCount;
  }

  async mark(
    principal: OaPrincipal,
    notificationId: string,
    action: "read" | "archive",
  ): Promise<OaNotification> {
    await getMysqlPool().query(
      action === "read"
        ? `UPDATE oa_notifications
           SET version = version + IF(read_at IS NULL, 1, 0),
               read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3))
           WHERE notification_id = ? AND recipient_membership_id = ?`
        : `UPDATE oa_notifications
           SET version = version + IF(archived_at IS NULL, 1, 0),
               archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP(3)),
               read_at = COALESCE(read_at, CURRENT_TIMESTAMP(3))
           WHERE notification_id = ? AND recipient_membership_id = ?`,
      [notificationId, principal.membershipId],
    );
    const [rows] = await getMysqlPool().query<NotificationRow[]>(
      `SELECT * FROM oa_notifications
       WHERE notification_id = ? AND recipient_membership_id = ? LIMIT 1`,
      [notificationId, principal.membershipId],
    );
    if (!rows[0]) throw new OaCollaborationError("OA notification not found", 404);
    return mapNotification(rows[0]);
  }
}

export const oaNotificationService = new OaNotificationService();
