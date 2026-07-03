import type { CatalogSnapshot } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { executeCityScoped } from "../dal/scopedExecutor.js";
import { catalogRepository, CatalogRepository } from "./catalogRepository.js";

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository = catalogRepository,
  ) {}

  async getCatalog(context: RequestContext): Promise<CatalogSnapshot> {
    return executeCityScoped(context, async (cityCode) => {
      return this.repository.findEnabledCatalog(context, cityCode);
    });
  }
}

export const catalogService = new CatalogService();
