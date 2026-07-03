import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  WorkerCertification,
  WorkerCertificationStatus,
} from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";
import { buildCityScopedWhere } from "../../dal/scopedExecutor.js";

type CertificationRow = RowDataPacket & {
  certification_id: string;
  worker_id: string;
  city_code: string;
  cert_type: string;
  cert_name: string;
  status: string;
  submitted_at: Date;
  reviewed_at: Date | null;
  reviewer_id: string | null;
  reject_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapCertificationRow(row: CertificationRow): WorkerCertification {
  return {
    certificationId: row.certification_id,
    workerId: row.worker_id,
    cityCode: row.city_code as CityCode,
    certType: row.cert_type,
    certName: row.cert_name,
    status: row.status as WorkerCertificationStatus,
    submittedAt: row.submitted_at.toISOString(),
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewerId: row.reviewer_id,
    rejectReason: row.reject_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class WorkerCertificationRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async insert(input: {
    certificationId: string;
    workerId: string;
    cityCode: CityCode;
    certType: string;
    certName: string;
  }): Promise<WorkerCertification> {
    await this.pool.query(
      `INSERT INTO worker_certifications (
         certification_id, worker_id, city_code, cert_type, cert_name, status, submitted_at
       ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
      [
        input.certificationId,
        input.workerId,
        input.cityCode,
        input.certType,
        input.certName,
      ],
    );
    const created = await this.findById(input.certificationId, input.cityCode);
    if (!created) {
      throw new Error(`Failed to load certification ${input.certificationId}`);
    }
    return created;
  }

  async findById(
    certificationId: string,
    cityCode: CityCode,
  ): Promise<WorkerCertification | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<CertificationRow[]>(
      `SELECT certification_id, worker_id, city_code, cert_type, cert_name, status,
              submitted_at, reviewed_at, reviewer_id, reject_reason, created_at, updated_at
       FROM worker_certifications
       WHERE certification_id = ? AND ${where.clause}
       LIMIT 1`,
      [certificationId, ...where.params],
    );
    return rows[0] ? mapCertificationRow(rows[0]) : null;
  }

  async updateStatus(
    certificationId: string,
    cityCode: CityCode,
    status: WorkerCertificationStatus,
    reviewerId: string,
    rejectReason?: string | null,
  ): Promise<WorkerCertification | null> {
    await this.pool.query(
      `UPDATE worker_certifications
       SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewer_id = ?, reject_reason = ?
       WHERE certification_id = ? AND city_code = ?`,
      [status, reviewerId, rejectReason ?? null, certificationId, cityCode],
    );
    return this.findById(certificationId, cityCode);
  }

  async listApprovedByWorker(
    workerId: string,
    cityCode: CityCode,
  ): Promise<WorkerCertification[]> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<CertificationRow[]>(
      `SELECT certification_id, worker_id, city_code, cert_type, cert_name, status,
              submitted_at, reviewed_at, reviewer_id, reject_reason, created_at, updated_at
       FROM worker_certifications
       WHERE worker_id = ? AND ${where.clause} AND status = 'approved'`,
      [workerId, ...where.params],
    );
    return rows.map(mapCertificationRow);
  }
}

export const workerCertificationRepository = new WorkerCertificationRepository();
