import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  FulfillmentCustomerConfirmation,
  FulfillmentEvidence,
  FulfillmentEvidenceAggregate,
  MediaAsset,
  ObjectStorageProviderEnvelope,
} from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";
import { buildCityScopedWhere } from "../../dal/scopedExecutor.js";

type MediaRow = RowDataPacket & {
  media_asset_id: string; city_code: string; order_id: string; fulfillment_id: string; complaint_id: string | null;
  uploaded_by_type: "worker"; uploaded_by_id: string; original_file_name: string;
  content_type: "image/jpeg" | "image/png" | "image/webp"; size_bytes: number; checksum_sha256: string;
  signature_validated: number; security_scan_status: "not_malware_scanned_local";
  storage_provider: "local" | "mock"; storage_provider_name: "xlb-local-filesystem" | "xlb-memory-mock";
  storage_provider_status: "stored_local" | "stored_mock"; external_provider_executed: number;
  object_key: string; storage_uri: string; public_url: null; stored_at: Date; created_at: Date;
};

type EvidenceRow = MediaRow & {
  evidence_id: string; evidence_type: FulfillmentEvidence["evidenceType"]; note: string | null;
  captured_at: Date; created_by_worker_id: string; evidence_created_at: Date;
};

type ConfirmationRow = RowDataPacket & {
  confirmation_id: string; city_code: string; fulfillment_id: string; order_id: string; customer_id: string;
  status: FulfillmentCustomerConfirmation["status"]; complaint_id: string | null; customer_note: string | null;
  evidence_snapshot_json: string | Array<Record<string, unknown>>; confirmed_at: Date | null; disputed_at: Date | null;
  created_at: Date; updated_at: Date;
};

const MEDIA_SELECT = `
  ma.media_asset_id, ma.city_code, ma.order_id, ma.fulfillment_id, ma.complaint_id,
  ma.uploaded_by_type, ma.uploaded_by_id, ma.original_file_name, ma.content_type,
  ma.size_bytes, ma.checksum_sha256, ma.signature_validated, ma.security_scan_status,
  ma.storage_provider, ma.storage_provider_name, ma.storage_provider_status,
  ma.external_provider_executed, ma.object_key, ma.storage_uri, ma.public_url,
  ma.stored_at, ma.created_at`;

function mapMedia(row: MediaRow): MediaAsset {
  const storage: ObjectStorageProviderEnvelope = {
    provider: row.storage_provider,
    providerName: row.storage_provider_name,
    providerStatus: row.storage_provider_status,
    externalProviderExecuted: false,
    objectKey: row.object_key,
    storageUri: row.storage_uri,
    publicUrl: null,
    checksumSha256: row.checksum_sha256,
    sizeBytes: Number(row.size_bytes),
    contentType: row.content_type,
    storedAt: row.stored_at.toISOString(),
  };
  return {
    mediaAssetId: row.media_asset_id,
    cityCode: row.city_code as CityCode,
    orderId: row.order_id,
    fulfillmentId: row.fulfillment_id,
    complaintId: row.complaint_id,
    uploadedByType: "worker",
    uploadedById: row.uploaded_by_id,
    originalFileName: row.original_file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    checksumSha256: row.checksum_sha256,
    signatureValidated: true,
    securityScanStatus: "not_malware_scanned_local",
    storage,
    createdAt: row.created_at.toISOString(),
  };
}

function mapEvidence(row: EvidenceRow): FulfillmentEvidence {
  return {
    evidenceId: row.evidence_id,
    cityCode: row.city_code as CityCode,
    fulfillmentId: row.fulfillment_id,
    orderId: row.order_id,
    complaintId: row.complaint_id,
    mediaAssetId: row.media_asset_id,
    evidenceType: row.evidence_type,
    note: row.note,
    capturedAt: row.captured_at.toISOString(),
    createdByWorkerId: row.created_by_worker_id,
    createdAt: row.evidence_created_at.toISOString(),
    mediaAsset: mapMedia(row),
  };
}

function parseSnapshot(value: ConfirmationRow["evidence_snapshot_json"]): FulfillmentCustomerConfirmation["evidenceSnapshot"] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed as FulfillmentCustomerConfirmation["evidenceSnapshot"] : [];
}

function mapConfirmation(row: ConfirmationRow): FulfillmentCustomerConfirmation {
  return {
    confirmationId: row.confirmation_id,
    cityCode: row.city_code as CityCode,
    fulfillmentId: row.fulfillment_id,
    orderId: row.order_id,
    customerId: row.customer_id,
    status: row.status,
    complaintId: row.complaint_id,
    customerNote: row.customer_note,
    evidenceSnapshot: parseSnapshot(row.evidence_snapshot_json),
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
    disputedAt: row.disputed_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class FulfillmentEvidenceRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async insertMediaAsset(connection: PoolConnection, input: {
    mediaAssetId: string; cityCode: CityCode; orderId: string; fulfillmentId: string; complaintId: string | null;
    workerId: string; originalFileName: string; envelope: ObjectStorageProviderEnvelope;
  }): Promise<void> {
    const e = input.envelope;
    await connection.query(
      `INSERT INTO media_assets (
         media_asset_id, city_code, order_id, fulfillment_id, complaint_id,
         uploaded_by_type, uploaded_by_id, original_file_name, content_type,
         size_bytes, checksum_sha256, signature_validated, security_scan_status,
         storage_provider, storage_provider_name, storage_provider_status,
         external_provider_executed, object_key, storage_uri, public_url, stored_at
       ) VALUES (?, ?, ?, ?, ?, 'worker', ?, ?, ?, ?, ?, 1, 'not_malware_scanned_local', ?, ?, ?, 0, ?, ?, NULL, ?)`,
      [input.mediaAssetId,input.cityCode,input.orderId,input.fulfillmentId,input.complaintId,input.workerId,
       input.originalFileName,e.contentType,e.sizeBytes,e.checksumSha256,e.provider,e.providerName,
       e.providerStatus,e.objectKey,e.storageUri,new Date(e.storedAt)],
    );
  }

  async insertEvidence(connection: PoolConnection, input: {
    evidenceId: string; cityCode: CityCode; fulfillmentId: string; orderId: string; complaintId: string | null;
    mediaAssetId: string; evidenceType: FulfillmentEvidence["evidenceType"]; note: string | null;
    capturedAt: Date; workerId: string;
  }): Promise<void> {
    await connection.query(
      `INSERT INTO fulfillment_evidence (
         evidence_id, city_code, fulfillment_id, order_id, complaint_id, media_asset_id,
         evidence_type, note, captured_at, created_by_worker_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [input.evidenceId,input.cityCode,input.fulfillmentId,input.orderId,input.complaintId,input.mediaAssetId,
       input.evidenceType,input.note,input.capturedAt,input.workerId],
    );
  }

  async listEvidence(cityCode: CityCode, fulfillmentId: string): Promise<FulfillmentEvidence[]> {
    const where = buildCityScopedWhere(cityCode, "fe.city_code");
    const [rows] = await this.pool.query<EvidenceRow[]>(
      `SELECT fe.evidence_id, fe.evidence_type, fe.note, fe.captured_at,
              fe.created_by_worker_id, fe.created_at AS evidence_created_at, ${MEDIA_SELECT}
       FROM fulfillment_evidence fe
       INNER JOIN media_assets ma ON ma.media_asset_id=fe.media_asset_id AND ma.city_code=fe.city_code
       WHERE ${where.clause} AND fe.fulfillment_id=?
       ORDER BY fe.captured_at ASC, fe.created_at ASC`,
      [...where.params, fulfillmentId],
    );
    return rows.map(mapEvidence);
  }

  async findMediaAsset(cityCode: CityCode, mediaAssetId: string): Promise<MediaAsset | null> {
    const where = buildCityScopedWhere(cityCode, "ma.city_code");
    const [rows] = await this.pool.query<MediaRow[]>(
      `SELECT ${MEDIA_SELECT} FROM media_assets ma WHERE ${where.clause} AND ma.media_asset_id=? LIMIT 1`,
      [...where.params, mediaAssetId],
    );
    return rows[0] ? mapMedia(rows[0]) : null;
  }

  async findMediaAccess(cityCode: CityCode, mediaAssetId: string): Promise<{ customerId: string; workerId: string } | null> {
    const [rows] = await this.pool.query<(RowDataPacket & {customer_id:string;worker_id:string})[]>(
      `SELECT o.customer_id, f.worker_id FROM media_assets ma
       INNER JOIN orders o ON o.order_id=ma.order_id AND o.city_code=ma.city_code
       INNER JOIN fulfillments f ON f.fulfillment_id=ma.fulfillment_id AND f.city_code=ma.city_code
       WHERE ma.city_code=? AND ma.media_asset_id=? LIMIT 1`, [cityCode, mediaAssetId],
    );
    return rows[0] ? { customerId: rows[0].customer_id, workerId: rows[0].worker_id } : null;
  }

  async findConfirmation(cityCode: CityCode, fulfillmentId: string): Promise<FulfillmentCustomerConfirmation | null> {
    const [rows] = await this.pool.query<ConfirmationRow[]>(
      `SELECT * FROM fulfillment_customer_confirmations WHERE city_code=? AND fulfillment_id=? LIMIT 1`,
      [cityCode, fulfillmentId],
    );
    return rows[0] ? mapConfirmation(rows[0]) : null;
  }

  async findConfirmationForUpdate(connection: PoolConnection, cityCode: CityCode, fulfillmentId: string): Promise<FulfillmentCustomerConfirmation | null> {
    const [rows] = await connection.query<ConfirmationRow[]>(
      `SELECT * FROM fulfillment_customer_confirmations WHERE city_code=? AND fulfillment_id=? LIMIT 1 FOR UPDATE`,
      [cityCode, fulfillmentId],
    );
    return rows[0] ? mapConfirmation(rows[0]) : null;
  }

  private async buildSnapshot(connection: PoolConnection, cityCode: CityCode, fulfillmentId: string) {
    const [rows] = await connection.query<(RowDataPacket & {
      evidence_id:string;media_asset_id:string;evidence_type:FulfillmentEvidence["evidenceType"];checksum_sha256:string;captured_at:Date;
    })[]>(
      `SELECT fe.evidence_id, fe.media_asset_id, fe.evidence_type, ma.checksum_sha256, fe.captured_at
       FROM fulfillment_evidence fe INNER JOIN media_assets ma
         ON ma.media_asset_id=fe.media_asset_id AND ma.city_code=fe.city_code
       WHERE fe.city_code=? AND fe.fulfillment_id=? ORDER BY fe.captured_at, fe.created_at`,
      [cityCode, fulfillmentId],
    );
    return rows.map((row)=>({evidenceId:row.evidence_id,mediaAssetId:row.media_asset_id,evidenceType:row.evidence_type,
      checksumSha256:row.checksum_sha256,capturedAt:row.captured_at.toISOString()}));
  }

  async ensurePendingConfirmation(connection: PoolConnection, input: {
    confirmationId: string; cityCode: CityCode; fulfillmentId: string; orderId: string;
  }): Promise<{ confirmationId: string; created: boolean }> {
    const snapshot = await this.buildSnapshot(connection,input.cityCode,input.fulfillmentId);
    const [existing] = await connection.query<(RowDataPacket & {confirmation_id:string})[]>(
      `SELECT confirmation_id FROM fulfillment_customer_confirmations WHERE city_code=? AND fulfillment_id=? LIMIT 1 FOR UPDATE`,
      [input.cityCode,input.fulfillmentId],
    );
    if (existing[0]) {
      await connection.query(
        `UPDATE fulfillment_customer_confirmations SET evidence_snapshot_json=?
         WHERE city_code=? AND fulfillment_id=? AND status='pending'`,
        [JSON.stringify(snapshot),input.cityCode,input.fulfillmentId],
      );
      return { confirmationId: existing[0].confirmation_id, created: false };
    }
    const [result] = await connection.query(
      `INSERT INTO fulfillment_customer_confirmations (
         confirmation_id,city_code,fulfillment_id,order_id,customer_id,status,evidence_snapshot_json
       ) SELECT ?,?,?,?,o.customer_id,'pending',? FROM orders o
         WHERE o.city_code=? AND o.order_id=?`,
      [input.confirmationId,input.cityCode,input.fulfillmentId,input.orderId,JSON.stringify(snapshot),input.cityCode,input.orderId],
    );
    if ((result as {affectedRows:number}).affectedRows!==1) throw new Error("failed to create customer confirmation from scoped order");
    return { confirmationId: input.confirmationId, created: true };
  }

  async refreshPendingSnapshot(connection: PoolConnection, cityCode: CityCode, fulfillmentId: string): Promise<void> {
    const snapshot = await this.buildSnapshot(connection,cityCode,fulfillmentId);
    await connection.query(
      `UPDATE fulfillment_customer_confirmations SET evidence_snapshot_json=?
       WHERE city_code=? AND fulfillment_id=? AND status='pending'`,
      [JSON.stringify(snapshot),cityCode,fulfillmentId],
    );
  }

  async decideConfirmation(connection: PoolConnection, input: {
    cityCode: CityCode; fulfillmentId: string; status: "confirmed"|"disputed"; complaintId: string|null; note:string|null; at:Date;
  }): Promise<void> {
    const [result] = await connection.query(
      `UPDATE fulfillment_customer_confirmations SET status=?,complaint_id=?,customer_note=?,
         confirmed_at=?,disputed_at=? WHERE city_code=? AND fulfillment_id=? AND status='pending'`,
      [input.status,input.complaintId,input.note,input.status==="confirmed"?input.at:null,input.status==="disputed"?input.at:null,
       input.cityCode,input.fulfillmentId],
    );
    if ((result as {affectedRows:number}).affectedRows!==1) throw new Error("customer confirmation update lost its scoped state lock");
  }

  async listAggregatesForOrder(cityCode: CityCode, orderId: string, customerId?: string): Promise<FulfillmentEvidenceAggregate[]> {
    const params: unknown[]=[cityCode,orderId];
    const customerClause=customerId ? " AND o.customer_id=?" : "";
    if(customerId)params.push(customerId);
    const [rows]=await this.pool.query<(RowDataPacket & {fulfillment_id:string;status:string})[]>(
      `SELECT f.fulfillment_id,f.status FROM fulfillments f INNER JOIN orders o
         ON o.order_id=f.order_id AND o.city_code=f.city_code
       WHERE f.city_code=? AND f.order_id=?${customerClause} ORDER BY f.created_at DESC`,params,
    );
    const aggregates:FulfillmentEvidenceAggregate[]=[];
    for(const row of rows){aggregates.push({fulfillmentId:row.fulfillment_id,orderId,cityCode,fulfillmentStatus:row.status,
      evidence:await this.listEvidence(cityCode,row.fulfillment_id),confirmation:await this.findConfirmation(cityCode,row.fulfillment_id)});}
    return aggregates;
  }
}

export const fulfillmentEvidenceRepository = new FulfillmentEvidenceRepository();
