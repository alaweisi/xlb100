import { ApiClientError } from "@xlb/api-client";

export type CustomerErrorKind =
  | "offline"
  | "unauthorized"
  | "forbidden"
  | "duplicate"
  | "validation"
  | "conflict"
  | "timeout"
  | "unknown";

export interface CustomerErrorViewModel {
  kind: CustomerErrorKind;
  title: string;
  description: string;
  retryable: boolean;
}

function responseMessage(error: ApiClientError): string {
  if (!error.responseBody) return "";
  try {
    const parsed = JSON.parse(error.responseBody) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : "";
  } catch {
    return "";
  }
}

export function toCustomerError(error: unknown, fallback = "操作未完成，请稍后重试"): CustomerErrorViewModel {
  if (error instanceof ApiClientError) {
    if (error.kind === "network") {
      return {
        kind: "offline",
        title: "网络连接不可用",
        description: "请检查网络后重试。已填写的内容仍保留在当前页面。",
        retryable: true,
      };
    }
    if (error.kind === "timeout") {
      return {
        kind: "timeout",
        title: "请求超时",
        description: "服务暂未返回结果，请先查询最新状态，避免重复提交。",
        retryable: true,
      };
    }
    if (error.status === 401) {
      return {
        kind: "unauthorized",
        title: "登录状态已失效",
        description: "请重新登录后继续，当前页面不会展示未经确认的结果。",
        retryable: false,
      };
    }
    if (error.status === 403) {
      return {
        kind: "forbidden",
        title: "无权查看或操作",
        description: "该订单不属于当前账号或当前城市，请核对登录账号与城市。",
        retryable: false,
      };
    }
    if (error.status === 409) {
      const message = responseMessage(error);
      const duplicate = /duplicate|idempot|already|重复|已存在/i.test(message);
      return {
        kind: duplicate ? "duplicate" : "conflict",
        title: duplicate ? "请勿重复提交" : "状态已发生变化",
        description: duplicate
          ? "服务端已处理过相同请求，请查询最新状态。"
          : "页面状态可能已过期，请刷新后再继续。",
        retryable: true,
      };
    }
    if (error.status === 422 || error.status === 400) {
      return {
        kind: "validation",
        title: "提交内容需要调整",
        description: responseMessage(error) || "请检查服务、地址、联系方式与预约时间。",
        retryable: false,
      };
    }
  }

  return {
    kind: "unknown",
    title: "暂时无法确认结果",
    description: error instanceof Error && error.message ? `${fallback}。请查询最新状态后再试。` : fallback,
    retryable: true,
  };
}

export function isUnauthorizedCustomerError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}
