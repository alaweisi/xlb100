import type { CityConfigSnapshot } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { assertAdminCanAccessCity } from "../dal/adminQueryGuard.js";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { isAdminScopedRole } from "../city/cityScopeResolver.js";
import {
  cityConfigRepository,
  CityConfigRepository,
} from "./cityConfigRepository.js";
import {
  getCachedCityConfig,
  invalidateCityConfigCache,
  setCachedCityConfig,
} from "./cityConfigCache.js";
import { buildCityConfigSnapshot, isCityOpen } from "./cityConfigSnapshot.js";

export class CityConfigNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(cityCode: string) {
    super(`City config not found for city_code: ${cityCode}`);
    this.name = "CityConfigNotFoundError";
  }
}

export class CityConfigService {
  constructor(
    private readonly repository: CityConfigRepository = cityConfigRepository,
  ) {}

  async getCurrentConfig(context: RequestContext): Promise<CityConfigSnapshot> {
    return executeCityScoped(context, async (cityCode) => {
      const cached = getCachedCityConfig(cityCode);
      if (cached) return cached;

      const config = await this.repository.findByCityCode(context, cityCode);
      if (!config) {
        throw new CityConfigNotFoundError(cityCode);
      }

      const snapshot = buildCityConfigSnapshot(config);
      setCachedCityConfig(snapshot);
      return snapshot;
    });
  }

  async isCityOpen(context: RequestContext): Promise<boolean> {
    const config = await this.getCurrentConfig(context);
    return isCityOpen(config);
  }

  /** Admin write — requires city_scope via AdminQueryGuard */
  async updateConfig(
    context: RequestContext,
    patch: {
      isOpen?: boolean;
      timezone?: string;
      serviceEnabled?: boolean;
      pricingEnabled?: boolean;
    },
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
      throw new CityConfigNotFoundError(context.cityCode);
    }

    invalidateCityConfigCache(context.cityCode);
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
