import type { RequestContext } from "@xlb/types";
import type { ReconciliationGapScanQuery, ReconciliationGapScanResponse } from "@xlb/types";
import { reconciliationGapScanRepository } from "./reconciliationGapScanRepository.js";

export class ReconciliationGapScanError extends Error {
  constructor(message: string) { super(message); this.name = "ReconciliationGapScanError"; }
}

export class ReconciliationGapScanService {
  async scanGaps(context: RequestContext, query: ReconciliationGapScanQuery): Promise<ReconciliationGapScanResponse> {
    if (!context.cityCode) throw new ReconciliationGapScanError("cityCode is required");
    return reconciliationGapScanRepository.scanGaps(context, query);
  }
}

export const reconciliationGapScanService = new ReconciliationGapScanService();
