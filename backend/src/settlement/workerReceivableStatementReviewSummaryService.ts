import type { RequestContext } from "@xlb/types";
import type {
  WorkerStatementReviewSummaryQuery,
  WorkerStatementReviewSummaryResponse,
} from "@xlb/types";
import { workerReceivableStatementReviewSummaryRepository } from "./workerReceivableStatementReviewSummaryRepository.js";

export class WorkerStatementReviewSummaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerStatementReviewSummaryError";
  }
}

export class WorkerReceivableStatementReviewSummaryService {
  async getReviewSummary(
    context: RequestContext,
    query: WorkerStatementReviewSummaryQuery,
  ): Promise<WorkerStatementReviewSummaryResponse> {
    if (!context.cityCode) {
      throw new WorkerStatementReviewSummaryError("cityCode is required");
    }
    const result = await workerReceivableStatementReviewSummaryRepository.getReviewSummary(
      context,
      query,
    );
    return {
      cityCode: context.cityCode,
      dateFrom: query.dateFrom ?? null,
      dateTo: query.dateTo ?? null,
      overall: result.overall,
      groups: result.groups,
    };
  }
}

export const workerReceivableStatementReviewSummaryService =
  new WorkerReceivableStatementReviewSummaryService();
