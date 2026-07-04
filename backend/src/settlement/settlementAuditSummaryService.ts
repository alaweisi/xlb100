import type { RequestContext } from "@xlb/types";
import type { SettlementAuditSummaryQuery, SettlementAuditSummaryResponse } from "@xlb/types";
import { settlementAuditSummaryRepository } from "./settlementAuditSummaryRepository.js";

export class SettlementAuditSummaryError extends Error {
  constructor(message: string) { super(message); this.name = "SettlementAuditSummaryError"; }
}

export class SettlementAuditSummaryService {
  async getAuditSummary(context: RequestContext, query: SettlementAuditSummaryQuery): Promise<SettlementAuditSummaryResponse> {
    if (!context.cityCode) throw new SettlementAuditSummaryError("cityCode is required");
    return settlementAuditSummaryRepository.getAuditSummary(context, query);
  }
}

export const settlementAuditSummaryService = new SettlementAuditSummaryService();
