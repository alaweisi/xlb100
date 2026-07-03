import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode, ServiceQualificationRule, WorkerQualification } from "@xlb/types";
import { RepositoryBase } from "../../dal/repositoryBase.js";
import { buildCityScopedWhere } from "../../dal/scopedExecutor.js";

type RuleRow = RowDataPacket & {
  rule_id: string;
  city_code: string;
  sku_id: string;
  required_cert_type: string;
  is_required: number;
  is_enabled: number;
  created_at: Date;
  updated_at: Date;
};

type QualificationRow = RowDataPacket & {
  worker_id: string;
  city_code: string;
  sku_id: string;
  is_eligible: number;
  source_certification_id: string | null;
  updated_at: Date;
};

function mapRuleRow(row: RuleRow): ServiceQualificationRule {
  return {
    ruleId: row.rule_id,
    cityCode: row.city_code as CityCode,
    skuId: row.sku_id,
    requiredCertType: row.required_cert_type,
    isRequired: row.is_required === 1,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapQualificationRow(row: QualificationRow): WorkerQualification {
  return {
    workerId: row.worker_id,
    cityCode: row.city_code as CityCode,
    skuId: row.sku_id,
    isEligible: row.is_eligible === 1,
    sourceCertificationId: row.source_certification_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class QualificationRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async listEnabledRulesForSku(
    cityCode: CityCode,
    skuId: string,
  ): Promise<ServiceQualificationRule[]> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<RuleRow[]>(
      `SELECT rule_id, city_code, sku_id, required_cert_type, is_required, is_enabled,
              created_at, updated_at
       FROM service_qualification_rules
       WHERE ${where.clause} AND sku_id = ? AND is_enabled = 1`,
      [...where.params, skuId],
    );
    return rows.map(mapRuleRow);
  }

  async listEnabledRulesForCity(cityCode: CityCode): Promise<ServiceQualificationRule[]> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<RuleRow[]>(
      `SELECT rule_id, city_code, sku_id, required_cert_type, is_required, is_enabled,
              created_at, updated_at
       FROM service_qualification_rules
       WHERE ${where.clause} AND is_enabled = 1`,
      [...where.params],
    );
    return rows.map(mapRuleRow);
  }

  async upsertQualification(input: {
    workerId: string;
    cityCode: CityCode;
    skuId: string;
    isEligible: boolean;
    sourceCertificationId?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO worker_qualifications (
         worker_id, city_code, sku_id, is_eligible, source_certification_id
       ) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_eligible = VALUES(is_eligible),
         source_certification_id = VALUES(source_certification_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        input.workerId,
        input.cityCode,
        input.skuId,
        input.isEligible ? 1 : 0,
        input.sourceCertificationId ?? null,
      ],
    );
  }

  async findQualification(
    workerId: string,
    cityCode: CityCode,
    skuId: string,
  ): Promise<WorkerQualification | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<QualificationRow[]>(
      `SELECT worker_id, city_code, sku_id, is_eligible, source_certification_id, updated_at
       FROM worker_qualifications
       WHERE worker_id = ? AND ${where.clause} AND sku_id = ?
       LIMIT 1`,
      [workerId, ...where.params, skuId],
    );
    return rows[0] ? mapQualificationRow(rows[0]) : null;
  }
}

export const qualificationRepository = new QualificationRepository();
