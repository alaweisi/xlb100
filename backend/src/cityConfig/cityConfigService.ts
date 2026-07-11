import type { CityConfigSnapshot, CityConfigUpdate } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { assertAdminCanAccessCity } from "../dal/adminQueryGuard.js";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { isAdminScopedRole } from "../city/cityScopeResolver.js";
import {
  cityConfigRepository,
  CityConfigRepository,
} from "./cityConfigRepository.js";
import { buildCityConfigSnapshot, isCityOpen } from "./cityConfigSnapshot.js";

export class CityConfigNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(cityCode: string) {
    super(`City config not found for city_code: ${cityCode}`);
    this.name = "CityConfigNotFoundError";
  }
}

export class CityConfigVersionConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "CITY_CONFIG_VERSION_CONFLICT";

  constructor(
    readonly cityCode: string,
    readonly expectedVersion: number,
    readonly currentVersion: number,
  ) {
    super(
      `City config version conflict for city_code ${cityCode}: expected version ${expectedVersion}, current version ${currentVersion}`,
    );
    this.name = "CityConfigVersionConflictError";
  }
}

export class CityConfigService {
  constructor(
    private readonly repository: CityConfigRepository = cityConfigRepository,
  ) {}

  async getCurrentConfig(context: RequestContext): Promise<CityConfigSnapshot> {
    return executeCityScoped(context, async (cityCode) => {
      const config = await this.repository.findByCityCode(context, cityCode);
      if (!config) {
        throw new CityConfigNotFoundError(cityCode);
      }

      // City availability and pricing switches are correctness-critical. A
      // process-local TTL cache cannot be invalidated by another backend
      // instance, so authoritative reads stay on MySQL until a shared,
      // version-aware cache is introduced.
      return buildCityConfigSnapshot(config);
    });
  }

  async isCityOpen(context: RequestContext): Promise<boolean> {
    const config = await this.getCurrentConfig(context);
    return isCityOpen(config);
  }

  /** Admin write — requires city_scope via AdminQueryGuard */
  async updateConfig(
    context: RequestContext,
    patch: CityConfigUpdate,
  ): Promise<CityConfigSnapshot> {
    if (!isAdminScopedRole(context.role)) {
      throw new CityConfigWriteForbiddenError("Admin role required");
    }
    if (!context.cityCode) {
      throw new CityConfigWriteForbiddenError("city_code required");
    }
    if (!context.userId) {
      throw new CityConfigWriteForbiddenError("Admin userId required");
    }

    await assertAdminCanAccessCity(context, context.cityCode);

    const updated = await this.repository.updateConfig(context, patch);
    if (!updated) {
      const current = await this.repository.findByCityCode(context, context.cityCode);
      if (!current) {
        throw new CityConfigNotFoundError(context.cityCode);
      }
      throw new CityConfigVersionConflictError(
        context.cityCode,
        patch.expectedVersion,
        current.version,
      );
    }

    return updated;
  }
}

export class CityConfigWriteForbiddenError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "CityConfigWriteForbiddenError";
  }
}

export const cityConfigService = new CityConfigService();
