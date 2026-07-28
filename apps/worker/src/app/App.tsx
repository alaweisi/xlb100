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
import {
  BottomNav,
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  MobileShell,
  StatusTag,
} from "@xlb/ui";
import {
  createWorkerApiClient,
  isUnauthorizedError,
  type WorkerSession,
  WORKER_SESSION_EXPIRED_EVENT,
  workerVisibleError,
} from "./workerAuth";
import {
  IS_WORKER_INVESTOR_DEMO,
  WORKER_INVESTOR_DEMO_CITY_CODE,
  WorkerInvestorDemoNotice,
} from "../investorDemo";
import "./worker-responsive.css";

import { helperText, workerPanelStyle } from "../pages/pageShared";
import { useWorkerAuthStore } from "../features/auth/store";
import type { WorkerSupportApi } from "../pages/WorkerSupportPage";

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

function isNativeMobileRuntime(): boolean {
  return Boolean((window as CapacitorWindow).Capacitor?.isNativePlatform?.());
}

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

const routeConfig: Record<
  WorkerRoute,
  { label: string; href: string; title: string; subtitle: string; icon: string; prominent?: boolean }
> = {
  hall: {
    label: "任务池",
    href: "/worker/",
    title: "待接任务",
    subtitle: "查看并接取演示服务任务",
    icon: "P",
  },
  tasks: {
    label: "服务单",
    href: "/worker/tasks",
    title: "我的服务单",
    subtitle: "开始服务并完成交付",
    icon: "T",
  },
  taskDetail: {
    label: "详情",
    href: "/worker/tasks",
    title: "服务单详情",
    subtitle: "查看进度、上传凭证并完成服务",
    icon: "D",
  },
  repairs: {
    label: "返修",
    href: "/worker/repairs",
    title: "返修任务",
    subtitle: "处理已分配的售后返修",
    icon: "R",
  },
  wallet: {
    label: "钱包",
    href: "/worker/wallet",
    title: "收入钱包",
    subtitle: "查看演示应收与提现申请",
    icon: "W",
  },
  support: { label: "客服", href: "/worker/support", title: "客服工单", subtitle: "查看帮助与争议处理进度", icon: "S" },
  notifications: { label: "消息", href: "/worker/notifications", title: "消息中心", subtitle: "查看同城业务通知", icon: "N" },
  reputation: { label: "评价", href: "/worker/reputation", title: "我的评价", subtitle: "查看已公开的服务评价", icon: "★" },
  profile: {
    label: "我的",
    href: "/worker/profile",
    title: "师傅资料",
    subtitle: "查看演示身份与服务范围",
    icon: "M",
  },
  certification: {
    label: "资质",
    href: "/worker/certification",
    title: "服务资质",
    subtitle: "查看演示资质状态",
    icon: "+",
    prominent: true,
  },
};

const shellStyle = {
  background: "var(--xlb-role-worker-page)",
  color: "var(--xlb-role-worker-text)",
  minHeight: "100vh",
} as CSSProperties;

function readQueryParams(): QueryParams {
  if (IS_WORKER_INVESTOR_DEMO) {
    return { cityCode: WORKER_INVESTOR_DEMO_CITY_CODE };
  }
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
    <div
      className="xlb-worker-preview-status"
      style={{
        alignItems: "center",
        color: "#f8fbff",
        display: "flex",
        fontSize: 12,
        fontWeight: 800,
        justifyContent: "space-between",
        lineHeight: "16px",
      }}
    >
      <span>9:41</span>
      <span>5G</span>
    </div>
  );
}

function WorkerPageHeader({ route }: { route: WorkerRoute }) {
  const config = routeConfig[route];
  const isWorkerApiRoute = true;

  return (
    <header style={{ display: "grid", gap: 10, padding: "20px 20px 8px" }}>
      <PhoneStatusBar />
      <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "#a9bdd0", fontSize: 13, fontWeight: 700, lineHeight: "18px" }}>
            {config.subtitle}
          </span>
          <h1
            style={{
              color: "#fffaf0",
              fontSize: 29,
              fontWeight: 800,
              letterSpacing: 0,
              lineHeight: "36px",
              margin: 0,
            }}
          >
            {config.title}
          </h1>
        </div>
        <StatusTag tone={isWorkerApiRoute ? "success" : "warning"}>
          {isWorkerApiRoute ? "演示服务已连接" : "暂不可用"}
        </StatusTag>
      </div>
    </header>
  );
}

function RouteNav({ activeRoute }: { activeRoute: WorkerRoute }) {
  return (
    <BottomNav
      items={(["hall", "tasks", "repairs", "wallet", "support", "profile", "certification"] as WorkerRoute[]).map((key) => ({
        key,
        label: routeConfig[key].label,
        active: key === activeRoute || (key === "tasks" && activeRoute === "taskDetail"),
        href: routeConfig[key].href,
        icon: routeConfig[key].icon,
        prominent: routeConfig[key].prominent,
      }))}
      style={{
        background: "rgba(255, 250, 240, 0.14)",
        borderTop: "1px solid rgba(138, 174, 210, 0.2)",
        boxShadow: "0 -10px 26px rgba(0, 0, 0, 0.16)",
        color: "#f8fbff",
        position: "sticky",
        bottom: 0,
        zIndex: 3,
      }}
    />
  );
}

function AppFrame({ route, children }: { route: WorkerRoute; children: ReactNode }) {
  return (
    <div
      className="xlb-worker-app"
      data-native-mobile={isNativeMobileRuntime() ? "true" : undefined}
      data-role="worker"
      style={shellStyle}
    >
      <div
        className="xlb-worker-device-stage"
        style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh", padding: "28px 18px" }}
      >
        <div
          className="xlb-worker-device-frame"
          style={{
            background: "var(--xlb-role-worker-page)",
            border: "10px solid #1d6595",
            borderRadius: 28,
            boxShadow: "0 24px 54px rgba(8, 23, 43, 0.32)",
            boxSizing: "border-box",
            minHeight: 844,
            overflow: "hidden",
          }}
        >
          <MobileShell
            topBar={<WorkerPageHeader route={route} />}
            bottomNav={<RouteNav activeRoute={route} />}
            contentStyle={{ padding: "8px 20px 0" }}
            style={{ background: "var(--xlb-role-worker-page)", color: "var(--xlb-role-worker-text)", minHeight: 824 }}
          >
            <WorkerInvestorDemoNotice />
            <div style={{ display: "grid", gap: 14, paddingBottom: 18 }}>{children}</div>
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
    <Card title="当前登录" actions={<StatusTag tone="success">已登录</StatusTag>} style={workerPanelStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        <p style={helperText}>
          当前演示师傅：{session.userId}。退出后会立即清除本次会话与页面数据。
        </p>
        <FormField label="服务城市">
          {IS_WORKER_INVESTOR_DEMO ? (
            <Input aria-label="杭州演示区" value="杭州演示区" readOnly />
          ) : (
            <Input value={cityCode} onChange={(event) => onCityChange(event.target.value || DEFAULT_CITY_CODE)} />
          )}
        </FormField>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button onClick={onReload} variant="primary">
            刷新当前页面
          </Button>
          <Button onClick={onLogout}>退出并清除数据</Button>
          <Button onClick={() => onNavigate("/worker/notifications")}>消息中心</Button>
          <Button onClick={() => onNavigate("/worker/reputation")}>我的评价</Button>
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
  const simulationControlsEnabled =
    ((import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE ?? "development") !== "production";

  const clearWorkerData = useCallback(() => {
    setTaskPool([]);
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
    setEvidenceBusy(false);
    setAcceptError(null);
    setAcceptNotice(null);
    setLifecycleError(null);
    setLifecycleNotice(null);
    setRepairBusyId(null);
    setCertError(null);
    setCertNotice(null);
  }, []);

  const api = useMemo(
    () => (session ? createWorkerApiClient(workerCityCode, session) : null),
    [session, workerCityCode],
  );

  const handleApiError = useCallback(
    (error: unknown, fallback: string, setError: (message: string) => void) => {
      if (isUnauthorizedError(error)) {
        clearWorkerData();
        setSession(null);
        setError("演示登录已过期，请重新登录。");
        return;
      }
      setError(workerVisibleError(error, fallback));
    },
    [clearWorkerData, setSession],
  );

  useEffect(() => {
    const expireSession = () => {
      clearWorkerData();
      setSession(null);
    };
    window.addEventListener(WORKER_SESSION_EXPIRED_EVENT, expireSession);
    return () => window.removeEventListener(WORKER_SESSION_EXPIRED_EVENT, expireSession);
  }, [clearWorkerData, setSession]);

  const loadTaskPool = useCallback(async () => {
    if (!api) return;
    setLoadingHall(true);
    setHallError(null);
    try {
      const response = await api.getTaskPool();
      setTaskPool(response.tasks);
    } catch (error) {
      handleApiError(error, "任务池暂时无法加载，请点击重试。", setHallError);
      setTaskPool([]);
    } finally {
      setLoadingHall(false);
    }
  }, [api, handleApiError]);

  const loadFulfillments = useCallback(async () => {
    if (!api) return;
    setLoadingTasks(true);
    setTasksError(null);
    try {
      const response = await api.getMyFulfillments();
      setFulfillments(response.fulfillments);
    } catch (error) {
      handleApiError(error, "服务单暂时无法加载，请点击重试。", setTasksError);
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
        handleApiError(error, "Failed to load fulfillment detail", setDetailError);
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
        handleApiError(error, "Failed to load fulfillment evidence", setEvidenceError);
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
        setAcceptNotice(
          `任务 ${response.acceptance.dispatchTaskId} 已接取，可前往“我的服务单”继续操作。`,
        );
        await Promise.all([loadTaskPool(), loadFulfillments()]);
      } catch (error) {
        handleApiError(error, "接取任务未完成，请刷新任务池后重试。", setAcceptError);
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
        const response = await api.rejectTask(dispatchTaskId);
        setAcceptNotice(`Rejected ${dispatchTaskId}; dispatch task is now ${response.task.status}.`);
        await loadTaskPool();
      } catch (error) {
        handleApiError(error, "Failed to reject task", setAcceptError);
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
        const response = await api.simulateTaskTimeout(dispatchTaskId);
        setAcceptNotice(`Timed out ${dispatchTaskId}; dispatch task is now ${response.task.status}.`);
        await loadTaskPool();
      } catch (error) {
        handleApiError(error, "Failed to simulate timeout", setAcceptError);
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
        setLifecycleNotice(`服务单 ${response.fulfillment.fulfillmentId} 已开始服务。`);
        await refreshFulfillmentState(fulfillmentId);
      } catch (error) {
        handleApiError(error, "开始服务未完成，请刷新服务单后重试。", setLifecycleError);
      } finally {
        setLifecycleAction(null);
      }
    },
    [api, handleApiError, refreshFulfillmentState],
  );

  const completeFulfillment = useCallback(
    async (fulfillmentId: string) => {
      if (!api) return;
      setLifecycleAction("complete");
      setLifecycleError(null);
      setLifecycleNotice(null);
      try {
        const response = await api.completeFulfillment(fulfillmentId);
        setLifecycleNotice(`服务单 ${response.fulfillment.fulfillmentId} 已完成，等待客户确认。`);
        await refreshFulfillmentState(fulfillmentId);
      } catch (error) {
        handleApiError(error, "完成服务未提交，请刷新服务单后重试。", setLifecycleError);
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
      try {
        await api.uploadFulfillmentEvidence(fulfillmentId, file, metadata);
        await loadTaskEvidence(fulfillmentId);
      } catch (error) {
        handleApiError(error, "Failed to store fulfillment evidence", setEvidenceError);
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
      await api.createWithdrawalRequest({
        bankAccountId: selectedBankAccountId,
        amount: Number(withdrawalAmount),
        requestNote: "Submitted from worker operations app",
        idempotencyKey: `worker-withdrawal:${crypto.randomUUID()}`,
      });
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

  useEffect(() => {
    const onRouteChange = () => setRoute(resolveRoute());
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);
  useEffect(() => {
    reloadCurrent();
  }, [reloadCurrent]);

  const navigate = useCallback((next: string) => {
    window.history.pushState({}, "", next);
    setRoute(resolveRoute());
  }, []);

  const handleLogin = useCallback(
    (nextSession: WorkerSession) => {
      clearWorkerData();
      setSession(nextSession);
    },
    [clearWorkerData],
  );

  const handleLogout = useCallback(() => {
    clearWorkerData();
    setSession(null);
  }, [clearWorkerData]);

  useEffect(() => {
    if (!session?.expiresAt) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      clearWorkerData();
      setSession(null);
      return;
    }
    const timeout = window.setTimeout(() => {
      clearWorkerData();
      setSession(null);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [clearWorkerData, session?.expiresAt, setSession]);

  if (!session) {
    return (
      <AppFrame route="hall">
        <Suspense fallback={<LoadingState title="正在打开师傅端登录" />}>
          <WorkerLoginPage cityCode={workerCityCode} onCityChange={setWorkerCityCode} onLogin={handleLogin} />
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
        evidenceBusy={evidenceBusy}
        onBack={() => navigate("/worker/tasks")}
        onRetry={(fulfillmentId) => void Promise.all([loadTaskDetail(fulfillmentId), loadTaskEvidence(fulfillmentId)])}
        onStart={(fulfillmentId) => void startFulfillment(fulfillmentId)}
        onComplete={(fulfillmentId) => void completeFulfillment(fulfillmentId)}
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
      <Suspense fallback={<LoadingState title="正在加载师傅端页面" />}>{content}</Suspense>
    </AppFrame>
  );
}
