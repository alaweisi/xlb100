import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode } from "@xlb/types";
import type { CityConfigSnapshot } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
  executeCityScoped,
} from "../dal/scopedExecutor.js";

type CityConfigRow = RowDataPacket & {
  city_code: string;
  version: number;
  is_open: number;
  timezone: string;
  service_enabled: number;
  pricing_enabled: number;
  updated_at: Date;
};

function mapRow(row: CityConfigRow): CityConfigSnapshot {
  return {
    cityCode: row.city_code as CityCode,
    version: row.version,
    isOpen: row.is_open === 1,
    timezone: row.timezone,
    serviceEnabled: row.service_enabled === 1,
    pricingEnabled: row.pricing_enabled === 1,
    updatedAt: row.updated_at.toISOString(),
  };
}

export class CityConfigRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findByCityCode(
    context: RequestContext,
    cityCode: CityCode,
  ): Promise<CityConfigSnapshot | null> {
    this.requireContext(context);
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in repository query");
    }

    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<CityConfigRow[]>(
      `SELECT city_code, version, is_open, timezone, service_enabled, pricing_enabled, updated_at
       FROM city_configs WHERE ${where.clause}`,
      where.params,
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async updateConfig(
    context: RequestContext,
    patch: {
      isOpen?: boolean;
      timezone?: string;
      serviceEnabled?: boolean;
      pricingEnabled?: boolean;
    },
  ): Promise<CityConfigSnapshot | null> {
    return executeCityScoped(context, async (cityCode) => {
      const sets: string[] = ["version = version + 1"];
      const params: unknown[] = [];

      if (patch.isOpen !== undefined) {
        sets.push("is_open = ?");
        params.push(patch.isOpen ? 1 : 0);
      }
      if (patch.timezone !== undefined) {
        sets.push("timezone = ?");
        params.push(patch.timezone);
      }
      if (patch.serviceEnabled !== undefined) {
        sets.push("service_enabled = ?");
        params.push(patch.serviceEnabled ? 1 : 0);
      }
      if (patch.pricingEnabled !== undefined) {
        sets.push("pricing_enabled = ?");
        params.push(patch.pricingEnabled ? 1 : 0);
      }

      const where = buildCityScopedWhere(cityCode);
      params.push(...where.params);

      await this.pool.query(
        `UPDATE city_configs SET ${sets.join(", ")} WHERE ${where.clause}`,
        params,
      );

      return this.findByCityCode(context, cityCode);
    });
  }
}

export const cityConfigRepository = new CityConfigRepository();
