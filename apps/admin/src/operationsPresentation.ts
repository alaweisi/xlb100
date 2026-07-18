import { useEffect, useState } from "react";

export type OperationsTone = "default" | "primary" | "success" | "warning" | "danger" | "muted";

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  queued: "待匹配",
  offering: "邀约中",
  accepted: "已接单",
  reassigning: "重新派单",
  no_match: "暂无匹配",
  manual_review: "人工复核",
  timeout: "已超时",
  failed: "失败",
  completed: "已完成",
  cancelled: "已取消",
  draft: "草稿",
  pending_dispatch: "待派单",
  service_completed: "服务已完成",
  pending_payment: "待支付",
  paid: "已支付",
  approved: "已通过",
  rejected: "已驳回",
  expired: "已过期",
  created: "已创建",
  requested: "已申请",
  in_progress: "进行中",
  started: "已开始",
  triaged: "已分诊",
  waiting_customer: "等待客户",
  closed: "已关闭",
  active: "生效中",
  disabled: "已停用",
  enabled: "已启用",
  fresh: "位置有效",
  stale: "位置已过期",
  success: "成功",
  pending_confirmation: "待确认",
  confirmed: "已确认",
  disputed: "有异议",
  applied: "已应用",
  submitted: "已提交",
  resolved: "已解决",
  processing: "处理中",
  waiting_requester: "等待诉求人",
  escalated: "已升级",
  open: "待处理",
  visible: "公开可见",
  hidden: "已隐藏",
  pending_moderation: "待审核",
  upheld: "申诉成立",
  marked_paid: "已标记付款",
  proposed: "待审批",
  reviewed: "已审核",
  scheduled: "已排期",
  paused: "已暂停",
  ended: "已结束",
  suspended: "已暂停",
  retired: "已退役",
  published: "已发布",
  granted: "已发放",
  available: "可使用",
  released: "已释放",
  revoked: "已撤销",
  delivered: "已送达",
  retry_wait: "等待重试",
  dead_letter: "待人工处理",
  draft_plan: "计划草稿",
  queueing: "排队中",
  transferred: "已转接",
  reply: "自动回复",
  handoff: "转人工",
  provider_not_executed: "未执行服务商操作",
  not_executed: "未执行",
};

const BUSINESS_LABELS: Record<string, string> = {
  customer: "客户",
  worker: "师傅",
  enterprise: "企业客户",
  admin: "运营人员",
  system: "系统",
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
  critical: "严重",
  order_question: "订单咨询",
  order_dispute: "订单争议",
  service_complaint: "服务投诉",
  withdrawal_issue: "提现问题",
  account_issue: "账号问题",
  safety: "安全事件",
  other: "其他",
  mine: "分配给我",
  skill_group: "技能组待领取",
  all: "城市全量",
  cancel: "取消订单",
  reschedule: "改约",
  reassign: "改派",
  explanation: "解释说明",
  repair: "返工处理",
  refund: "退款意图",
  service_credit: "服务补偿",
  no_fault: "无责",
  worker_fault: "师傅责任",
  platform_fault: "平台责任",
  customer_fault: "客户责任",
  shared_fault: "共同责任",
  single: "单笔结算",
  monthly: "月结",
  operator: "运营人员",
  auditor: "审计人员",
  internal: "仅内部可见",
  deterministic: "本地确定性规则",
};

const EVENT_LABELS: Record<string, string> = {
  created: "任务创建",
  queued: "进入队列",
  offering: "发起邀约",
  offer_created: "生成候选邀约",
  accepted: "师傅接单",
  rejected: "师傅拒绝",
  timeout: "邀约超时",
  reassigning: "重新派单",
  no_match: "暂无匹配",
  manual_review: "转人工复核",
  failed: "派单失败",
  completed: "派单完成",
  cancelled: "派单取消",
};

const REASON_LABELS: Record<string, string> = {
  no_candidate: "当前没有符合范围与资质要求的候选师傅",
  no_match: "本轮未找到可用候选师傅",
  offer_timeout: "候选邀约已超时",
  timeout: "处理已超时",
  worker_rejected: "候选师傅已拒绝邀约",
  worker_busy: "候选师傅当前不可接单",
  stale_location: "候选师傅位置已过期",
  out_of_service_radius: "超出候选师傅服务半径",
  manual_review: "任务需要人工复核",
};

export function statusLabel(status?: string | null): string {
  if (!status) return "暂无";
  return STATUS_LABELS[status] ?? "未识别状态";
}

export function statusTone(status?: string | null): OperationsTone {
  if (!status) return "muted";
  if (["accepted", "completed", "service_completed", "paid", "marked_paid", "approved", "confirmed", "success", "active", "enabled", "fresh", "resolved", "visible", "applied", "published", "delivered"].includes(status)) return "success";
  if (["pending", "queued", "offering", "reassigning", "pending_dispatch", "pending_payment", "in_progress", "processing", "requested", "created", "started", "triaged", "waiting_customer", "waiting_requester", "pending_confirmation", "pending_moderation", "proposed", "reviewed", "scheduled", "queueing", "transferred", "retry_wait"].includes(status)) return "warning";
  if (["failed", "cancelled", "no_match", "manual_review", "timeout", "rejected", "expired", "disputed", "escalated", "hidden", "dead_letter", "revoked"].includes(status)) return "danger";
  if (["draft", "disabled", "closed", "stale", "paused", "suspended", "retired", "ended", "not_executed", "provider_not_executed"].includes(status)) return "muted";
  return "primary";
}

export function businessLabel(value?: string | null): string {
  if (!value) return "暂无";
  return BUSINESS_LABELS[value] ?? "未识别业务类型";
}

export function eventLabel(eventType?: string | null): string {
  if (!eventType) return "暂无事件";
  return EVENT_LABELS[eventType] ?? "未识别业务事件";
}

export function reasonLabel(reason?: string | null): string {
  if (!reason) return "服务端未记录原因";
  const normalized = reason.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return REASON_LABELS[normalized] ?? `服务端原因代码：${reason}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatCurrency(amount?: number | null, currency = "CNY"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: currency || "CNY" }).format(amount);
}

export function cityLabel(cityCode?: string | null): string {
  if (cityCode === "hangzhou") return "杭州";
  if (cityCode === "shanghai") return "上海";
  if (cityCode === "beijing") return "北京";
  return cityCode || "未选择";
}

export interface OperationsFailure {
  kind: "offline" | "forbidden" | "conflict" | "timeout" | "invalid" | "unknown";
  title: string;
  detail: string;
}

export function presentFailure(error: unknown, subject: string): OperationsFailure {
  const apiError = error && typeof error === "object" ? error as { kind?: string; status?: number } : null;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (offline || apiError?.kind === "network") {
    return { kind: "offline", title: "当前网络不可用", detail: `无法连接服务端读取${subject}。请恢复网络后重试，页面不会把旧数据当作最新结果。` };
  }
  if (apiError?.status === 403) {
    return { kind: "forbidden", title: `无权访问${subject}`, detail: "当前账号角色或城市权限不满足要求。系统未展示任何越权数据。" };
  }
  if (apiError?.status === 409) {
    return { kind: "conflict", title: "数据已被其他操作更新", detail: `本次${subject}操作未生效。请刷新最新数据后重新判断，避免覆盖他人的处理结果。` };
  }
  if (apiError?.kind === "timeout") {
    return { kind: "timeout", title: "请求超时", detail: `${subject}暂未确认完成。请刷新核对服务端结果，不要重复提交。` };
  }
  if (apiError?.kind === "response_format") {
    return { kind: "invalid", title: "返回数据无法安全展示", detail: `${subject}接口返回格式与当前客户端不一致，页面已停止使用该结果。` };
  }
  return { kind: "unknown", title: `${subject}请求失败`, detail: "服务端暂未完成请求。请稍后重试；若持续失败，请联系平台技术支持并提供操作时间。" };
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  return online;
}
