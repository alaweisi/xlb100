import type { RequestContext } from "@xlb/types";
import type {
  StatementAuditQuery,
  StatementAuditListResponse,
  StatementAuditDetailResponse,
  ExportAuditQuery,
  ExportAuditItem,
} from "@xlb/types";
import { workerReceivableStatementAuditRepository } from "./workerReceivableStatementAuditRepository.js";

export class WorkerReceivableStatementAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerReceivableStatementAuditError";
  }
}

export class WorkerReceivableStatementAuditService {
  async listStatementAudit(
    context: RequestContext,
    query: StatementAuditQuery,
  ): Promise<StatementAuditListResponse> {
    if (!context.cityCode) {
      throw new WorkerReceivableStatementAuditError("cityCode is required for audit query");
    }
    return workerReceivableStatementAuditRepository.listStatementAudit(context, query);
  }

  async getStatementAuditDetail(
    context: RequestContext,
    statementId: string,
  ): Promise<StatementAuditDetailResponse | null> {
    if (!context.cityCode) {
      throw new WorkerReceivableStatementAuditError("cityCode is required for audit detail");
    }
    return workerReceivableStatementAuditRepository.getStatementAuditDetail(
      context,
      statementId,
    );
  }

  async listExportAudit(
    context: RequestContext,
    query: ExportAuditQuery,
  ): Promise<{ items: ExportAuditItem[]; nextCursor: string | null }> {
    if (!context.cityCode) {
      throw new WorkerReceivableStatementAuditError("cityCode is required for export audit query");
    }
    return workerReceivableStatementAuditRepository.listExportAudit(context, query);
  }
}

export const workerReceivableStatementAuditService =
  new WorkerReceivableStatementAuditService();
