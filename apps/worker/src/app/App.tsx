import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Fulfillment, FulfillmentEvidenceType, WorkerLocation, WorkerTaskPoolItem } from "@xlb/types";
import type {
  AftersaleRepairOrderResponse,
  FulfillmentEvidenceAggregateResponse,
  WorkerBankAccountResponse,
  WorkerReceivableBalanceResponse,
  WorkerWithdrawalResponse,
} from "@xlb/api-client";
import { ApiClientError } from "@xlb/api-client";
import {
  BottomNav,
  Button,
  Card,
  FormField,
  LoadingState,
  MobileShell,
  PermissionState,
  Select,
  StatusTag,
} from "@xlb/ui";
import {
  Bell,
  ClipboardText,
  House,
  SignOut,
  UserCircle,
  Wallet,
  Wrench,
} from "@phosphor-icons/react";
import {
  clearWorkerSession,
  createWorkerApiClient,
  isUnauthorizedError,
  type WorkerAccessStatus,
  type WorkerSession,
} from "./workerAuth";

import { helperText, workerPanelStyle } from "../pages/pageShared";
import { useWorkerAuthStore } from "../features/auth/store";
import type { WorkerSupportApi } from "../pages/WorkerSupportPage";
import type { WorkerEligibilityView, WorkerWorkMode } from "../pages/TaskPages";

const WorkerLoginPage = lazy(() => import("../pages/AuthPages").then((module) => ({ default: module.WorkerLoginPage })));
const HallPage = lazy(() => import("../pages/TaskPages").then((module) => ({ default: module.HallPage })));
const TasksPage = lazy(() => import("../pages/TaskPages").then((module) => ({ default: module.TasksPage })));
const RepairOrdersPage = lazy(() => import("../pages/FulfillmentPages").then((module) => ({ default: module.RepairOrdersPage })));
const TaskDetailPage = lazy(() => import("../pages/FulfillmentPages").then((module) => ({ default: module.TaskDetailPage })));
const WalletPage = lazy(() => import("../pages/FinancePages").then((module) => ({ default: module.WalletPage })));
const WorkerLocationPage = lazy(() => import("../pages/ProfilePages").then((module) => ({ default: module.WorkerLocationPage })));
const CertificationPage = lazy(() => import("../pages/ProfilePages").then((module) => ({ default: module.CertificationPage })));
const WorkerSupportPage = lazy(() => import("../pages/WorkerSupportPage").then((module) => ({ default: module.WorkerSupportPage })));
const WorkerNotificationsPage = lazy(() => import("../pages/WorkerNotificationsPage").then((module) => ({ default: module.WorkerNotificationsPage })));
const WorkerReputationPage = lazy(() => import("../pages/WorkerReputationPage").then((module) => ({ default: module.WorkerReputationPage })));

const DEFAULT_CITY_CODE = "hangzhou";
const WORKER_LOCAL_MODE_KEY = "xlb.worker.local-work-mode";
type WorkerRoute =
  | "hall"
  | "tasks"
  | "taskDetail"
  | "repairs"
  | "wallet"
  | "support"
  | "notifications"
  | "reputation"
  | "profile"
  | "certification";

type QueryParams = {
  cityCode: string;
};

type ResolvedRoute =
  | { route: Exclude<WorkerRoute, "taskDetail"> }
  | { route: "taskDetail"; fulfillmentId: string };

function readLocalWorkMode(): WorkerWorkMode {
  if (typeof window === "undefined") return "online";
  return window.localStorage.getItem(WORKER_LOCAL_MODE_KEY) === "paused" ? "paused" : "online";
}

function apiStatus(error: unknown): number | undefined {
  if (error instanceof ApiClientError) return error.status;
  const match = error instanceof Error ? error.message.match(/\b(400|401|403|404|409|429|500|502|503|504)\b/) : null;
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

function translateBackendReason(reason: string): string {
  if (/not eligible|qualification/i.test(reason)) return "当前服务资格不满足要求，请查看资格阻断原因。";
  if (/already accepted/i.test(reason)) return "该任务已被承接，请刷新大厅确认最新结果。";
  if (/invalid.*status|transition/i.test(reason)) return "任务状态已经变化，当前操作不再允许，请刷新确认。";
  if (/not found/i.test(reason)) return "任务不存在或已失效，请返回列表刷新。";
  if (/city|bound/i.test(reason)) return "当前账号没有此工作城市的操作权限。";
  if (/evidence.*frozen|confirmation is terminal/i.test(reason)) return "顾客已确认或发起争议，证据已冻结。";
  return reason;
}

function translateEligibilityReason(reason: string): string {
  if (/qualification record indicates not eligible/i.test(reason)) return "当前服务资格记录标记为不满足要求。";
  const missing = reason.match(/Missing approved certification:\s*(.+)/i);
  if (missing) return `缺少已审核通过的资格：${missing[1]}`;
  return /[A-Za-z]{4,}/.test(reason) ? "平台判定当前服务资格不满足要求，请进入资格页查看详情。" : reason;
}

function formatWorkerApiError(error: unknown, fallback: string, mutation = false): string {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  if (offline) return mutation ? "当前网络已断开，操作结果暂时未知。恢复网络后请先刷新确认，避免重复操作。" : "当前网络已断开，请恢复网络后重试。";
  if (error instanceof ApiClientError && (error.kind === "network" || error.kind === "timeout" || error.kind === "cancelled")) {
    return mutation ? "网络响应中断，操作结果暂时未知。请先刷新确认最新状态，避免重复操作。" : "网络响应失败，请检查连接后重试。";
  }
  const status = apiStatus(error);
  if (status === 403) return translateBackendReason(apiBodyMessage(error) ?? "当前账号或服务资格无权执行此操作。");
  if (status === 404) return "任务不存在或已失效，请返回列表刷新。";
  if (status === 409) return translateBackendReason(apiBodyMessage(error) ?? "任务状态已被其他操作更新，请刷新后再处理。");
  if (status === 429) return "操作过于频繁，请稍后再试。";
  if (status && status >= 500) return mutation ? "平台响应异常，操作结果暂时未知。请刷新确认最新状态。" : "平台服务暂时不可用，请稍后重试。";
  return error instanceof Error && !/^API\s/i.test(error.message) ? translateBackendReason(error.message) : fallback;
}

const routeConfig: Record<
  WorkerRoute,
  { label: string; href: string; title: string; subtitle: string; icon: ReactNode; prominent?: boolean }
> = {
  hall: {
    label: "大厅",
    href: "/worker/",
    title: "待接任务大厅",
    subtitle: "查看本城市可承接的服务任务",
    icon: <House size={24} weight="regular" />,
  },
  tasks: {
    label: "任务",
    href: "/worker/tasks",
    title: "我的任务",
    subtitle: "跟进已承接服务的履约进度",
    icon: <ClipboardText size={24} weight="regular" />,
  },
  taskDetail: {
    label: "详情",
    href: "/worker/tasks",
    title: "任务详情",
    subtitle: "开始服务并记录完成结果",
    icon: <ClipboardText size={24} weight="regular" />,
  },
  repairs: {
    label: "返工",
    href: "/worker/repairs",
    title: "售后返工",
    subtitle: "处理已分派的返工服务",
    icon: <Wrench size={24} weight="regular" />,
  },
  wallet: {
    label: "收益",
    href: "/worker/wallet",
    title: "我的收益",
    subtitle: "查看应收余额并申请提现",
    icon: <Wallet size={24} weight="regular" />,
  },
  support: { label: "客服", href: "/worker/support", title: "客服工单", subtitle: "跟进帮助与争议处理进度", icon: <Bell size={24} weight="regular" /> },
  notifications: { label: "消息", href: "/worker/notifications", title: "消息中心", subtitle: "接收本城市业务通知", icon: <Bell size={24} weight="regular" /> },
  reputation: { label: "口碑", href: "/worker/reputation", title: "我的口碑", subtitle: "查看已公开评价汇总", icon: <UserCircle size={24} weight="regular" /> },
  profile: {
    label: "我的",
    href: "/worker/profile",
    title: "个人资料",
    subtitle: "管理服务身份与接单设置",
    icon: <UserCircle size={24} weight="regular" />,
  },
  certification: {
    label: "认证",
    href: "/worker/certification",
    title: "服务认证",
    subtitle: "提交并查看服务资格",
    icon: <UserCircle size={24} weight="regular" />,
  },
};

const shellStyle = {
  background: "var(--xlb-role-worker-page)",
  color: "var(--xlb-role-worker-text)",
  minHeight: "100vh",
} as CSSProperties;

function readQueryParams(): QueryParams {
  const params = new URLSearchParams(window.location.search);
  return {
    cityCode: params.get("cityCode")?.trim() || DEFAULT_CITY_CODE,
  };
}

function resolveRoute(): ResolvedRoute {
  const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";

  if (rawPath === "/worker" || rawPath === "/worker/") return { route: "hall" };
  if (rawPath === "/worker/tasks") return { route: "tasks" };
  if (rawPath === "/worker/repairs") return { route: "repairs" };

  const taskDetail = rawPath.match(/^\/worker\/tasks\/([^/?#]+)$/);
  if (taskDetail) {
    return { route: "taskDetail", fulfillmentId: decodeURIComponent(taskDetail[1]) };
  }

  if (rawPath === "/worker/wallet") return { route: "wallet" };
  if (rawPath === "/worker/support") return { route: "support" };
  if (rawPath === "/worker/notifications") return { route: "notifications" };
  if (rawPath === "/worker/reputation") return { route: "reputation" };
  if (rawPath === "/worker/certification") return { route: "certification" };
  if (rawPath === "/worker/profile") return { route: "profile" };
  return { route: "hall" };
}

function PhoneStatusBar() {
  return (
    <div className="worker-status-bar">
      <span>9:41</span>
      <span>工作台</span>
    </div>
  );
}

function WorkerPageHeader({ route }: { route: WorkerRoute }) {
  const config = routeConfig[route];
  const isWorkerApiRoute = true;

  return (
    <header className="worker-page-header">
      <PhoneStatusBar />
      <div className="worker-page-heading">
        <div>
          <span>{config.subtitle}</span>
          <h1>{config.title}</h1>
        </div>
        <a aria-label="打开消息中心" className="worker-header-icon" href="/worker/notifications"><Bell size={22} weight="regular" /></a>
      </div>
      <StatusTag tone={isWorkerApiRoute ? "success" : "warning"}>{isWorkerApiRoute ? "业务已接入" : "暂不可用"}</StatusTag>
    </header>
  );
}

function RouteNav({ activeRoute }: { activeRoute: WorkerRoute }) {
  return (
    <BottomNav
      items={(["hall", "tasks", "repairs", "wallet", "profile"] as WorkerRoute[]).map((key) => ({
        key,
        label: routeConfig[key].label,
        active: key === activeRoute || (key === "tasks" && activeRoute === "taskDetail"),
        href: routeConfig[key].href,
        icon: routeConfig[key].icon,
      }))}
      style={{ position: "sticky", bottom: 0, zIndex: 3 }}
    />
  );
}

function AppFrame({ route, children, gate = false }: { route: WorkerRoute; children: ReactNode; gate?: boolean }) {
  return (
    <div className="worker-app-root" data-role="worker" style={shellStyle}>
      <div className="worker-device-preview">
        <div className="worker-device-frame">
          <MobileShell
            topBar={gate ? undefined : <WorkerPageHeader route={route} />}
            bottomNav={gate ? undefined : <RouteNav activeRoute={route} />}
            contentStyle={{ padding: gate ? 0 : "8px 18px 0" }}
            style={{ background: "var(--xlb-role-worker-page)", color: "var(--xlb-role-worker-text)", minHeight: 824 }}
          >
            <div style={{ display: "grid", gap: 14, minHeight: gate ? 824 : undefined, paddingBottom: gate ? 0 : 18 }}>
              {children}
            </div>
          </MobileShell>
        </div>
      </div>
    </div>
  );
}

function SessionCard({
  cityCode,
  session,
  onCityChange,
  onLogout,
  onNavigate,
  onReload,
}: {
  cityCode: string;
  session: WorkerSession;
  onCityChange: (value: string) => void;
  onLogout: () => void;
  onNavigate: (path: string) => void;
  onReload: () => void;
}) {
  return (
    <Card title="当前师傅身份" actions={<StatusTag tone="success">已登录</StatusTag>} className="worker-session-card" style={workerPanelStyle}>
      <div className="worker-session-content">
        <p style={helperText}>当前账号：{session.userId}。已验证服务身份，可查看本城市任务。</p>
        <FormField label="工作城市">
          <Select value={cityCode} onChange={(event) => onCityChange(event.target.value || DEFAULT_CITY_CODE)}>
            <option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option>
          </Select>
        </FormField>
        <div className="worker-session-actions">
          <Button onClick={onReload} variant="primary">
            刷新当前画面
          </Button>
          <Button onClick={() => onNavigate("/worker/notifications")}><Bell size={18} weight="regular" />消息</Button>
          <Button onClick={onLogout}><SignOut size={18} weight="regular" />退出登录</Button>
        </div>
      </div>
    </Card>
  );
}

export function App() {
  const initialQuery = readQueryParams();
  const [route, setRoute] = useState<ResolvedRoute>(resolveRoute);
  const { cityCode: workerCityCode, session, setCityCode: setWorkerCityCode, setSession } =
    useWorkerAuthStore(initialQuery.cityCode);
  const [taskPool, setTaskPool] = useState<WorkerTaskPoolItem[]>([]);
  const [eligibilityBySku, setEligibilityBySku] = useState<Record<string, WorkerEligibilityView>>({});
  const [workMode, setWorkMode] = useState<WorkerWorkMode>(readLocalWorkMode);
  const [networkOnline, setNetworkOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [repairOrders, setRepairOrders] = useState<AftersaleRepairOrderResponse[]>([]);
  const [walletBalance, setWalletBalance] = useState<WorkerReceivableBalanceResponse | null>(null);
  const [bankAccounts, setBankAccounts] = useState<WorkerBankAccountResponse[]>([]);
  const [withdrawals, setWithdrawals] = useState<WorkerWithdrawalResponse[]>([]);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCardNumber, setBankCardNumber] = useState("");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [workerLocation, setWorkerLocation] = useState<WorkerLocation | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [latitude, setLatitude] = useState("30.274100");
  const [longitude, setLongitude] = useState("120.155100");
  const [serviceRadius, setServiceRadius] = useState("10");
  const [locationSharing, setLocationSharing] = useState(true);
  const [repairNotes, setRepairNotes] = useState<Record<string, string>>({});
  const [taskDetail, setTaskDetail] = useState<Fulfillment | null>(null);
  const [taskEvidence, setTaskEvidence] = useState<FulfillmentEvidenceAggregateResponse | null>(null);
  const [loadingHall, setLoadingHall] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingRepairs, setLoadingRepairs] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [acceptingDispatchTaskId, setAcceptingDispatchTaskId] = useState<string | null>(null);
  const [simulationAction, setSimulationAction] = useState<{ type: "reject" | "timeout"; dispatchTaskId: string } | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<"start" | "complete" | null>(null);
  const [hallError, setHallError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [repairsError, setRepairsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceNotice, setEvidenceNotice] = useState<string | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptNotice, setAcceptNotice] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);
  const [repairBusyId, setRepairBusyId] = useState<string | null>(null);
  const [certType, setCertType] = useState("home_service_basic");
  const [certName, setCertName] = useState("基础上门服务资格");
  const [certSubmitting, setCertSubmitting] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);
  const [certNotice, setCertNotice] = useState<string | null>(null);
  const [accessStatus, setAccessStatus] = useState<WorkerAccessStatus | null>(null);
  const simulationControlsEnabled =
    ((import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE ?? "development") !== "production";

  const api = useMemo(
    () => (session ? createWorkerApiClient(workerCityCode, session) : null),
    [session, workerCityCode],
  );

  const handleApiError = useCallback(
    (error: unknown, fallback: string, setError: (message: string) => void, mutation = false) => {
      if (isUnauthorizedError(error)) {
        clearWorkerSession();
        setSession(null);
        setError("登录状态已失效，请重新登录。");
        return;
      }
      setError(formatWorkerApiError(error, fallback, mutation));
    },
    [setSession],
  );

  const loadTaskEligibility = useCallback(async (tasks: WorkerTaskPoolItem[]) => {
    if (!api) return;
    const skuIds = [...new Set(tasks.map((task) => task.skuId))];
    if (skuIds.length === 0) {
      setEligibilityBySku({});
      return;
    }
    setEligibilityBySku(Object.fromEntries(skuIds.map((skuId) => [skuId, { status: "loading", reasons: [] } satisfies WorkerEligibilityView])));
    const entries = await Promise.all(skuIds.map(async (skuId): Promise<[string, WorkerEligibilityView]> => {
      try {
        const response = await api.getEligibility(skuId);
        const eligibility = response.eligibility;
        return [skuId, { status: eligibility.isEligible ? "eligible" : "blocked", reasons: eligibility.reasons.map(translateEligibilityReason) }];
      } catch (error) {
        return [skuId, { status: "unknown", reasons: [formatWorkerApiError(error, "平台暂未返回资格结果，请重新核验。")] }];
      }
    }));
    setEligibilityBySku(Object.fromEntries(entries));
  }, [api]);

  const loadTaskPool = useCallback(async () => {
    if (!api) return;
    setLoadingHall(true);
    setHallError(null);
    try {
      const response = await api.getTaskPool();
      setTaskPool(response.tasks);
      await loadTaskEligibility(response.tasks);
    } catch (error) {
      handleApiError(error, "抢单大厅加载失败，请稍后重试。", setHallError);
      setTaskPool([]);
      setEligibilityBySku({});
    } finally {
      setLoadingHall(false);
    }
  }, [api, handleApiError, loadTaskEligibility]);

  const loadFulfillments = useCallback(async () => {
    if (!api) return;
    setLoadingTasks(true);
    setTasksError(null);
    try {
      const response = await api.getMyFulfillments();
      setFulfillments(response.fulfillments);
    } catch (error) {
      handleApiError(error, "我的任务加载失败，请稍后重试。", setTasksError);
      setFulfillments([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [api, handleApiError]);

  const loadRepairOrders = useCallback(async () => {
    if (!api) return;
    setLoadingRepairs(true);
    setRepairsError(null);
    try {
      const response = await api.listAftersaleRepairOrders();
      setRepairOrders(response.repairOrders);
    } catch (error) {
      handleApiError(error, "Failed to load repair visits", setRepairsError);
      setRepairOrders([]);
    } finally {
      setLoadingRepairs(false);
    }
  }, [api, handleApiError]);

  const loadWallet = useCallback(async () => {
    if (!api) return;
    setWalletBusy(true); setWalletError(null);
    try {
      const [balanceResult, accountsResult, withdrawalsResult] = await Promise.all([
        api.getReceivableBalance(), api.listBankAccounts(), api.listWithdrawalRequests(),
      ]);
      setWalletBalance(balanceResult.balance);
      setBankAccounts(accountsResult.bankAccounts);
      setWithdrawals(withdrawalsResult.withdrawals);
      setSelectedBankAccountId(previous => previous || accountsResult.bankAccounts[0]?.bankAccountId || "");
    } catch (error) {
      handleApiError(error, "Failed to load wallet", setWalletError);
    } finally { setWalletBusy(false); }
  }, [api, handleApiError]);

  const loadLocation = useCallback(async () => {
    if (!api) return;
    setLocationBusy(true); setLocationError(null);
    try {
      const response = await api.getLocation();
      setWorkerLocation(response.location);
      if (response.location) {
        setLatitude(String(response.location.latitude)); setLongitude(String(response.location.longitude));
      }
    } catch (error) { handleApiError(error, "Failed to load worker location", setLocationError); }
    finally { setLocationBusy(false); }
  }, [api, handleApiError]);

  const loadTaskDetail = useCallback(
    async (fulfillmentId: string) => {
      if (!api) return;
      setLoadingDetail(true);
      setDetailError(null);
      setTaskDetail(null);
      try {
        const response = await api.getFulfillment(fulfillmentId);
        setTaskDetail(response.fulfillment);
      } catch (error) {
        handleApiError(error, "履约详情加载失败，请稍后重试。", setDetailError);
      } finally {
        setLoadingDetail(false);
      }
    },
    [api, handleApiError],
  );

  const loadTaskEvidence = useCallback(
    async (fulfillmentId: string) => {
      if (!api) return;
      setLoadingEvidence(true);
      setEvidenceError(null);
      try {
        const response = await api.getFulfillmentEvidence(fulfillmentId);
        setTaskEvidence(response.aggregate);
      } catch (error) {
        handleApiError(error, "服务证据加载失败，请稍后重试。", setEvidenceError);
        setTaskEvidence(null);
      } finally {
        setLoadingEvidence(false);
      }
    },
    [api, handleApiError],
  );

  const reloadCurrent = useCallback(() => {
    if (route.route === "hall") void loadTaskPool();
    if (route.route === "tasks") void loadFulfillments();
    if (route.route === "taskDetail") void Promise.all([loadTaskDetail(route.fulfillmentId), loadTaskEvidence(route.fulfillmentId)]);
    if (route.route === "repairs") void loadRepairOrders();
    if (route.route === "wallet") void loadWallet();
    if (route.route === "profile") void loadLocation();
  }, [loadFulfillments, loadLocation, loadRepairOrders, loadTaskDetail, loadTaskEvidence, loadTaskPool, loadWallet, route]);

  const acceptTask = useCallback(
    async (dispatchTaskId: string) => {
      if (!api) return;
      setAcceptingDispatchTaskId(dispatchTaskId);
      setAcceptError(null);
      setAcceptNotice(null);
      try {
        const response = await api.acceptTask(dispatchTaskId);
        setAcceptNotice(response.idempotent
          ? `重复接单请求已安全处理：任务 ${response.acceptance.dispatchTaskId} 已由你承接，无需再次操作。`
          : `接单成功：任务 ${response.acceptance.dispatchTaskId} 已承接，履约单 ${response.fulfillment.fulfillmentId} 已创建。`);
        await Promise.all([loadTaskPool(), loadFulfillments()]);
      } catch (error) {
        handleApiError(error, "接单未完成，请刷新确认后重试。", setAcceptError, true);
      } finally {
        setAcceptingDispatchTaskId(null);
      }
    },
    [api, handleApiError, loadFulfillments, loadTaskPool],
  );

  const rejectTask = useCallback(
    async (dispatchTaskId: string) => {
      if (!api) return;
      setSimulationAction({ type: "reject", dispatchTaskId });
      setAcceptError(null);
      setAcceptNotice(null);
      try {
        await api.rejectTask(dispatchTaskId);
        setAcceptNotice(`已放弃派单邀约 ${dispatchTaskId}，平台将继续安排其他师傅。`);
        await loadTaskPool();
      } catch (error) {
        handleApiError(error, "放弃派单邀约未完成，请刷新确认后重试。", setAcceptError, true);
      } finally {
        setSimulationAction(null);
      }
    },
    [api, handleApiError, loadTaskPool],
  );

  const simulateTaskTimeout = useCallback(
    async (dispatchTaskId: string) => {
      if (!api) return;
      setSimulationAction({ type: "timeout", dispatchTaskId });
      setAcceptError(null);
      setAcceptNotice(null);
      try {
        await api.simulateTaskTimeout(dispatchTaskId);
        setAcceptNotice(`开发验证：派单邀约 ${dispatchTaskId} 已进入超时状态。`);
        await loadTaskPool();
      } catch (error) {
        handleApiError(error, "模拟超时未完成，请刷新确认。", setAcceptError, true);
      } finally {
        setSimulationAction(null);
      }
    },
    [api, handleApiError, loadTaskPool],
  );

  const refreshFulfillmentState = useCallback(
    async (fulfillmentId: string) => {
      await Promise.all([loadTaskPool(), loadFulfillments(), loadTaskDetail(fulfillmentId), loadTaskEvidence(fulfillmentId)]);
    },
    [loadFulfillments, loadTaskDetail, loadTaskEvidence, loadTaskPool],
  );

  const startFulfillment = useCallback(
    async (fulfillmentId: string) => {
      if (!api) return;
      setLifecycleAction("start");
      setLifecycleError(null);
      setLifecycleNotice(null);
      try {
        const response = await api.startFulfillment(fulfillmentId);
        setLifecycleNotice(response.idempotent
          ? `重复请求已安全处理：履约单 ${response.fulfillment.fulfillmentId} 已处于服务中。`
          : `已开始服务：履约单 ${response.fulfillment.fulfillmentId} 状态已同步。`);
        await refreshFulfillmentState(fulfillmentId);
      } catch (error) {
        handleApiError(error, "开始服务未完成，请刷新确认后重试。", setLifecycleError, true);
      } finally {
        setLifecycleAction(null);
      }
    },
    [api, handleApiError, refreshFulfillmentState],
  );

  const completeFulfillment = useCallback(
    async (fulfillmentId: string, completionNote?: string) => {
      if (!api) return;
      setLifecycleAction("complete");
      setLifecycleError(null);
      setLifecycleNotice(null);
      try {
        const response = await api.completeFulfillment(fulfillmentId, { completionNote });
        setLifecycleNotice(response.idempotent
          ? `重复请求已安全处理：履约单 ${response.fulfillment.fulfillmentId} 已登记完工。`
          : `完工已登记：履约单 ${response.fulfillment.fulfillmentId} 正在等待顾客确认。`);
        await refreshFulfillmentState(fulfillmentId);
      } catch (error) {
        handleApiError(error, "登记完工未完成，请刷新确认后重试。", setLifecycleError, true);
      } finally {
        setLifecycleAction(null);
      }
    },
    [api, handleApiError, refreshFulfillmentState],
  );

  const uploadFulfillmentEvidence = useCallback(
    async (fulfillmentId: string, file: File, metadata: { evidenceType: FulfillmentEvidenceType; complaintId?: string; note?: string }) => {
      if (!api) return;
      setEvidenceBusy(true);
      setEvidenceError(null);
      setEvidenceNotice(null);
      try {
        const response = await api.uploadFulfillmentEvidence(fulfillmentId, file, metadata);
        setEvidenceNotice(`证据 ${response.evidence.evidenceId} 已保存到私有存储。`);
        await loadTaskEvidence(fulfillmentId);
      } catch (error) {
        handleApiError(error, "证据上传未完成，请刷新证据后再决定是否重试。", setEvidenceError, true);
      } finally {
        setEvidenceBusy(false);
      }
    },
    [api, handleApiError, loadTaskEvidence],
  );
  const mutateRepairOrder = useCallback(
    async (repairOrderId: string, action: "start" | "complete", note = "") => {
      if (!api) return;
      setRepairBusyId(repairOrderId);
      setRepairsError(null);
      try {
        if (action === "start") await api.startAftersaleRepairOrder(repairOrderId);
        else await api.completeAftersaleRepairOrder(repairOrderId, note);
        await loadRepairOrders();
      } catch (error) {
        handleApiError(error, "Failed to update repair visit", setRepairsError);
      } finally {
        setRepairBusyId(null);
      }
    },
    [api, handleApiError, loadRepairOrders],
  );

  const submitCertification = useCallback(async () => {
    if (!api) return;
    setCertSubmitting(true);
    setCertError(null);
    setCertNotice(null);
    try {
      const response = await api.submitCertification({
        certType: certType.trim(),
        certName: certName.trim(),
      });
      setCertNotice(
        `Certification ${response.certification.certificationId} submitted with status ${response.certification.status}.`,
      );
    } catch (error) {
      handleApiError(error, "Failed to submit certification", setCertError);
    } finally {
      setCertSubmitting(false);
    }
  }, [api, certName, certType, handleApiError]);

  const addBankAccount = useCallback(async () => {
    if (!api) return;
    setWalletBusy(true); setWalletError(null);
    try {
      const response = await api.createBankAccount({ accountHolder: accountHolder.trim(), bankName: bankName.trim(), bankCardNumber: bankCardNumber.trim() });
      setSelectedBankAccountId(response.bankAccount.bankAccountId);
      setBankCardNumber("");
      await loadWallet();
    } catch (error) { handleApiError(error, "Failed to add bank account", setWalletError); }
    finally { setWalletBusy(false); }
  }, [accountHolder, api, bankCardNumber, bankName, handleApiError, loadWallet]);

  const requestWithdrawal = useCallback(async () => {
    if (!api) return;
    setWalletBusy(true); setWalletError(null);
    try {
      await api.createWithdrawalRequest({ bankAccountId: selectedBankAccountId, amount: Number(withdrawalAmount), requestNote: "Submitted from worker operations app" });
      setWithdrawalAmount("");
      await loadWallet();
    } catch (error) { handleApiError(error, "Failed to submit withdrawal request", setWalletError); }
    finally { setWalletBusy(false); }
  }, [api, handleApiError, loadWallet, selectedBankAccountId, withdrawalAmount]);

  const saveLocation = useCallback(async () => {
    if (!api) return;
    setLocationBusy(true); setLocationError(null);
    try {
      const response = await api.upsertLocation({
        latitude: Number(latitude), longitude: Number(longitude), accuracyMeters: 20,
        capturedAt: new Date().toISOString(), serviceRadiusKm: Number(serviceRadius), locationSharingEnabled: locationSharing,
      });
      setWorkerLocation(response.location);
    } catch (error) { handleApiError(error, "Failed to report location", setLocationError); }
    finally { setLocationBusy(false); }
  }, [api, handleApiError, latitude, locationSharing, longitude, serviceRadius]);

  const handleWorkModeChange = useCallback((mode: WorkerWorkMode) => {
    setWorkMode(mode);
    window.localStorage.setItem(WORKER_LOCAL_MODE_KEY, mode);
  }, []);

  useEffect(() => {
    const onRouteChange = () => setRoute(resolveRoute());
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);
  useEffect(() => {
    const markOnline = () => setNetworkOnline(true);
    const markOffline = () => setNetworkOnline(false);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, []);
  useEffect(() => {
    reloadCurrent();
  }, [reloadCurrent]);

  const navigate = useCallback((next: string) => {
    window.history.pushState({}, "", next);
    setRoute(resolveRoute());
  }, []);

  const clearWorkerData = useCallback(() => {
    setTaskPool([]);
    setEligibilityBySku({});
    setFulfillments([]);
    setRepairOrders([]);
    setWalletBalance(null);
    setBankAccounts([]);
    setWithdrawals([]);
    setWalletError(null);
    setWorkerLocation(null);
    setLocationError(null);
    setRepairNotes({});
    setTaskDetail(null);
    setTaskEvidence(null);
    setHallError(null);
    setTasksError(null);
    setRepairsError(null);
    setDetailError(null);
    setEvidenceError(null);
    setEvidenceNotice(null);
    setEvidenceBusy(false);
    setAcceptError(null);
    setAcceptNotice(null);
    setLifecycleError(null);
    setLifecycleNotice(null);
    setRepairBusyId(null);
    setCertError(null);
    setCertNotice(null);
  }, []);

  const handleLogin = useCallback(
    (nextSession: WorkerSession) => {
      clearWorkerData();
      setAccessStatus(null);
      setSession(nextSession);
    },
    [clearWorkerData],
  );

  const handleLogout = useCallback(() => {
    clearWorkerData();
    clearWorkerSession();
    setAccessStatus(null);
    setSession(null);
  }, [clearWorkerData]);

  if (accessStatus) {
    const suspended = accessStatus === "suspended";
    return (
      <AppFrame route="hall" gate>
        <main style={{ alignItems: "center", display: "grid", minHeight: 824, padding: 24 }}>
          <PermissionState
            title={suspended ? "师傅账号已暂停接单" : "师傅账号已停用"}
            description={suspended
              ? "平台当前暂停了该账号的接单权限，身份验证仍然有效，但不能进入接单与履约场景。"
              : "平台已停用该账号，不能进入接单、履约和收益相关场景。"}
            facts={suspended ? "影响范围：接单、履约、售后返工。已有业务请联系平台客服处理。" : "允许的下一步：退出当前账号，或联系平台客服核对停用结果。"}
            action={<Button onClick={() => setAccessStatus(null)}>{suspended ? "重新验证状态" : "退出当前账号"}</Button>}
            secondaryAction={<Button onClick={() => { window.location.href = "tel:4000000000"; }}>联系平台客服</Button>}
          />
        </main>
      </AppFrame>
    );
  }

  if (!session) {
    return (
      <AppFrame route="hall" gate>
        <Suspense fallback={<LoadingState title="正在打开师傅登录" description="请稍候。" />}>
          <WorkerLoginPage cityCode={workerCityCode} onCityChange={setWorkerCityCode} onLogin={handleLogin} onAccessBlocked={setAccessStatus} />
        </Suspense>
      </AppFrame>
    );
  }

  const content =
    route.route === "hall" ? (
      <HallPage
        tasks={taskPool}
        loading={loadingHall}
        error={hallError}
        acceptError={acceptError}
        acceptNotice={acceptNotice}
        acceptingDispatchTaskId={acceptingDispatchTaskId}
        simulationAction={simulationAction}
        simulationControlsEnabled={simulationControlsEnabled}
        cityCode={workerCityCode}
        workerId={session.userId}
        eligibilityBySku={eligibilityBySku}
        workMode={workMode}
        networkOnline={networkOnline}
        onWorkModeChange={handleWorkModeChange}
        onRefresh={loadTaskPool}
        onAccept={(dispatchTaskId) => void acceptTask(dispatchTaskId)}
        onReject={(dispatchTaskId) => void rejectTask(dispatchTaskId)}
        onSimulateTimeout={(dispatchTaskId) => void simulateTaskTimeout(dispatchTaskId)}
      />
    ) : route.route === "tasks" ? (
      <TasksPage
        fulfillments={fulfillments}
        loading={loadingTasks}
        error={tasksError}
        networkOnline={networkOnline}
        onRefresh={loadFulfillments}
        onOpenDetail={(fulfillmentId) => navigate(`/worker/tasks/${encodeURIComponent(fulfillmentId)}`)}
      />
    ) : route.route === "taskDetail" ? (
      <TaskDetailPage
        fulfillment={taskDetail}
        loading={loadingDetail}
        error={detailError}
        fulfillmentId={route.fulfillmentId}
        lifecycleError={lifecycleError}
        lifecycleNotice={lifecycleNotice}
        lifecycleAction={lifecycleAction}
        evidenceAggregate={taskEvidence}
        evidenceLoading={loadingEvidence}
        evidenceError={evidenceError}
        evidenceNotice={evidenceNotice}
        evidenceBusy={evidenceBusy}
        networkOnline={networkOnline}
        onBack={() => navigate("/worker/tasks")}
        onStart={(fulfillmentId) => void startFulfillment(fulfillmentId)}
        onComplete={(fulfillmentId, completionNote) => void completeFulfillment(fulfillmentId, completionNote)}
        onRefreshEvidence={(fulfillmentId) => void loadTaskEvidence(fulfillmentId)}
        onUploadEvidence={(fulfillmentId,file,metadata) => void uploadFulfillmentEvidence(fulfillmentId,file,metadata)}
      />
    ) : route.route === "repairs" ? (
      <RepairOrdersPage
        repairOrders={repairOrders}
        loading={loadingRepairs}
        error={repairsError}
        busyId={repairBusyId}
        notes={repairNotes}
        onRefresh={() => void loadRepairOrders()}
        onNoteChange={(repairOrderId, note) => setRepairNotes((previous) => ({ ...previous, [repairOrderId]: note }))}
        onStart={(repairOrderId) => void mutateRepairOrder(repairOrderId, "start")}
        onComplete={(repairOrderId, note) => void mutateRepairOrder(repairOrderId, "complete", note)}
      />
    ) : route.route === "wallet" ? (
      <WalletPage balance={walletBalance} bankAccounts={bankAccounts} withdrawals={withdrawals} busy={walletBusy} error={walletError}
        accountHolder={accountHolder} bankName={bankName} bankCardNumber={bankCardNumber} withdrawalAmount={withdrawalAmount}
        selectedBankAccountId={selectedBankAccountId} onReload={() => void loadWallet()} onAccountHolderChange={setAccountHolder}
        onBankNameChange={setBankName} onBankCardNumberChange={setBankCardNumber} onWithdrawalAmountChange={setWithdrawalAmount}
        onSelectedBankAccountChange={setSelectedBankAccountId} onAddBankAccount={() => void addBankAccount()} onRequestWithdrawal={() => void requestWithdrawal()} />
    ) : route.route === "support" ? (
      <WorkerSupportPage api={{
        createTicket: (input) => api!.createSupportTicket(input),
        listTickets: (filters) => api!.listSupportTickets(filters),
        getTicket: (ticketId) => api!.getSupportTicket(ticketId),
        addComment: (ticketId, input) => api!.addSupportTicketComment(ticketId, input),
        reopenTicket: (ticketId, input) => api!.reopenSupportTicket(ticketId, input),
        submitCsat: (ticketId,input) => api!.submitSupportTicketCsat(ticketId,input),
        createConversation: (input) => api!.createSupportConversation(input),
        listConversations: () => api!.listSupportConversations(),
        getConversation: (conversationId) => api!.getSupportConversation(conversationId),
        sendConversationMessage: (conversationId, input) => api!.sendSupportMessage(conversationId, input),
      } satisfies WorkerSupportApi} />
    ) : route.route === "notifications" ? (
      <WorkerNotificationsPage api={api!} />
    ) : route.route === "reputation" ? (
      <WorkerReputationPage api={api!} />
    ) : route.route === "profile" ? (
      <WorkerLocationPage location={workerLocation} busy={locationBusy} error={locationError} latitude={latitude} longitude={longitude}
        radius={serviceRadius} sharing={locationSharing} onLatitudeChange={setLatitude} onLongitudeChange={setLongitude}
        onRadiusChange={setServiceRadius} onSharingChange={setLocationSharing} onSave={() => void saveLocation()} onReload={() => void loadLocation()} />
    ) : (
      <CertificationPage
        cityCode={workerCityCode}
        workerId={session.userId}
        certType={certType}
        certName={certName}
        submitting={certSubmitting}
        error={certError}
        notice={certNotice}
        onCertTypeChange={setCertType}
        onCertNameChange={setCertName}
        onSubmit={() => void submitCertification()}
      />
    );

  return (
    <AppFrame route={route.route}>
      <SessionCard
        cityCode={workerCityCode}
        session={session}
        onCityChange={setWorkerCityCode}
        onLogout={handleLogout}
        onNavigate={navigate}
        onReload={reloadCurrent}
      />
      <Suspense fallback={<LoadingState title="正在打开师傅工作台" description="正在加载业务数据。" />}>{content}</Suspense>
    </AppFrame>
  );
}
