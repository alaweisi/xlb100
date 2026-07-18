import { ApiClientError } from "@xlb/api-client";

export type WorkerFeedbackContext = "read" | "mutation";

export function workerApiStatus(error: unknown): number | undefined {
  if (error instanceof ApiClientError) return error.status;
  const match = error instanceof Error ? error.message.match(/\b(400|401|403|404|408|409|425|429|500|502|503|504)\b/) : null;
  return match ? Number(match[1]) : undefined;
}

function apiBodyMessage(error: unknown): string | null {
  if (!(error instanceof ApiClientError) || !error.responseBody) return null;
  try {
    const body = JSON.parse(error.responseBody) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

export function translateWorkerBackendReason(reason: string): string {
  if (/not eligible|qualification/i.test(reason)) return "当前服务资格不满足要求，请查看资格阻断原因。";
  if (/already accepted/i.test(reason)) return "该任务已被承接，请刷新确认最新结果。";
  if (/invalid.*status|transition|expected.*version|conflict/i.test(reason)) return "业务状态已经变化，当前操作不再允许，请刷新确认。";
  if (/not found/i.test(reason)) return "记录不存在或已失效，请返回列表刷新。";
  if (/city|bound|identity required|requires worker/i.test(reason)) return "当前账号没有此工作城市或业务的操作权限。";
  if (/insufficient|available.*amount|exceed/i.test(reason)) return "当前可提现余额不足，请刷新余额后重新填写。";
  if (/timestamp.*stale|future/i.test(reason)) return "位置采集时间已失效，请重新获取当前位置后上报。";
  if (/evidence.*frozen|confirmation is terminal/i.test(reason)) return "顾客已确认或发起争议，证据已冻结。";
  return /[A-Za-z]{4,}/.test(reason) ? "平台未能完成当前操作，请刷新状态后重试。" : reason;
}

export function formatWorkerApiError(error: unknown, fallback: string, context: WorkerFeedbackContext = "read"): string {
  const mutation = context === "mutation";
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (offline) return mutation ? "当前网络已断开，操作结果暂时未知。恢复网络后请先刷新确认，避免重复操作。" : "当前网络已断开，请恢复网络后重试。";
  if (error instanceof ApiClientError && (error.kind === "network" || error.kind === "timeout" || error.kind === "cancelled")) {
    return mutation ? "网络响应中断，操作结果暂时未知。请先刷新确认最新状态，避免重复操作。" : "网络响应失败，请检查连接后重试。";
  }
  const status = workerApiStatus(error);
  if (status === 401) return "登录状态已失效，请重新登录。";
  if (status === 403) return translateWorkerBackendReason(apiBodyMessage(error) ?? "当前账号无权执行此操作。请核对工作城市与账号权限。");
  if (status === 404) return "记录不存在或已失效，请刷新列表。";
  if (status === 409) return translateWorkerBackendReason(apiBodyMessage(error) ?? "业务状态已被其他操作更新，请刷新后再处理。");
  if (status === 429) return "操作过于频繁，请稍后再试。";
  if (status && (status === 408 || status === 425 || status >= 500)) return mutation ? "平台响应异常，操作结果暂时未知。请刷新确认最新状态。" : "平台服务暂时不可用，请稍后重试。";
  return error instanceof Error && !/^API\s/i.test(error.message) ? translateWorkerBackendReason(error.message) : fallback;
}

export function isWorkerUnknownResult(message: string | null | undefined): boolean {
  return Boolean(message?.includes("结果暂时未知"));
}
