import {
  ArrowClockwise,
  Bell,
  Buildings,
  CaretDown,
  Check,
  CheckCircle,
  ClipboardText,
  DotsThree,
  FileMagnifyingGlass,
  Gauge,
  ListChecks,
  MagnifyingGlass,
  Plus,
  Pulse,
  SignOut,
  SquaresFour,
  UserCircle,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import type {
  OaActivityItem,
  OaApprovalRequest,
  OaAuditRecord,
  OaOrganization,
  OaNotification,
  OaPrincipal,
  OaTask,
  OaWorkbenchResponse,
} from "@xlb/types";
import {
  clearOaSession,
  createOaAdminHandoffUrl,
  isUnauthorizedOaError,
  login,
  oa,
  readDebugLoginCode,
  readOaSession,
  requestLoginCode,
  subscribeOaEvents,
  type OaRealtimeState,
  type OaSession,
} from "./api";
import { OrganizationAdministration } from "./OrganizationAdministration";

type View = "workbench" | "tasks" | "approvals" | "activity" | "organization" | "capabilities" | "audit";
type QueueItem =
  | { kind: "task"; id: string; task: OaTask }
  | { kind: "approval"; id: string; approval: OaApprovalRequest };
type ComposerKind = "task" | "approval";

const VIEW_HASH: Record<View, string> = {
  workbench: "",
  tasks: "tasks",
  approvals: "approvals",
  activity: "activity",
  organization: "organization",
  capabilities: "capabilities",
  audit: "audit",
};

function viewFromHash(): View {
  const value = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  const found = (Object.entries(VIEW_HASH) as [View, string][]).find(([, hash]) => hash === value);
  return found?.[0] ?? "workbench";
}

function formatTime(value: string | null): string {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function cityLabel(cityCode: string): string {
  return {
    hangzhou: "杭州",
    shanghai: "上海",
    beijing: "北京",
  }[cityCode] ?? cityCode;
}

function statusLabel(status: string): string {
  return {
    open: "待认领",
    claimed: "已认领",
    in_progress: "处理中",
    blocked: "已阻塞",
    completed: "已完成",
    cancelled: "已取消",
    pending: "待审批",
    approved: "已通过",
    rejected: "已拒绝",
    returned: "已退回",
  }[status] ?? status;
}

function tone(status: string): string {
  if (["completed", "approved", "live", "allowed"].includes(status)) return "success";
  if (["blocked", "rejected", "disconnected", "denied"].includes(status)) return "danger";
  if (["pending", "open", "stale"].includes(status)) return "warning";
  return "primary";
}

function Badge({ value }: { value: string }) {
  return <span className={`oa-badge oa-badge--${tone(value)}`}>{statusLabel(value)}</span>;
}

function queueItemOrganizationId(item: QueueItem): string {
  return item.kind === "task" ? item.task.organizationId : item.approval.organizationId;
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="oa-empty">
      <CheckCircle size={28} weight="duotone" />
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (session: OaSession) => void }) {
  const [username, setUsername] = useState("admin_global");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("使用总部或分公司 OA 身份登录");
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setBusy(true);
    try {
      const result = await requestLoginCode(username.trim());
      const debug = await readDebugLoginCode(username.trim());
      if (debug) setCode(debug);
      setNotice(debug
        ? `验证码已签发，本地调试码已自动填入（${result.ttlSeconds} 秒有效）`
        : `验证码已发送（${result.ttlSeconds} 秒有效）`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "验证码请求失败");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      onLogin(await login(username.trim(), code.trim()));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="oa-login">
      <section className="oa-login__brand">
        <div className="oa-logo oa-logo--large">喜</div>
        <p>喜乐帮 · 总部运营中枢</p>
        <h1>让总部与分公司<br />在同一条业务线上协同</h1>
        <ul>
          <li><Check size={18} weight="bold" /> 权限随组织与城市范围收敛</li>
          <li><Check size={18} weight="bold" /> 任务、审批、活动与审计全程留痕</li>
          <li><Check size={18} weight="bold" /> 统一进入现有 Admin 运营能力</li>
        </ul>
      </section>
      <section className="oa-login__panel">
        <div className="oa-login__card">
          <div>
            <span className="oa-eyebrow">XLB OFFICE AUTOMATION</span>
            <h2>登录 OA</h2>
            <p>{notice}</p>
          </div>
          <label>
            账号
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label>
            验证码
            <div className="oa-code-field">
              <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" />
              <button type="button" onClick={requestCode} disabled={busy || !username.trim()}>获取验证码</button>
            </div>
          </label>
          <button className="oa-primary-button oa-primary-button--wide" type="button" onClick={submit} disabled={busy || !code.trim()}>
            {busy ? "正在验证…" : "进入运营中枢"}
          </button>
          <small>会话仅保存在当前浏览器标签页，关闭后自动清除。</small>
        </div>
      </section>
    </main>
  );
}

const NAV_ITEMS: { view: View; label: string; icon: typeof Gauge }[] = [
  { view: "workbench", label: "运营工作台", icon: Gauge },
  { view: "tasks", label: "协同任务", icon: ListChecks },
  { view: "approvals", label: "审批中心", icon: ClipboardText },
  { view: "activity", label: "分公司动态", icon: Pulse },
  { view: "organization", label: "组织与权限", icon: UsersThree },
  { view: "capabilities", label: "管理能力", icon: SquaresFour },
  { view: "audit", label: "审计记录", icon: FileMagnifyingGlass },
];

const CAPABILITIES = [
  { permission: "operations.orders.read", title: "订单与履约", body: "订单池、订单追踪与履约证据", href: "/admin/#/platform-operations" },
  { permission: "operations.catalog.read", title: "服务目录", body: "城市 SKU、价格与可用状态", href: "/admin/#/platform-operations" },
  { permission: "operations.certification.read", title: "师傅资质", body: "资质申请、状态与审核记录", href: "/admin/#/platform-operations" },
  { permission: "operations.dispatch.read", title: "调度中心", body: "城市派单、异常队列与人工干预", href: "/admin/#/dispatch" },
  { permission: "finance.settlement.read", title: "结算治理", body: "对账、结算单、导出复核与治理动作", href: "/admin/#/" },
  { permission: "finance.withdrawal.read", title: "提现审核", body: "师傅提现、风控证据与复核", href: "/admin/#/worker-withdrawals" },
  { permission: "aftersale.read", title: "售后中心", body: "投诉、返修、责任判定与补偿", href: "/admin/#/aftersale" },
  { permission: "support.read", title: "客服工作台", body: "工单、会话、SLA、知识库与质检", href: "/admin/#/support" },
  { permission: "support.quality.read", title: "客服质检", body: "质检规则、复核记录与质量看板", href: "/admin/#/support-quality" },
  { permission: "enterprise.read", title: "企业客户", body: "企业订单、回调与开放平台运行", href: "/admin/#/enterprise" },
  { permission: "reviews.read", title: "评价与信誉", body: "评价审核、申诉与师傅信誉", href: "/admin/#/review-moderation" },
  { permission: "marketing.read", title: "营销与优惠券", body: "营销活动、规则版本与优惠券", href: "/admin/#/marketing" },
] as const;

export function App() {
  const [session, setSession] = useState<OaSession | null>(readOaSession);
  const [view, setView] = useState<View>(viewFromHash);
  const [workbench, setWorkbench] = useState<OaWorkbenchResponse | null>(null);
  const [organizations, setOrganizations] = useState<OaOrganization[]>([]);
  const [audit, setAudit] = useState<OaAuditRecord[]>([]);
  const [notifications, setNotifications] = useState<OaNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [reason, setReason] = useState("按 OA 协同流程处理");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerKind | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftOrganizationId, setDraftOrganizationId] = useState("");
  const [draftCityCode, setDraftCityCode] = useState("");
  const [realtimeState, setRealtimeState] = useState<OaRealtimeState>("disconnected");

  const navigate = useCallback((next: View) => {
    setView(next);
    window.location.hash = VIEW_HASH[next] ? `#/${VIEW_HASH[next]}` : "";
  }, []);

  useEffect(() => {
    const listener = () => setView(viewFromHash());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  const invalidateSession = useCallback(() => {
    clearOaSession();
    setWorkbench(null);
    setOrganizations([]);
    setAudit([]);
    setNotifications([]);
    setUnreadCount(0);
    setNoticeOpen(false);
    setSelected(null);
    setSelectedCity("all");
    setComposer(null);
    setError(null);
    setRealtimeState("disconnected");
    setSession(null);
  }, []);

  const load = useCallback(async (options: { background?: boolean } = {}) => {
    if (!session) return;
    if (!options.background) setBusy(true);
    setError(null);
    try {
      const nextWorkbench = await oa.getWorkbench();
      const [nextOrganizations, nextNotifications, nextTaskQueue] = await Promise.all([
        nextWorkbench.principal.permissions.includes("oa.organization.read")
          ? oa.listOrganizations()
          : Promise.resolve({
              ok: true as const,
              organizations: [nextWorkbench.principal.organization],
            }),
        nextWorkbench.principal.permissions.includes("oa.notification.read")
          ? oa.listNotifications({ limit: 20 })
          : Promise.resolve({
              ok: true as const,
              notifications: [],
              unreadCount: 0,
            }),
        nextWorkbench.principal.permissions.includes("oa.task.read")
          ? oa.listTasks({ assignee: "all" })
          : Promise.resolve({ ok: true as const, tasks: nextWorkbench.tasks }),
      ]);
      const hydratedWorkbench = { ...nextWorkbench, tasks: nextTaskQueue.tasks };
      setWorkbench(hydratedWorkbench);
      setOrganizations(nextOrganizations.organizations);
      setNotifications(nextNotifications.notifications);
      setUnreadCount(nextNotifications.unreadCount);
      const first = hydratedWorkbench.tasks[0]
        ? { kind: "task" as const, id: hydratedWorkbench.tasks[0].taskId, task: hydratedWorkbench.tasks[0] }
        : nextWorkbench.approvals[0]
          ? { kind: "approval" as const, id: nextWorkbench.approvals[0].approvalRequestId, approval: nextWorkbench.approvals[0] }
          : null;
      setSelected((current) => {
        if (!current) return first;
        if (current.kind === "task") {
          const refreshed = hydratedWorkbench.tasks.find((task) => task.taskId === current.id);
          return refreshed ? { kind: "task", id: refreshed.taskId, task: refreshed } : first;
        }
        const refreshed = nextWorkbench.approvals.find(
          (approval) => approval.approvalRequestId === current.id,
        );
        return refreshed
          ? { kind: "approval", id: refreshed.approvalRequestId, approval: refreshed }
          : first;
      });
      if (nextWorkbench.principal.permissions.includes("oa.audit.read")) {
        setAudit((await oa.listAuditRecords({ limit: 100 })).records);
      } else {
        setAudit([]);
      }
    } catch (cause) {
      if (isUnauthorizedOaError(cause)) {
        invalidateSession();
        return;
      }
      setError(cause instanceof Error ? cause.message : "OA 数据加载失败");
    } finally {
      if (!options.background) setBusy(false);
    }
  }, [invalidateSession, session]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected || selected.kind !== "approval" || selected.approval.steps) return;
    let active = true;
    void oa.getApproval(selected.approval.approvalRequestId)
      .then((result) => {
        if (active) {
          setSelected({
            kind: "approval",
            id: result.approval.approvalRequestId,
            approval: result.approval,
          });
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "审批详情加载失败");
      });
    return () => {
      active = false;
    };
  }, [selected]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && realtimeState !== "live") {
        void load({ background: true });
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load, realtimeState, session]);

  useEffect(() => {
    if (!session) return;
    return subscribeOaEvents({
      onRefresh: () => void load({ background: true }),
      onState: setRealtimeState,
      onUnauthorized: invalidateSession,
    });
  }, [invalidateSession, load, session]);

  const principal = workbench?.principal;
  const visibleTasks = useMemo(
    () => (workbench?.tasks ?? []).filter((task) => selectedCity === "all" || task.cityCode === selectedCity),
    [selectedCity, workbench],
  );
  const visibleApprovals = useMemo(
    () => (workbench?.approvals ?? []).filter((item) => selectedCity === "all" || item.cityCode === selectedCity),
    [selectedCity, workbench],
  );
  const visibleActivity = useMemo(
    () => (workbench?.activities ?? []).filter((item) => selectedCity === "all" || item.cityCode === selectedCity),
    [selectedCity, workbench],
  );

  const mutateTask = async (action: "claim" | "start" | "block" | "complete" | "cancel") => {
    if (!selected || selected.kind !== "task") return;
    setBusy(true);
    setError(null);
    try {
      await oa.transitionTask(selected.task.taskId, action, {
        expectedVersion: selected.task.version,
        idempotencyKey: crypto.randomUUID(),
        reason,
        blockedReason: action === "block" ? reason : undefined,
      });
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "任务操作失败");
    } finally {
      setBusy(false);
    }
  };

  const decideApproval = async (decision: "approved" | "rejected" | "returned") => {
    if (!selected || selected.kind !== "approval") return;
    setBusy(true);
    setError(null);
    try {
      await oa.decideApproval(selected.approval.approvalRequestId, {
        expectedVersion: selected.approval.version,
        decision,
        reason,
        idempotencyKey: crypto.randomUUID(),
      });
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审批操作失败");
    } finally {
      setBusy(false);
    }
  };

  const transitionApproval = async (action: "resubmit" | "withdraw") => {
    if (!selected || selected.kind !== "approval") return;
    setBusy(true);
    setError(null);
    try {
      await oa.transitionApproval(selected.approval.approvalRequestId, action, {
        expectedVersion: selected.approval.version,
        reason,
        idempotencyKey: crypto.randomUUID(),
      });
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审批操作失败");
    } finally {
      setBusy(false);
    }
  };

  const resetPrincipalData = () => {
    setWorkbench(null);
    setOrganizations([]);
    setAudit([]);
    setNotifications([]);
    setUnreadCount(0);
    setNoticeOpen(false);
    setSelected(null);
    setSelectedCity("all");
    setComposer(null);
    setError(null);
    setRealtimeState("disconnected");
  };

  const handleLogin = (nextSession: OaSession) => {
    resetPrincipalData();
    setSession(nextSession);
  };

  const logout = async () => {
    try {
      await oa.logout();
    } catch {
      // Local session still clears if the server session is already invalid.
    }
    clearOaSession();
    resetPrincipalData();
    setSession(null);
  };

  const canInCity = (permission: keyof NonNullable<OaPrincipal["permissionCityCodes"]>) => {
    if (!principal) return false;
    const cities = principal.permissionCityCodes[permission] ?? [];
    return selectedCity === "all" ? cities.length > 0 : cities.includes(selectedCity);
  };

  const openComposer = (kind: ComposerKind) => {
    if (!principal) return;
    const permission = kind === "task" ? "oa.task.manage" : "oa.approval.request";
    const allowedCities = principal.permissionCityCodes[permission] ?? [];
    setComposer(kind);
    setDraftTitle("");
    setDraftDescription("");
    setDraftOrganizationId(principal.organization.organizationId);
    setDraftCityCode(
      selectedCity !== "all" && allowedCities.includes(selectedCity)
        ? selectedCity
        : allowedCities[0] ?? "",
    );
  };

  const createItem = async () => {
    if (!composer || !draftTitle.trim() || !draftOrganizationId || !draftCityCode) return;
    setBusy(true);
    setError(null);
    try {
      if (composer === "task") {
        await oa.createTask({
          organizationId: draftOrganizationId,
          cityCode: draftCityCode,
          title: draftTitle.trim(),
          description: draftDescription.trim() || undefined,
          priority: "normal",
          idempotencyKey: crypto.randomUUID(),
          reason,
        });
      } else {
        await oa.createApproval({
          organizationId: draftOrganizationId,
          cityCode: draftCityCode,
          requestType: "oa.general",
          title: draftTitle.trim(),
          description: draftDescription.trim() || undefined,
          requiredPermission: "oa.approval.decide",
          idempotencyKey: crypto.randomUUID(),
          reason,
        });
      }
      setComposer(null);
      await load();
      navigate(composer === "task" ? "tasks" : "approvals");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OA 事项创建失败");
    } finally {
      setBusy(false);
    }
  };

  const openNotification = async (notification: OaNotification) => {
    setError(null);
    try {
      if (!notification.readAt) {
        await oa.markNotificationRead(notification.notificationId);
        setNotifications((items) => items.map((item) => item.notificationId === notification.notificationId
          ? { ...item, readAt: new Date().toISOString() }
          : item));
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      if (notification.sourceType === "oa_task") {
        const result = await oa.getTask(notification.sourceId);
        setSelected({ kind: "task", id: result.task.taskId, task: result.task });
        navigate("workbench");
      } else if (notification.sourceType === "oa_approval") {
        const result = await oa.getApproval(notification.sourceId);
        setSelected({
          kind: "approval",
          id: result.approval.approvalRequestId,
          approval: result.approval,
        });
        navigate("workbench");
      } else if (notification.deepLink) {
        window.location.hash = notification.deepLink.replace(/^#/, "");
      }
      setNoticeOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "通知打开失败");
    }
  };

  const currentDate = new Date();
  const composerCities = composer && principal
    ? principal.permissionCityCodes[
      composer === "task" ? "oa.task.manage" : "oa.approval.request"
    ] ?? []
    : [];
  const currentMonthDay = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(currentDate).replace(/\//gu, ".");

  if (!session) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="oa-app">
      <aside className="oa-sidebar">
        <div className="oa-brand">
          <div className="oa-logo">喜</div>
          <div><strong>喜乐帮 OA</strong><span>总部运营中枢</span></div>
        </div>
        <nav aria-label="OA 主导航">
          {NAV_ITEMS.filter((item) => item.view !== "audit" || principal?.permissions.includes("oa.audit.read")).map((item) => {
            const Icon = item.icon;
            const count = item.view === "tasks"
              ? visibleTasks.filter((task) => task.status !== "completed").length
              : item.view === "approvals"
                ? visibleApprovals.filter((approval) => approval.status === "pending").length
                : 0;
            return (
              <button key={item.view} aria-label={item.label} className={view === item.view ? "is-active" : ""} onClick={() => navigate(item.view)}>
                <Icon size={20} weight={view === item.view ? "fill" : "regular"} />
                <span>{item.label}</span>
                {count > 0 && <em>{count}</em>}
              </button>
            );
          })}
        </nav>
        <div className="oa-sidebar__footer">
          <div className="oa-user-avatar"><UserCircle size={34} weight="fill" /></div>
          <div><strong>{session.username}</strong><span>{session.organizationName}</span></div>
          <button title="退出登录" onClick={logout}><SignOut size={18} /></button>
        </div>
      </aside>

      <main className="oa-main">
        <header className="oa-topbar">
          <div>
            <span className="oa-eyebrow">OPERATION COMMAND CENTER</span>
            <h1>{NAV_ITEMS.find((item) => item.view === view)?.label}</h1>
          </div>
          <div className="oa-topbar__actions">
            <label className="oa-scope-select">
              <Buildings size={18} />
              <select value={selectedCity} onChange={(event) => setSelectedCity(event.target.value)}>
                <option value="all">全部授权城市</option>
                {principal?.cityCodes.map((code) => <option key={code} value={code}>{cityLabel(code)}</option>)}
              </select>
              <CaretDown size={14} />
            </label>
            <button className="oa-icon-button" title="刷新" onClick={() => void load()} disabled={busy}>
              <ArrowClockwise size={19} className={busy ? "is-spinning" : ""} />
            </button>
            <button className="oa-icon-button" title="通知" onClick={() => setNoticeOpen((open) => !open)}>
              <Bell size={19} />
              {unreadCount > 0 && <i />}
            </button>
            <div className="oa-date">{currentDate.getFullYear()}<br /><strong>{currentMonthDay}</strong></div>
          </div>
        </header>

        {noticeOpen && (
          <aside className="oa-notice-tray">
            <div className="oa-notice-tray__header"><div><strong>通知</strong><span>{unreadCount} 条未读</span></div><button onClick={() => setNoticeOpen(false)}><X size={17} /></button></div>
            <div>
              {notifications.map((notification) => (
                <button key={notification.notificationId} className={notification.readAt ? "" : "is-unread"} onClick={() => void openNotification(notification)}>
                  <span><Bell size={16} weight={notification.readAt ? "regular" : "fill"} /></span>
                  <div><strong>{notification.title}</strong><p>{notification.body}</p><small>{formatTime(notification.createdAt)}</small></div>
                </button>
              ))}
              {notifications.length === 0 && <Empty title="暂无通知" body="任务分配和审批结果会出现在这里" />}
            </div>
          </aside>
        )}

        {error && <div className="oa-alert"><WarningCircle size={19} weight="fill" /><span>{error}</span><button onClick={() => setError(null)}><X size={16} /></button></div>}

        {view === "workbench" && (
          <Workbench
            principal={principal}
            organizations={organizations}
            tasks={visibleTasks}
            approvals={visibleApprovals}
            activities={visibleActivity}
            selected={selected}
            onSelect={setSelected}
            reason={reason}
            onReason={setReason}
            onTask={mutateTask}
            onDecision={decideApproval}
            onApprovalAction={transitionApproval}
            canManageTasks={canInCity("oa.task.manage")}
            canDecideApprovals={canInCity("oa.approval.decide") && Boolean(
              selected?.kind !== "approval" ||
              selected.approval.steps?.some(
                (step) => step.status === "pending" && canInCity(step.requiredPermission),
              ),
            )}
            busy={busy}
            realtimeState={realtimeState}
          />
        )}
        {view === "tasks" && <TaskList tasks={visibleTasks} canCreate={canInCity("oa.task.manage")} onCreate={() => openComposer("task")} onSelect={(task) => { setSelected({ kind: "task", id: task.taskId, task }); navigate("workbench"); }} />}
        {view === "approvals" && <ApprovalList approvals={visibleApprovals} canCreate={canInCity("oa.approval.request")} onCreate={() => openComposer("approval")} onSelect={(approval) => { setSelected({ kind: "approval", id: approval.approvalRequestId, approval }); navigate("workbench"); }} />}
        {view === "activity" && <ActivityList items={visibleActivity} />}
        {view === "organization" && (
          <OrganizationAdministration
            principal={principal}
            organizations={organizations}
            cityLabel={cityLabel}
            onOrganizationsChanged={load}
          />
        )}
        {view === "capabilities" && <CapabilityView principal={principal} city={selectedCity} />}
        {view === "audit" && <AuditView records={audit.filter((item) => selectedCity === "all" || item.cityCode === selectedCity)} />}
      </main>
      {composer && (
        <div className="oa-modal-backdrop" role="presentation" onMouseDown={() => setComposer(null)}>
          <section className="oa-modal" role="dialog" aria-modal="true" aria-labelledby="oa-composer-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span className="oa-eyebrow">NEW COLLABORATION ITEM</span><h2 id="oa-composer-title">{composer === "task" ? "新建协同任务" : "发起审批"}</h2></div>
              <button title="关闭" onClick={() => setComposer(null)}><X size={18} /></button>
            </header>
            <label>标题<input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={200} /></label>
            <label>事项说明<textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={4000} /></label>
            <div className="oa-modal__grid">
              <label>承办组织<select value={draftOrganizationId} onChange={(event) => setDraftOrganizationId(event.target.value)}>{organizations.map((organization) => <option key={organization.organizationId} value={organization.organizationId}>{organization.name}</option>)}</select></label>
              <label>业务城市<select value={draftCityCode} onChange={(event) => setDraftCityCode(event.target.value)}>{composerCities.map((code) => <option key={code} value={code}>{cityLabel(code)}</option>)}</select></label>
            </div>
            <label>发起理由<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></label>
            <footer><button className="oa-secondary-button" onClick={() => setComposer(null)}>取消</button><button className="oa-primary-button" disabled={busy || draftTitle.trim().length < 2 || !draftCityCode} onClick={() => void createItem()}>{busy ? "正在提交…" : composer === "task" ? "创建任务" : "提交审批"}</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function Workbench(props: {
  principal?: OaPrincipal;
  organizations: OaOrganization[];
  tasks: OaTask[];
  approvals: OaApprovalRequest[];
  activities: OaActivityItem[];
  selected: QueueItem | null;
  onSelect: (value: QueueItem) => void;
  reason: string;
  onReason: (value: string) => void;
  onTask: (action: "claim" | "start" | "block" | "complete" | "cancel") => void;
  onDecision: (decision: "approved" | "rejected" | "returned") => void;
  onApprovalAction: (action: "resubmit" | "withdraw") => void;
  canManageTasks: boolean;
  canDecideApprovals: boolean;
  busy: boolean;
  realtimeState: OaRealtimeState;
}) {
  const [queueFilter, setQueueFilter] = useState<"all" | "task" | "approval">("all");
  const [queueSearch, setQueueSearch] = useState("");
  const allQueueItems: QueueItem[] = [
    ...props.approvals.map((approval) => ({ kind: "approval" as const, id: approval.approvalRequestId, approval })),
    ...props.tasks.map((task) => ({ kind: "task" as const, id: task.taskId, task })),
  ];
  const normalizedSearch = queueSearch.trim().toLocaleLowerCase("zh-CN");
  const queue = allQueueItems.filter((item) => {
    if (queueFilter !== "all" && item.kind !== queueFilter) return false;
    const data = item.kind === "task" ? item.task : item.approval;
    return !normalizedSearch || `${data.title} ${data.description ?? ""}`.toLocaleLowerCase("zh-CN").includes(normalizedSearch);
  });
  return (
    <section className="oa-workbench">
      <div className="oa-panel oa-queue">
        <div className="oa-panel__header">
          <div><h2>待办队列</h2><span>{queue.length} / {allQueueItems.length} 项需要关注</span></div>
          <button><DotsThree size={22} /></button>
        </div>
        <div className="oa-search"><MagnifyingGlass size={17} /><input aria-label="搜索任务或审批" value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} placeholder="搜索任务或审批" /></div>
        <div className="oa-tabs">{(["all", "task", "approval"] as const).map((filter) => <button key={filter} className={queueFilter === filter ? "is-active" : ""} onClick={() => setQueueFilter(filter)}>{filter === "all" ? "全部" : filter === "task" ? "任务" : "审批"}</button>)}</div>
        <div className="oa-queue__list">
          {queue.length === 0 && <Empty title="当前没有待办" body="新的任务和审批会出现在这里" />}
          {queue.map((item) => {
            const data = item.kind === "task" ? item.task : item.approval;
            const status = data.status;
            return (
              <button key={`${item.kind}-${item.id}`} className={props.selected?.id === item.id ? "is-selected" : ""} onClick={() => props.onSelect(item)}>
                <span className={`oa-type oa-type--${item.kind}`}>{item.kind === "task" ? <ListChecks size={17} /> : <ClipboardText size={17} />}</span>
                <span className="oa-queue__copy">
                  <span><strong>{data.title}</strong><Badge value={status} /></span>
                  <small>{cityLabel(data.cityCode)} · {formatTime(item.kind === "task" ? item.task.dueAt : item.approval.submittedAt)}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="oa-panel oa-detail">
        {!props.selected ? <Empty title="选择一项待办" body="这里将展示完整上下文、处理动作与审计信息" /> : (
          <>
            <div className="oa-detail__hero">
              <span className={`oa-type oa-type--${props.selected.kind}`}>{props.selected.kind === "task" ? <ListChecks size={21} /> : <ClipboardText size={21} />}</span>
              <div>
                <span className="oa-eyebrow">{props.selected.kind === "task" ? "COLLABORATION TASK" : "APPROVAL REQUEST"}</span>
                <h2>{props.selected.kind === "task" ? props.selected.task.title : props.selected.approval.title}</h2>
                <div><Badge value={props.selected.kind === "task" ? props.selected.task.status : props.selected.approval.status} /><span>{cityLabel(props.selected.kind === "task" ? props.selected.task.cityCode : props.selected.approval.cityCode)}</span></div>
              </div>
            </div>
            <div className="oa-detail__section">
              <h3>事项说明</h3>
              <p>{props.selected.kind === "task"
                ? props.selected.task.description || "该协同任务暂无补充说明。"
                : props.selected.approval.description || "该审批申请暂无补充说明。"}</p>
            </div>
            <div className="oa-metadata">
              <div><span>发起组织</span><strong>{props.organizations.find((organization) => organization.organizationId === queueItemOrganizationId(props.selected!))?.name ?? "不可见组织"}</strong></div>
              <div><span>业务城市</span><strong>{cityLabel(props.selected.kind === "task" ? props.selected.task.cityCode : props.selected.approval.cityCode)}</strong></div>
              <div><span>版本</span><strong>v{props.selected.kind === "task" ? props.selected.task.version : props.selected.approval.version}</strong></div>
              <div><span>更新时间</span><strong>{formatTime(props.selected.kind === "task" ? props.selected.task.updatedAt : props.selected.approval.updatedAt)}</strong></div>
            </div>
            <div className="oa-timeline">
              <h3>流程轨迹</h3>
              <div><i /><span><strong>事项已进入 OA 协同流程</strong><small>所有后续动作将记录操作者、理由和状态哈希</small></span></div>
              <div><i /><span><strong>等待当前处理人决策</strong><small>权限与城市范围在服务端再次校验</small></span></div>
            </div>
            <div className="oa-actionbox">
              <label>处理说明<input value={props.reason} onChange={(event) => props.onReason(event.target.value)} /></label>
              {props.selected.kind === "task" ? (
                <div>
                  {!props.canManageTasks && <span className="oa-actionbox__hint">当前城市没有任务管理权限。</span>}
                  {props.canManageTasks && props.selected.task.status === "open" && <button className="oa-primary-button" disabled={props.busy} onClick={() => props.onTask("claim")}>认领任务</button>}
                  {props.canManageTasks && ["claimed", "blocked"].includes(props.selected.task.status) && <button className="oa-primary-button" disabled={props.busy} onClick={() => props.onTask("start")}>{props.selected.task.status === "blocked" ? "恢复处理" : "开始处理"}</button>}
                  {props.canManageTasks && props.selected.task.status === "in_progress" && <button className="oa-primary-button" disabled={props.busy} onClick={() => props.onTask("complete")}>标记完成</button>}
                  {props.canManageTasks && ["claimed", "in_progress"].includes(props.selected.task.status) && <button className="oa-secondary-button" disabled={props.busy} onClick={() => props.onTask("block")}>报告阻塞</button>}
                </div>
              ) : (
                <div>
                  {props.selected.approval.requestedByMembershipId === props.principal?.membershipId && props.selected.approval.status === "draft" && <button className="oa-primary-button" disabled={props.busy} onClick={() => props.onApprovalAction("resubmit")}>重新提交</button>}
                  {props.selected.approval.requestedByMembershipId === props.principal?.membershipId && ["draft", "pending"].includes(props.selected.approval.status) && <button className="oa-secondary-button" disabled={props.busy} onClick={() => props.onApprovalAction("withdraw")}>撤回申请</button>}
                  {(!props.canDecideApprovals || props.selected.approval.requestedByMembershipId === props.principal?.membershipId) && <span className="oa-actionbox__hint">{props.selected.approval.requestedByMembershipId === props.principal?.membershipId ? "发起人不能审批自己的申请。" : "当前城市没有审批决策权限。"}</span>}
                  <button className="oa-primary-button" disabled={props.busy || !props.canDecideApprovals || props.selected.approval.requestedByMembershipId === props.principal?.membershipId || props.selected.approval.status !== "pending"} onClick={() => props.onDecision("approved")}>同意</button>
                  <button className="oa-secondary-button" disabled={props.busy || !props.canDecideApprovals || props.selected.approval.requestedByMembershipId === props.principal?.membershipId || props.selected.approval.status !== "pending"} onClick={() => props.onDecision("returned")}>退回补充</button>
                  <button className="oa-danger-button" disabled={props.busy || !props.canDecideApprovals || props.selected.approval.requestedByMembershipId === props.principal?.membershipId || props.selected.approval.status !== "pending"} onClick={() => props.onDecision("rejected")}>拒绝</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="oa-panel oa-activity">
        <div className="oa-panel__header"><div><h2>分公司动态</h2><span>业务事件脱敏投影</span></div><span className={`oa-live-dot oa-live-dot--${props.realtimeState}`}>{props.realtimeState}</span></div>
        <div className="oa-activity__list">
          {props.activities.length === 0 && <Empty title="暂无业务动态" body="事件投影运行后会显示在这里" />}
          {props.activities.slice(0, 12).map((item) => (
            <article key={item.activityId}>
              <span className={`oa-activity__icon oa-activity__icon--${tone(item.freshness)}`}><Pulse size={17} /></span>
              <div><strong>{item.organizationName}</strong><p>{item.summary}</p><small>{cityLabel(item.cityCode)} · {formatTime(item.occurredAt)}</small></div>
              <Badge value={item.freshness} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskList({ tasks, canCreate, onCreate, onSelect }: { tasks: OaTask[]; canCreate: boolean; onCreate: () => void; onSelect: (task: OaTask) => void }) {
  return <section className="oa-page"><div className="oa-page__header"><div><h2>协同任务</h2><p>总部与分公司跨组织任务的统一队列</p></div>{canCreate && <button className="oa-primary-button" onClick={onCreate}><Plus size={15} weight="bold" />新建任务</button>}</div><div className="oa-table"><div className="oa-table__head"><span>任务</span><span>城市</span><span>优先级</span><span>状态</span><span>截止时间</span></div>{tasks.map((task) => <button key={task.taskId} onClick={() => onSelect(task)}><span><strong>{task.title}</strong><small>{task.taskId.slice(0, 12)}</small></span><span>{cityLabel(task.cityCode)}</span><span>{task.priority}</span><span><Badge value={task.status} /></span><span>{formatTime(task.dueAt)}</span></button>)}{tasks.length === 0 && <Empty title="没有符合范围的任务" body={canCreate ? "创建第一项协同任务，或切换城市范围" : "切换城市范围或等待新任务"} />}</div></section>;
}

function ApprovalList({ approvals, canCreate, onCreate, onSelect }: { approvals: OaApprovalRequest[]; canCreate: boolean; onCreate: () => void; onSelect: (approval: OaApprovalRequest) => void }) {
  return <section className="oa-page"><div className="oa-page__header"><div><h2>审批中心</h2><p>通过 maker-checker 约束的协同决策</p></div>{canCreate && <button className="oa-primary-button" onClick={onCreate}><Plus size={15} weight="bold" />发起审批</button>}</div><div className="oa-table"><div className="oa-table__head"><span>审批事项</span><span>城市</span><span>类型</span><span>状态</span><span>提交时间</span></div>{approvals.map((approval) => <button key={approval.approvalRequestId} onClick={() => onSelect(approval)}><span><strong>{approval.title}</strong><small>{approval.approvalRequestId.slice(0, 12)}</small></span><span>{cityLabel(approval.cityCode)}</span><span>{approval.requestType}</span><span><Badge value={approval.status} /></span><span>{formatTime(approval.submittedAt)}</span></button>)}{approvals.length === 0 && <Empty title="没有符合范围的审批" body={canCreate ? "发起第一项审批，或切换城市范围" : "切换城市范围或等待新申请"} />}</div></section>;
}

function ActivityList({ items }: { items: OaActivityItem[] }) {
  return <section className="oa-page"><div className="oa-page__header"><div><h2>分公司动态</h2><p>按授权城市汇总的业务事件脱敏投影</p></div></div><div className="oa-feed">{items.map((item) => <article key={item.activityId}><span className={`oa-activity__icon oa-activity__icon--${tone(item.freshness)}`}><Pulse size={20} /></span><div><span><strong>{item.organizationName}</strong><Badge value={item.freshness} /></span><h3>{item.summary}</h3><p>{item.sourceDomain} / {item.eventType}</p><small>{cityLabel(item.cityCode)} · 发生于 {formatTime(item.occurredAt)} · 投影于 {formatTime(item.projectedAt)}</small></div></article>)}{items.length === 0 && <Empty title="暂无分公司动态" body="活动投影不会影响原业务事件的消费状态" />}</div></section>;
}

function CapabilityView({ principal, city }: { principal?: OaPrincipal; city: string }) {
  const visible = CAPABILITIES.filter((capability) => (
    principal?.permissions.includes(capability.permission)
    && (
      city === "all"
      || principal.permissionCityCodes[capability.permission]?.includes(city)
    )
  ));
  const [pending, setPending] = useState<string | null>(null);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const openCapability = async (
    event: MouseEvent<HTMLAnchorElement>,
    capability: (typeof CAPABILITIES)[number],
  ) => {
    event.preventDefault();
    const cityCode = city !== "all"
      ? city
      : principal?.permissionCityCodes[capability.permission]?.[0];
    if (!cityCode) {
      setHandoffError("当前能力没有可用城市范围");
      return;
    }
    setPending(capability.permission);
    setHandoffError(null);
    try {
      const target = await createOaAdminHandoffUrl({
        targetPath: capability.href,
        permissionKey: capability.permission,
        cityCode,
      });
      window.location.assign(target);
    } catch (error) {
      setHandoffError(error instanceof Error ? error.message : "无法进入管理能力");
      setPending(null);
    }
  };
  return <section className="oa-page"><div className="oa-page__header"><div><h2>统一管理能力</h2><p>OA 按有效权限进入现有 Admin 领域能力，领域状态机仍保持唯一事实源</p>{handoffError && <small className="oa-form-error">{handoffError}</small>}</div></div><div className="oa-capability-grid">{visible.map((capability) => <a key={capability.permission} href={capability.href} aria-busy={pending === capability.permission} onClick={(event) => void openCapability(event, capability)}><span><SquaresFour size={22} weight="duotone" /></span><div><h3>{capability.title}</h3><p>{capability.body}</p><small>{pending === capability.permission ? "正在安全交接…" : capability.permission}</small></div></a>)}{visible.length === 0 && <Empty title="当前身份没有管理域权限" body="请由组织管理员调整角色或委派范围" />}</div></section>;
}

function AuditView({ records }: { records: OaAuditRecord[] }) {
  return <section className="oa-page"><div className="oa-page__header"><div><h2>审计记录</h2><p>访问决策、写操作理由与目标对象的不可变记录</p></div></div><div className="oa-table oa-table--audit"><div className="oa-table__head"><span>动作</span><span>目标</span><span>城市</span><span>决策</span><span>时间</span></div>{records.map((record) => <div key={record.auditId}><span><strong>{record.action}</strong><small>{record.reasonCode}</small></span><span>{record.targetType}<small>{record.targetId ?? "—"}</small></span><span>{record.cityCode ? cityLabel(record.cityCode) : "全局"}</span><span><Badge value={record.decision} /></span><span>{formatTime(record.createdAt)}</span></div>)}{records.length === 0 && <Empty title="当前范围没有审计记录" body="有权限的业务操作会留痕到这里" />}</div></section>;
}
