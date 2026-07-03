import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode, WorkerCityBinding, WorkerProfile } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import { buildCityScopedWhere } from "../dal/scopedExecutor.js";

type WorkerProfileRow = RowDataPacket & {
  worker_id: string;
  display_name: string;
  phone_masked: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
};

type WorkerBindingRow = RowDataPacket & {
  worker_id: string;
  city_code: string;
  is_enabled: number;
  created_at: Date;
  updated_at: Date;
};

function mapProfileRow(row: WorkerProfileRow): WorkerProfile {
  return {
    workerId: row.worker_id,
    displayName: row.display_name,
    phoneMasked: row.phone_masked,
    status: row.status as WorkerProfile["status"],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapBindingRow(row: WorkerBindingRow): WorkerCityBinding {
  return {
    workerId: row.worker_id,
    cityCode: row.city_code as CityCode,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class WorkerRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findProfileById(workerId: string): Promise<WorkerProfile | null> {
    const [rows] = await this.pool.query<WorkerProfileRow[]>(
      `SELECT worker_id, display_name, phone_masked, status, created_at, updated_at
       FROM worker_profiles WHERE worker_id = ? LIMIT 1`,
      [workerId],
    );
    return rows[0] ? mapProfileRow(rows[0]) : null;
  }

  async findCityBinding(
    workerId: string,
    cityCode: CityCode,
  ): Promise<WorkerCityBinding | null> {
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<WorkerBindingRow[]>(
      `SELECT worker_id, city_code, is_enabled, created_at, updated_at
       FROM worker_city_bindings
       WHERE worker_id = ? AND ${where.clause} AND is_enabled = 1
       LIMIT 1`,
      [workerId, ...where.params],
    );
    return rows[0] ? mapBindingRow(rows[0]) : null;
  }
}

export const workerRepository = new WorkerRepository();
