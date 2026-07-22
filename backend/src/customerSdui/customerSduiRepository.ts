import type {
  CustomerSduiKillSwitchState,
  CustomerSduiPageId,
  CustomerSduiRevision,
  CustomerSduiRolloutPolicy,
  CustomerSduiScope,
  Role,
} from "@xlb/types";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";

type RevisionRow = RowDataPacket & {
  revision_id: string;
  page_id: CustomerSduiPageId;
  version: number;
  status: CustomerSduiRevision["status"];
  definition_json: unknown;
  scope_json: unknown | null;
  rollout_json: unknown | null;
  effective_at: Date | null;
  expires_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_by: string;
  updated_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  published_by: string | null;
  published_at: Date | null;
  retired_by: string | null;
  retired_at: Date | null;
  retirement_reason: string | null;
};

type KillSwitchRow = RowDataPacket & {
  page_id: CustomerSduiPageId;
  version: number;
  enabled: number | boolean;
  reason: string | null;
  updated_by: string;
  updated_at: Date;
};

type ReplayRow = RowDataPacket & { request_fingerprint: string; response_json: unknown };

export interface CustomerSduiAuditInput {
  auditId: string;
  cityCode: string;
  pageId: CustomerSduiPageId;
  revisionId: string | null;
  action: string;
  actorId: string;
  actorRole: Role;
  reason: string;
  expectedVersion: number | null;
  actualVersion: number;
  contentHashSha256: string | null;
  traceId: string;
}

export interface CustomerSduiReplay {
  requestFingerprint: string;
  response: unknown;
}

export interface CustomerSduiStore {
  findReplay(input: {
    cityCode: string; pageId: CustomerSduiPageId; operation: string; actorId: string; idempotencyHash: string;
  }): Promise<CustomerSduiReplay | null>;
  insertReplay(input: {
    mutationId: string; cityCode: string; pageId: CustomerSduiPageId; operation: string; actorId: string;
    idempotencyHash: string; requestFingerprint: string; response: unknown;
  }): Promise<void>;
  insertRevision(cityCode: string, revision: CustomerSduiRevision, contentHash: string): Promise<void>;
  findRevisionForUpdate(cityCode: string, pageId: CustomerSduiPageId, revisionId: string): Promise<CustomerSduiRevision | null>;
  updateRevision(cityCode: string, revision: CustomerSduiRevision, contentHash: string): Promise<boolean>;
  findPublishedForUpdate(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiRevision | null>;
  getKillSwitchForUpdate(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiKillSwitchState | null>;
  upsertKillSwitch(cityCode: string, state: CustomerSduiKillSwitchState, expectedVersion: number): Promise<boolean>;
  insertAudit(input: CustomerSduiAuditInput): Promise<void>;
}

export interface CustomerSduiRepository {
  transaction<T>(fn: (store: CustomerSduiStore) => Promise<T>): Promise<T>;
  listPublished(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiRevision[]>;
  getKillSwitch(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiKillSwitchState | null>;
}

function asJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function mapRevision(row: RevisionRow): CustomerSduiRevision {
  return {
    revisionId: row.revision_id,
    pageId: row.page_id,
    version: Number(row.version),
    status: row.status,
    definition: asJson<CustomerSduiRevision["definition"]>(row.definition_json),
    publication: row.scope_json === null ? null : {
      scope: asJson<CustomerSduiScope>(row.scope_json),
      rollout: asJson<CustomerSduiRolloutPolicy>(row.rollout_json),
      effectiveAt: toIso(row.effective_at)!,
      expiresAt: toIso(row.expires_at),
    },
    audit: {
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
      updatedBy: row.updated_by,
      updatedAt: row.updated_at.toISOString(),
      reviewedBy: row.reviewed_by,
      reviewedAt: toIso(row.reviewed_at),
      reviewNote: row.review_note,
      publishedBy: row.published_by,
      publishedAt: toIso(row.published_at),
      retiredBy: row.retired_by,
      retiredAt: toIso(row.retired_at),
      retirementReason: row.retirement_reason,
    },
  };
}

function mapKillSwitch(row: KillSwitchRow): CustomerSduiKillSwitchState {
  return {
    pageId: row.page_id,
    version: Number(row.version),
    enabled: Boolean(row.enabled),
    reason: row.reason,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  };
}

const REVISION_SELECT = `SELECT revision_id,page_id,version,status,definition_json,scope_json,rollout_json,
  effective_at,expires_at,created_by,created_at,updated_by,updated_at,reviewed_by,reviewed_at,
  review_note,published_by,published_at,retired_by,retired_at,retirement_reason
  FROM customer_sdui_revisions`;

class MysqlCustomerSduiStore implements CustomerSduiStore {
  constructor(private readonly connection: PoolConnection) {}

  async findReplay(input: {
    cityCode: string; pageId: CustomerSduiPageId; operation: string; actorId: string; idempotencyHash: string;
  }): Promise<CustomerSduiReplay | null> {
    const [rows] = await this.connection.query<ReplayRow[]>(
      `SELECT request_fingerprint,response_json FROM customer_sdui_mutation_records
       WHERE control_city_code=? AND page_id=? AND operation=? AND actor_id=? AND idempotency_key_hash=?
       LIMIT 1 FOR UPDATE`,
      [input.cityCode, input.pageId, input.operation, input.actorId, input.idempotencyHash],
    );
    return rows[0] ? { requestFingerprint: rows[0].request_fingerprint, response: asJson(rows[0].response_json) } : null;
  }

  async insertReplay(input: {
    mutationId: string; cityCode: string; pageId: CustomerSduiPageId; operation: string; actorId: string;
    idempotencyHash: string; requestFingerprint: string; response: unknown;
  }): Promise<void> {
    await this.connection.query(
      `INSERT INTO customer_sdui_mutation_records
       (mutation_id,control_city_code,page_id,operation,actor_id,idempotency_key_hash,request_fingerprint,response_json)
       VALUES (?,?,?,?,?,?,?,?)`,
      [input.mutationId, input.cityCode, input.pageId, input.operation, input.actorId,
        input.idempotencyHash, input.requestFingerprint, JSON.stringify(input.response)],
    );
  }

  async insertRevision(cityCode: string, revision: CustomerSduiRevision, contentHash: string): Promise<void> {
    await this.connection.query(
      `INSERT INTO customer_sdui_revisions
       (revision_id,control_city_code,page_id,manifest_id,status,definition_json,content_hash_sha256,version,
        created_by,created_at,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [revision.revisionId, cityCode, revision.pageId, revision.definition.manifestId, revision.status,
        JSON.stringify(revision.definition), contentHash, revision.version, revision.audit.createdBy,
        new Date(revision.audit.createdAt), revision.audit.updatedBy, new Date(revision.audit.updatedAt)],
    );
  }

  async findRevisionForUpdate(cityCode: string, pageId: CustomerSduiPageId, revisionId: string): Promise<CustomerSduiRevision | null> {
    const [rows] = await this.connection.query<RevisionRow[]>(
      `${REVISION_SELECT} WHERE control_city_code=? AND page_id=? AND revision_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, pageId, revisionId],
    );
    return rows[0] ? mapRevision(rows[0]) : null;
  }

  async updateRevision(cityCode: string, revision: CustomerSduiRevision, contentHash: string): Promise<boolean> {
    const priorVersion = revision.version - 1;
    const [result] = await this.connection.query<ResultSetHeader>(
      `UPDATE customer_sdui_revisions SET status=?,definition_json=?,manifest_id=?,content_hash_sha256=?,
       scope_json=?,rollout_json=?,effective_at=?,expires_at=?,version=?,updated_by=?,updated_at=?,
       reviewed_by=?,reviewed_at=?,review_note=?,published_by=?,published_at=?,retired_by=?,retired_at=?,retirement_reason=?
       WHERE control_city_code=? AND page_id=? AND revision_id=? AND version=?`,
      [revision.status, JSON.stringify(revision.definition), revision.definition.manifestId, contentHash,
        revision.publication ? JSON.stringify(revision.publication.scope) : null,
        revision.publication ? JSON.stringify(revision.publication.rollout) : null,
        revision.publication ? new Date(revision.publication.effectiveAt) : null,
        revision.publication?.expiresAt ? new Date(revision.publication.expiresAt) : null,
        revision.version, revision.audit.updatedBy, new Date(revision.audit.updatedAt), revision.audit.reviewedBy,
        revision.audit.reviewedAt ? new Date(revision.audit.reviewedAt) : null, revision.audit.reviewNote,
        revision.audit.publishedBy, revision.audit.publishedAt ? new Date(revision.audit.publishedAt) : null,
        revision.audit.retiredBy, revision.audit.retiredAt ? new Date(revision.audit.retiredAt) : null,
        revision.audit.retirementReason, cityCode, revision.pageId, revision.revisionId, priorVersion],
    );
    return result.affectedRows === 1;
  }

  async findPublishedForUpdate(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiRevision | null> {
    const [rows] = await this.connection.query<RevisionRow[]>(
      `${REVISION_SELECT} WHERE control_city_code=? AND page_id=? AND status='published'
       ORDER BY effective_at DESC,created_at DESC LIMIT 1 FOR UPDATE`, [cityCode, pageId],
    );
    return rows[0] ? mapRevision(rows[0]) : null;
  }

  async getKillSwitchForUpdate(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiKillSwitchState | null> {
    const [rows] = await this.connection.query<KillSwitchRow[]>(
      `SELECT page_id,version,enabled,reason,updated_by,updated_at FROM customer_sdui_kill_switches
       WHERE control_city_code=? AND page_id=? LIMIT 1 FOR UPDATE`, [cityCode, pageId],
    );
    return rows[0] ? mapKillSwitch(rows[0]) : null;
  }

  async upsertKillSwitch(cityCode: string, state: CustomerSduiKillSwitchState, expectedVersion: number): Promise<boolean> {
    if (expectedVersion === 1) {
      const [result] = await this.connection.query<ResultSetHeader>(
        `INSERT INTO customer_sdui_kill_switches
         (control_city_code,page_id,enabled,reason,version,updated_by,updated_at) VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE enabled=IF(version=VALUES(version)-1,VALUES(enabled),enabled),
           reason=IF(version=VALUES(version)-1,VALUES(reason),reason),version=IF(version=VALUES(version)-1,VALUES(version),version),
           updated_by=IF(version=VALUES(version),VALUES(updated_by),updated_by),updated_at=IF(version=VALUES(version),VALUES(updated_at),updated_at)`,
        [cityCode, state.pageId, state.enabled, state.reason, state.version, state.updatedBy, new Date(state.updatedAt)],
      );
      return result.affectedRows >= 1;
    }
    const [result] = await this.connection.query<ResultSetHeader>(
      `UPDATE customer_sdui_kill_switches SET enabled=?,reason=?,version=?,updated_by=?,updated_at=?
       WHERE control_city_code=? AND page_id=? AND version=?`,
      [state.enabled, state.reason, state.version, state.updatedBy, new Date(state.updatedAt), cityCode, state.pageId, expectedVersion],
    );
    return result.affectedRows === 1;
  }

  async insertAudit(input: CustomerSduiAuditInput): Promise<void> {
    await this.connection.query(
      `INSERT INTO customer_sdui_audit_records
       (audit_id,control_city_code,page_id,revision_id,action,actor_id,actor_role,reason,
        expected_version,actual_version,content_hash_sha256,trace_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [input.auditId, input.cityCode, input.pageId, input.revisionId, input.action, input.actorId,
        input.actorRole, input.reason, input.expectedVersion, input.actualVersion, input.contentHashSha256, input.traceId],
    );
  }
}

export class MysqlCustomerSduiRepository implements CustomerSduiRepository {
  constructor(private readonly pool: Pool = getMysqlPool()) {}

  async transaction<T>(fn: (store: CustomerSduiStore) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(new MysqlCustomerSduiStore(connection));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async listPublished(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiRevision[]> {
    const [rows] = await this.pool.query<RevisionRow[]>(
      `${REVISION_SELECT} WHERE control_city_code=? AND page_id=? AND status='published'
       ORDER BY effective_at DESC,created_at DESC LIMIT 50`, [cityCode, pageId],
    );
    return rows.map(mapRevision);
  }

  async getKillSwitch(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiKillSwitchState | null> {
    const [rows] = await this.pool.query<KillSwitchRow[]>(
      `SELECT page_id,version,enabled,reason,updated_by,updated_at FROM customer_sdui_kill_switches
       WHERE control_city_code=? AND page_id=? LIMIT 1`, [cityCode, pageId],
    );
    return rows[0] ? mapKillSwitch(rows[0]) : null;
  }
}
