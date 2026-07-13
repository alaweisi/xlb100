import { randomUUID } from "node:crypto";
import type {
  NotificationMaterializationResult,
  NotificationMaterializeCommand,
  PlatformNotificationCompatibilityProjection,
} from "@xlb/types";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";
import {
  notificationCanonicalJson,
  notificationRenderParametersHash,
  notificationSha256,
  notificationTargetFingerprint,
  NotificationProjectionError,
  renderNotificationTemplate,
  type NotificationTemplateContent,
} from "./notificationProjectionPolicy.js";

type ExistingProjectionRow = RowDataPacket & {
  receipt_id: string;
  notification_id: string;
  state_id: string;
  target_fingerprint: string;
  row_version: number;
};

type TemplateRevisionRow = RowDataPacket & {
  template_revision_id: string;
  template_id: string;
  template_key: string;
  revision_label: string;
  locale: string;
  event_type: PlatformNotificationCompatibilityProjection["eventType"];
  recipient_type: PlatformNotificationCompatibilityProjection["recipientType"];
  parameter_names_json: unknown;
  title_pattern: string;
  body_pattern: string;
  content_hash: string;
  pii_level: string;
};

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function parseJson(value: unknown): unknown {
  if (typeof value === "string") return JSON.parse(value);
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString("utf8"));
  return value;
}

function templateContentHash(row: TemplateRevisionRow, parameterNames: string[]): string {
  return notificationSha256(notificationCanonicalJson({
    templateId: row.template_id,
    templateKey: row.template_key,
    revisionLabel: row.revision_label,
    locale: row.locale,
    eventType: row.event_type,
    recipientType: row.recipient_type,
    parameterNames,
    titleTemplate: row.title_pattern,
    bodyTemplate: row.body_pattern,
    piiLevel: row.pii_level,
  }));
}

export class NotificationRepository {
  constructor(private readonly pool: Pool = getMysqlPool()) {}

  private async findExisting(
    connection: PoolConnection,
    projection: PlatformNotificationCompatibilityProjection,
  ): Promise<ExistingProjectionRow | null> {
    const [rows] = await connection.query<ExistingProjectionRow[]>(
      `SELECT r.receipt_id,r.notification_id,s.state_id,r.target_fingerprint,s.row_version
       FROM notification_delivery_receipts r
       INNER JOIN notification_recipient_states s
         ON s.city_code=r.city_code AND s.notification_id=r.notification_id
       WHERE r.subscriber_id=? AND r.event_id=?
       LIMIT 1 FOR UPDATE`,
      [projection.subscriberId, projection.eventId],
    );
    return rows[0] ?? null;
  }

  private async requireTemplateRevision(
    connection: PoolConnection,
    projection: PlatformNotificationCompatibilityProjection,
    templateRevisionId: string,
  ): Promise<NotificationTemplateContent> {
    const [rows] = await connection.query<TemplateRevisionRow[]>(
      `SELECT r.template_revision_id,r.template_id,t.template_key,r.revision_label,r.locale,
         t.event_type,t.recipient_type,r.parameter_names_json,r.title_pattern,r.body_pattern,
         r.content_hash,r.pii_level
       FROM notification_template_revisions r
       INNER JOIN notification_templates t
         ON t.city_code=r.city_code AND t.template_id=r.template_id
       WHERE r.template_revision_id=? AND r.city_code=?
         AND t.event_type=? AND t.recipient_type=?
         AND t.status='published' AND r.status='published'
         AND r.locale='zh-CN' AND r.pii_level='P1'
       LIMIT 1`,
      [templateRevisionId, projection.cityCode, projection.eventType, projection.recipientType],
    );
    const row = rows[0];
    if (!row) throw new NotificationProjectionError("TEMPLATE_REVISION_NOT_AVAILABLE");
    const parameterNames = parseJson(row.parameter_names_json);
    if (!Array.isArray(parameterNames) || parameterNames.some((name) => typeof name !== "string")) {
      throw new NotificationProjectionError("TEMPLATE_CONTENT_INVALID");
    }
    const content: NotificationTemplateContent = {
      eventType: row.event_type,
      recipientType: row.recipient_type,
      parameterNames,
      titleTemplate: row.title_pattern,
      bodyTemplate: row.body_pattern,
    };
    const contentHash = templateContentHash(row, parameterNames);
    if (contentHash !== row.content_hash) {
      throw new NotificationProjectionError("TEMPLATE_CONTENT_INVALID");
    }
    return content;
  }

  async materialize(
    command: NotificationMaterializeCommand,
    revalidateClaim: (connection: PoolConnection) => Promise<void>,
  ): Promise<NotificationMaterializationResult> {
    const connection = await this.pool.getConnection();
    const fingerprint = notificationTargetFingerprint(command.projection, command.templateRevisionId);
    try {
      await connection.beginTransaction();
      await revalidateClaim(connection);
      const existing = await this.findExisting(connection, command.projection);
      if (existing) {
        if (existing.target_fingerprint !== fingerprint) {
          throw new NotificationProjectionError("PROJECTION_CONFLICT");
        }
        await connection.commit();
        return {
          outcome: "already_applied",
          notificationId: existing.notification_id,
          receiptId: existing.receipt_id,
          stateId: existing.state_id,
          targetFingerprint: existing.target_fingerprint,
          rowVersion: Number(existing.row_version),
        };
      }

      const template = await this.requireTemplateRevision(
        connection,
        command.projection,
        command.templateRevisionId,
      );
      const rendered = renderNotificationTemplate(command.projection, template);
      const notificationId = id("ntf");
      const receiptId = id("nrc");
      const stateId = id("nst");
      const renderParametersHash = notificationRenderParametersHash(command.projection.renderParameters);

      await connection.query(
        `INSERT INTO notification_records
          (notification_id,city_code,recipient_type,recipient_id,source_event_id,
           subscriber_id,event_type,event_major_version,
           template_revision_id,payload_hash,target_fingerprint,render_parameters_json,
           render_parameters_hash,rendered_title,rendered_body,occurred_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          notificationId,
          command.projection.cityCode,
          command.projection.recipientType,
          command.projection.recipientId,
          command.projection.eventId,
          command.projection.subscriberId,
          command.projection.eventType,
          command.projection.eventMajorVersion,
          command.templateRevisionId,
          command.projection.payloadHash,
          fingerprint,
          notificationCanonicalJson(command.projection.renderParameters),
          renderParametersHash,
          rendered.title,
          rendered.body,
          new Date(command.projection.occurredAt),
        ],
      );
      await connection.query(
        `INSERT INTO notification_delivery_receipts
          (receipt_id,city_code,subscriber_id,event_id,notification_id,
           template_revision_id,source_payload_hash,target_fingerprint,result)
         VALUES (?,?,?,?,?,?,?,?,'applied')`,
        [
          receiptId,
          command.projection.cityCode,
          command.projection.subscriberId,
          command.projection.eventId,
          notificationId,
          command.templateRevisionId,
          command.projection.payloadHash,
          fingerprint,
        ],
      );
      await connection.query(
        `INSERT INTO notification_recipient_states
          (state_id,city_code,notification_id,recipient_type,recipient_id)
         VALUES (?,?,?,?,?)`,
        [
          stateId,
          command.projection.cityCode,
          notificationId,
          command.projection.recipientType,
          command.projection.recipientId,
        ],
      );
      await connection.query(
        `INSERT INTO notification_actions
          (action_id,city_code,notification_id_copy,event_id_copy,subscriber_id_copy,
           recipient_type_copy,recipient_id_copy,
           action_kind,actor_service_id,reason_code,target_fingerprint_copy,
           actual_row_version,trace_id)
         VALUES (?,?,?,?,?,?,?,'projection_committed',?,'CLAIM_SCOPED_PROJECTION',?,1,?)`,
        [
          id("nac"),
          command.projection.cityCode,
          notificationId,
          command.projection.eventId,
          command.projection.subscriberId,
          command.projection.recipientType,
          command.projection.recipientId,
          command.actorServiceId,
          fingerprint,
          id("trace"),
        ],
      );
      await connection.commit();
      return {
        outcome: "applied",
        notificationId,
        receiptId,
        stateId,
        targetFingerprint: fingerprint,
        rowVersion: 1,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export const notificationRepository = new NotificationRepository();
