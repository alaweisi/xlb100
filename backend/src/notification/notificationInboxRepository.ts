import { randomUUID } from "node:crypto";
import type {
  NotificationInboxItem,
  NotificationInboxView,
  NotificationRenderParameters,
  NotificationStateMutationResult,
} from "@xlb/types";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import type {
  NotificationInboxCursorPosition,
  NotificationInboxScope,
} from "./notificationInboxPolicy.js";

type InboxRow = RowDataPacket & {
  notification_id: string;
  event_type: NotificationInboxItem["eventType"];
  template_revision_id: string;
  rendered_title: string;
  rendered_body: string;
  render_parameters_json: string | Buffer | NotificationRenderParameters;
  occurred_at: Date | string;
  created_at: Date | string;
  read_at: Date | string | null;
  archived_at: Date | string | null;
  row_version: number;
};

type StateRow = RowDataPacket & {
  state_id: string;
  read_at: Date | string | null;
  archived_at: Date | string | null;
  row_version: number;
  source_event_id: string;
  subscriber_id: string;
};

type ActionRow = RowDataPacket & {
  request_fingerprint: string;
  action_result: "applied" | "already_applied";
  actual_row_version: number;
};

export type NotificationStateAction =
  | { kind: "mark_read" }
  | { kind: "archive"; archived: boolean };

export type NotificationStateRepositoryResult =
  | { kind: "ok"; result: NotificationStateMutationResult }
  | { kind: "not_found" }
  | { kind: "conflict" };

export interface NotificationStateRepositoryCommand {
  scope: NotificationInboxScope;
  notificationId: string;
  expectedRowVersion: number;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  action: NotificationStateAction;
}

function id(): string {
  return `nia_${randomUUID()}`;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function parseRenderParameters(value: InboxRow["render_parameters_json"]): NotificationRenderParameters {
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString("utf8")) as NotificationRenderParameters;
  if (typeof value === "string") return JSON.parse(value) as NotificationRenderParameters;
  return value;
}

function mapInboxRow(row: InboxRow): NotificationInboxItem {
  return {
    notificationId: row.notification_id,
    eventType: row.event_type,
    templateRevisionId: row.template_revision_id,
    title: row.rendered_title,
    body: row.rendered_body,
    reference: parseRenderParameters(row.render_parameters_json),
    occurredAt: iso(row.occurred_at),
    createdAt: iso(row.created_at),
    readAt: nullableIso(row.read_at),
    archivedAt: nullableIso(row.archived_at),
    rowVersion: Number(row.row_version),
  };
}

export class NotificationInboxRepository {
  constructor(private readonly pool: Pool = getMysqlPool()) {}

  async list(
    scope: NotificationInboxScope,
    view: NotificationInboxView,
    limit: number,
    cursor?: NotificationInboxCursorPosition,
  ): Promise<NotificationInboxItem[]> {
    const cursorClause = cursor
      ? "AND (n.created_at<? OR (n.created_at=? AND n.notification_id<?))"
      : "";
    const archiveClause = view === "archive"
      ? "s.archived_at IS NOT NULL"
      : "s.archived_at IS NULL";
    const params: unknown[] = [scope.cityCode, scope.recipientType, scope.recipientId];
    if (cursor) {
      const cursorCreatedAt = new Date(cursor.createdAt);
      params.push(cursorCreatedAt, cursorCreatedAt, cursor.notificationId);
    }
    params.push(limit);
    const [rows] = await this.pool.query<InboxRow[]>(
      `SELECT n.notification_id,n.event_type,n.template_revision_id,n.rendered_title,n.rendered_body,
          n.render_parameters_json,n.occurred_at,n.created_at,s.read_at,s.archived_at,s.row_version
       FROM notification_records n
       INNER JOIN notification_recipient_states s
         ON s.city_code=n.city_code AND s.notification_id=n.notification_id
        AND s.recipient_type=n.recipient_type AND s.recipient_id=n.recipient_id
       WHERE n.city_code=? AND n.recipient_type=? AND n.recipient_id=?
         AND s.hidden_at IS NULL AND ${archiveClause} ${cursorClause}
       ORDER BY n.created_at DESC,n.notification_id DESC
       LIMIT ?`,
      params,
    );
    return rows.map(mapInboxRow);
  }

  async unreadCount(scope: NotificationInboxScope): Promise<number> {
    const [rows] = await this.pool.query<(RowDataPacket & { unread_count: number })[]>(
      `SELECT COUNT(*) AS unread_count
       FROM notification_records n
       INNER JOIN notification_recipient_states s
         ON s.city_code=n.city_code AND s.notification_id=n.notification_id
        AND s.recipient_type=n.recipient_type AND s.recipient_id=n.recipient_id
       WHERE n.city_code=? AND n.recipient_type=? AND n.recipient_id=?
         AND s.read_at IS NULL AND s.archived_at IS NULL AND s.hidden_at IS NULL`,
      [scope.cityCode, scope.recipientType, scope.recipientId],
    );
    return Number(rows[0]?.unread_count ?? 0);
  }

  private async findAction(
    connection: PoolConnection,
    command: NotificationStateRepositoryCommand,
  ): Promise<ActionRow | null> {
    const [rows] = await connection.query<ActionRow[]>(
      `SELECT request_fingerprint,action_result,actual_row_version
       FROM notification_actions
       WHERE city_code=? AND recipient_type_copy=? AND recipient_id_copy=?
         AND idempotency_key_hash=?
       LIMIT 1`,
      [
        command.scope.cityCode,
        command.scope.recipientType,
        command.scope.recipientId,
        command.idempotencyKeyHash,
      ],
    );
    return rows[0] ?? null;
  }

  private replayResult(action: ActionRow | null, requestFingerprint: string): NotificationStateRepositoryResult | null {
    if (!action) return null;
    if (action.request_fingerprint !== requestFingerprint) return { kind: "conflict" };
    return {
      kind: "ok",
      result: {
        outcome: action.action_result,
        rowVersion: Number(action.actual_row_version),
      },
    };
  }

  private async findState(
    connection: PoolConnection,
    command: NotificationStateRepositoryCommand,
  ): Promise<StateRow | null> {
    const [rows] = await connection.query<StateRow[]>(
      `SELECT s.state_id,s.read_at,s.archived_at,s.row_version,
          n.source_event_id,n.subscriber_id
       FROM notification_recipient_states s
       INNER JOIN notification_records n
         ON n.city_code=s.city_code AND n.notification_id=s.notification_id
        AND n.recipient_type=s.recipient_type AND n.recipient_id=s.recipient_id
       WHERE s.city_code=? AND s.notification_id=? AND s.recipient_type=? AND s.recipient_id=?
         AND s.hidden_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [
        command.scope.cityCode,
        command.notificationId,
        command.scope.recipientType,
        command.scope.recipientId,
      ],
    );
    return rows[0] ?? null;
  }

  private async readActionAfterDuplicate(
    command: NotificationStateRepositoryCommand,
  ): Promise<NotificationStateRepositoryResult | null> {
    const connection = await this.pool.getConnection();
    try {
      const action = await this.findAction(connection, command);
      return this.replayResult(action, command.requestFingerprint);
    } finally {
      connection.release();
    }
  }

  async mutateState(command: NotificationStateRepositoryCommand): Promise<NotificationStateRepositoryResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      // The exact recipient-state row is the serialization anchor. Locking it
      // before checking idempotency avoids absent-key gap-lock deadlocks while
      // still making same-notification retries observe the first commit.
      const state = await this.findState(connection, command);
      if (!state) {
        await connection.rollback();
        return { kind: "not_found" };
      }
      const replay = this.replayResult(
        await this.findAction(connection, command),
        command.requestFingerprint,
      );
      if (replay) {
        await connection.commit();
        return replay;
      }
      const currentVersion = Number(state.row_version);
      const noChange = command.action.kind === "mark_read"
        ? state.read_at !== null
        : (state.archived_at !== null) === command.action.archived;
      if (!noChange && currentVersion !== command.expectedRowVersion) {
        await connection.rollback();
        return { kind: "conflict" };
      }
      const actualVersion = noChange ? currentVersion : currentVersion + 1;
      if (!noChange) {
        const sql = command.action.kind === "mark_read"
          ? `UPDATE notification_recipient_states
             SET read_at=CURRENT_TIMESTAMP(3),row_version=row_version+1
             WHERE state_id=? AND city_code=? AND notification_id=?
               AND recipient_type=? AND recipient_id=? AND hidden_at IS NULL AND row_version=?`
          : `UPDATE notification_recipient_states
             SET archived_at=${command.action.archived ? "CURRENT_TIMESTAMP(3)" : "NULL"},row_version=row_version+1
             WHERE state_id=? AND city_code=? AND notification_id=?
               AND recipient_type=? AND recipient_id=? AND hidden_at IS NULL AND row_version=?`;
        const [updated] = await connection.query<ResultSetHeader>(sql, [
          state.state_id,
          command.scope.cityCode,
          command.notificationId,
          command.scope.recipientType,
          command.scope.recipientId,
          currentVersion,
        ]);
        if (updated.affectedRows !== 1) {
          await connection.rollback();
          return { kind: "conflict" };
        }
      }

      const outcome = noChange ? "already_applied" : "applied";
      const reasonCode = command.action.kind === "mark_read"
        ? "RECIPIENT_MARK_READ"
        : command.action.archived
          ? "RECIPIENT_ARCHIVE"
          : "RECIPIENT_ARCHIVE_RESTORE";
      await connection.query(
        `INSERT INTO notification_actions
          (action_id,city_code,notification_id_copy,event_id_copy,subscriber_id_copy,
           recipient_type_copy,recipient_id_copy,action_kind,actor_service_id,reason_code,
           idempotency_key_hash,request_fingerprint,action_result,expected_row_version,
           actual_row_version,trace_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id(),
          command.scope.cityCode,
          command.notificationId,
          state.source_event_id,
          state.subscriber_id,
          command.scope.recipientType,
          command.scope.recipientId,
          noChange ? "state_reused" : "state_changed",
          `recipient:${command.scope.recipientId}`.slice(0, 128),
          reasonCode,
          command.idempotencyKeyHash,
          command.requestFingerprint,
          outcome,
          command.expectedRowVersion,
          actualVersion,
          command.scope.traceId,
        ],
      );
      await connection.commit();
      return { kind: "ok", result: { outcome, rowVersion: actualVersion } };
    } catch (error) {
      await connection.rollback();
      const duplicate = error as { code?: string };
      if (duplicate.code === "ER_DUP_ENTRY") {
        const replay = await this.readActionAfterDuplicate(command);
        if (replay) return replay;
      }
      throw error;
    } finally {
      connection.release();
    }
  }
}

export const notificationInboxRepository = new NotificationInboxRepository();
