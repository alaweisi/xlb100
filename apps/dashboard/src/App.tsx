import {
  ArrowsClockwise,
  ChartLineUp,
  CheckCircle,
  Clock,
  GlobeHemisphereEast,
  Headset,
  LockKey,
  MapPin,
  PlugsConnected,
  Receipt,
  ShieldCheck,
  SignOut,
  Siren,
  User,
  WarningCircle,
  WifiHigh,
  Wrench,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DashboardAttentionItem,
  DashboardCityHealth,
  DashboardFreshness,
  DashboardRealtimeSnapshot,
} from "@xlb/types";
import {
  clearDashboardSession,
  dashboardApi,
  loginDashboard,
  readDashboardDebugCode,
  readDashboardSession,
  requestDashboardCode,
  type DashboardSession,
} from "./api";

type ConnectionState = DashboardFreshness | "connecting";

const numberFormat = new Intl.NumberFormat("zh-CN");
const moneyFormat = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

const formatNumber = (value: number) => numberFormat.format(value);
const formatMoney = (value: string) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `¥ ${moneyFormat.format(amount)}` : "—";
};
const timeLabel = (value: string) => new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date(value));
const clockLabel = (date: Date) => new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(date);

function formatDuration(value: number | null): string {
  if (value === null) return "—";
  const hours = Math.floor(value / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  const seconds = Math.max(0, Math.floor(value % 60));
  return hours > 0
    ? `${hours}时${String(minutes).padStart(2, "0")}分`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function freshnessLabel(state: ConnectionState, ageSeconds: number): string {
  if (state === "connecting") return "正在连接";
  if (state === "disconnected") return "连接中断";
  if (state === "stale") return `数据已过期 · ${ageSeconds}秒`;
  if (state === "partial") return "部分数据可用";
  return `实时 · ${ageSeconds}秒前`;
}

function freshnessAt(
  snapshot: DashboardRealtimeSnapshot | null,
  now: Date,
  fetchFailed: boolean,
): { state: ConnectionState; ageSeconds: number } {
  if (!snapshot) return { state: "connecting", ageSeconds: 0 };
  const ageSeconds = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(snapshot.observedAt)) / 1_000),
  );
  if (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    ageSeconds >= snapshot.disconnectedAfterSeconds
  ) {
    return { state: "disconnected", ageSeconds };
  }
  if (fetchFailed || ageSeconds >= snapshot.staleAfterSeconds) {
    return { state: "stale", ageSeconds };
  }
  return { state: "live", ageSeconds };
}

function LoginScreen({ onLogin }: { onLogin: (session: DashboardSession) => void }) {
  const [username, setUsername] = useState("admin_global");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("使用总部只读运营身份登录");
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setBusy(true);
    try {
      const result = await requestDashboardCode(username.trim());
      const debug = await readDashboardDebugCode(username.trim());
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
      onLogin(await loginDashboard(username.trim(), code.trim()));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dashboard-login">
      <section className="dashboard-login__brand">
        <div className="dashboard-logo dashboard-logo--large">XLB</div>
        <p>喜乐帮 · 总部实时运营中心</p>
        <h1>让每一次交易、履约与服务异常<br />都能被及时看见</h1>
        <ul>
          <li><CheckCircle size={20} weight="fill" /> 六大业务事实源聚合</li>
          <li><CheckCircle size={20} weight="fill" /> 全国与城市运营健康度</li>
          <li><CheckCircle size={20} weight="fill" /> 只读访问，不含个人敏感信息</li>
        </ul>
      </section>
      <section className="dashboard-login__panel">
        <div className="dashboard-login__card">
          <LockKey size={34} weight="duotone" />
          <div>
            <span>READ-ONLY OPERATIONS WALLBOARD</span>
            <h2>登录实时大屏</h2>
            <p>{notice}</p>
          </div>
          <label>
            总部账号
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            验证码
            <div>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <button type="button" onClick={requestCode} disabled={busy || !username.trim()}>
                获取验证码
              </button>
            </div>
          </label>
          <button
            className="dashboard-primary-action"
            type="button"
            onClick={submit}
            disabled={busy || !username.trim() || !code.trim()}
          >
            {busy ? "正在验证…" : "进入全国运营态势"}
          </button>
          <small>会话仅保存在当前浏览器标签页，关闭后自动清除。</small>
        </div>
      </section>
    </main>
  );
}

function Kpi({
  label,
  value,
  unit,
  window,
  warning = false,
}: {
  label: string;
  value: string;
  unit?: string;
  window: string;
  warning?: boolean;
}) {
  return (
    <article className={`dashboard-kpi${warning ? " dashboard-kpi--warning" : ""}`}>
      <span>{label}</span>
      <small>{window}</small>
      <strong>{value} {unit && <em>{unit}</em>}</strong>
      <p>{warning ? "需要调度关注" : "来自权威业务事实"}</p>
    </article>
  );
}

function AttentionRow({ item }: { item: DashboardAttentionItem }) {
  const Icon = item.severity === "critical"
    ? Siren
    : item.severity === "warning"
      ? WarningCircle
      : ShieldCheck;
  return (
    <article className={`attention-row attention-row--${item.severity}`}>
      <Icon size={29} weight="fill" aria-hidden="true" />
      <div className="attention-row__title">
        <strong>{item.title}</strong>
        <span>{item.detail}</span>
      </div>
      <div>
        <strong>{item.cityLabel}</strong>
        <span>{item.count > 0 ? `${formatNumber(item.count)} 项` : "运行正常"}</span>
      </div>
      <div>
        <strong>{item.ageSeconds === null ? "刚刚" : formatDuration(item.ageSeconds)}</strong>
        <span>责任人：{item.owner}</span>
      </div>
    </article>
  );
}

type MiniTone = "blue" | "cyan" | "green" | "amber" | "red";

function MiniMetric({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: typeof Wrench;
  label: string;
  value: string;
  tone?: MiniTone;
}) {
  return (
    <div className={`mini-metric mini-metric--${tone}`}>
      <Icon size={25} weight="duotone" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CityState({ state }: { state: DashboardCityHealth["state"] }) {
  const label = {
    healthy: "健康",
    warning: "预警",
    critical: "需关注",
    no_data: "无数据",
  }[state];
  return <span className={`city-state city-state--${state}`}><i />{label}</span>;
}

function PulseChart({ snapshot }: { snapshot: DashboardRealtimeSnapshot }) {
  const pulse = useMemo(
    () => snapshot.pulse.map((point) => ({ ...point, time: timeLabel(point.bucketStart) })),
    [snapshot.pulse],
  );
  return (
    <article className="dashboard-panel pulse-panel">
      <header>
        <div><h2>订单与交易脉搏</h2><span>最近 60 分钟 · 5 分钟粒度</span></div>
        <div className="chart-summary"><ChartLineUp size={18} />{pulse.length} 个有效时间桶</div>
      </header>
      <div className="pulse-chart" aria-label="最近六十分钟订单、支付和履约完成趋势图">
        {pulse.length === 0 ? (
          <div className="chart-empty">
            <ChartLineUp size={34} />
            <strong>最近 60 分钟暂无业务事件</strong>
            <span>当前不是错误状态，新事件出现后会自动更新。</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pulse} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="rgba(145, 180, 214, 0.18)" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="time" stroke="#8ba7c3" tickLine={false} axisLine={false} minTickGap={36} />
              <YAxis stroke="#8ba7c3" tickLine={false} axisLine={false} allowDecimals={false} />
              <Legend iconType="line" wrapperStyle={{ color: "#c7d8ea", fontSize: 13 }} />
              <Line type="monotone" dataKey="ordersCreated" name="新订单（单）" stroke="#3b82f6" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="paymentsPaid" name="已支付（单）" stroke="#22d3ee" strokeWidth={3} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="fulfillmentsCompleted" name="履约完成（单）" stroke="#22c55e" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}

export function DashboardWallboard({
  snapshot,
  connection,
  ageSeconds,
  clock,
  session,
  onRetry,
  onLogout,
}: {
  snapshot: DashboardRealtimeSnapshot;
  connection: ConnectionState;
  ageSeconds: number;
  clock: Date;
  session: DashboardSession;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="dashboard-wallboard">
      <header className="dashboard-header">
        <div className="dashboard-title">
          <div className="dashboard-logo">XLB</div>
          <h1>喜乐帮 · 全国实时运营态势</h1>
        </div>
        <div className="dashboard-header__status">
          <span><GlobeHemisphereEast size={25} />{snapshot.scope.label}</span>
          <time>{clockLabel(clock)}</time>
          <button
            className={`freshness freshness--${connection}`}
            onClick={connection === "live" ? undefined : onRetry}
            aria-label={connection === "live" ? "数据连接正常" : "重新连接"}
          >
            {connection === "disconnected"
              ? <WarningCircle size={19} />
              : <WifiHigh size={19} />}
            {freshnessLabel(connection, ageSeconds)}
          </button>
          <button className="session-button" title={`退出 ${session.username}`} onClick={onLogout}>
            <User size={18} /><span>{session.username}</span><SignOut size={18} />
          </button>
        </div>
      </header>

      {connection !== "live" && (
        <section className={`connection-banner connection-banner--${connection}`} role="status">
          <WarningCircle size={20} weight="fill" />
          <strong>{connection === "disconnected" ? "实时连接已中断" : "数据刷新延迟"}</strong>
          <span>当前保留最后一次可信快照，时间为 {timeLabel(snapshot.observedAt)}，不会显示为实时数据。</span>
          <button onClick={onRetry}><ArrowsClockwise size={17} />立即重试</button>
        </section>
      )}

      <section className="dashboard-kpis" aria-label="核心运营指标">
        <Kpi label="今日订单" value={formatNumber(snapshot.headline.ordersToday)} unit="单" window="今日 00:00—当前" />
        <Kpi label="已支付金额" value={formatMoney(snapshot.headline.paidAmountToday)} window="今日 00:00—当前" />
        <Kpi label="支付成功率" value={snapshot.headline.paymentSuccessRate === null ? "—" : `${snapshot.headline.paymentSuccessRate.toFixed(2)}%`} window="今日支付单" />
        <Kpi label="履约中" value={formatNumber(snapshot.headline.fulfillmentActive)} unit="单" window="截至当前" />
        <Kpi label="待派单" value={formatNumber(snapshot.headline.dispatchPending)} unit="单" window="截至当前" warning={snapshot.headline.dispatchPending > 0} />
        <Kpi label="今日完成" value={formatNumber(snapshot.headline.completedToday)} unit="单" window="今日 00:00—当前" />
      </section>

      <section className="dashboard-primary-grid">
        <PulseChart snapshot={snapshot} />
        <article className="dashboard-panel attention-panel">
          <header>
            <div><h2>需立即关注</h2><span>按业务影响和持续时间排序</span></div>
            <strong>{snapshot.attention.filter((item) => item.severity !== "info").length} 项</strong>
          </header>
          <div className="attention-list">
            {snapshot.attention.map((item) => <AttentionRow key={item.id} item={item} />)}
          </div>
        </article>
      </section>

      <section className="dashboard-secondary-grid">
        <article className="dashboard-panel summary-panel">
          <header><div><h2>维修履约</h2><span>截至当前</span></div><Wrench size={22} /></header>
          <div className="mini-metric-grid">
            <MiniMetric icon={Receipt} label="待派单" value={formatNumber(snapshot.fulfillment.pendingDispatch)} tone="amber" />
            <MiniMetric icon={User} label="待接单" value={formatNumber(snapshot.fulfillment.pendingAcceptance)} />
            <MiniMetric icon={Wrench} label="服务中" value={formatNumber(snapshot.fulfillment.serviceActive)} tone="cyan" />
            <MiniMetric icon={CheckCircle} label="今日完成" value={formatNumber(snapshot.fulfillment.completedToday)} tone="green" />
          </div>
          <footer>最长待派 <strong>{formatDuration(snapshot.fulfillment.longestPendingSeconds)}</strong></footer>
        </article>

        <article className="dashboard-panel summary-panel">
          <header><div><h2>投诉与返修</h2><span>未关闭事项</span></div><Siren size={22} /></header>
          <div className="mini-metric-grid">
            <MiniMetric icon={Receipt} label="未分诊" value={formatNumber(snapshot.aftersale.untriaged)} tone="red" />
            <MiniMetric icon={ArrowsClockwise} label="处理中" value={formatNumber(snapshot.aftersale.active)} tone="amber" />
            <MiniMetric icon={WarningCircle} label="紧急与重大" value={formatNumber(snapshot.aftersale.urgentOrCritical)} tone="red" />
            <MiniMetric icon={Wrench} label="待返修" value={formatNumber(snapshot.aftersale.pendingRepair)} tone="cyan" />
          </div>
          <footer>仅展示聚合数量 <strong>无投诉正文</strong></footer>
        </article>

        <article className="dashboard-panel summary-panel">
          <header><div><h2>即时客服</h2><span>会话与工单</span></div><Headset size={22} /></header>
          <div className="mini-metric-grid">
            <MiniMetric icon={Headset} label="排队会话" value={formatNumber(snapshot.support.queueingConversations)} />
            <MiniMetric icon={User} label="在线客服" value={formatNumber(snapshot.support.onlineAgents)} tone="cyan" />
            <MiniMetric icon={Clock} label="最长等待" value={formatDuration(snapshot.support.oldestWaitSeconds)} tone="amber" />
            <MiniMetric icon={CheckCircle} label="今日解决" value={formatNumber(snapshot.support.resolvedToday)} tone="green" />
          </div>
          <footer>SLA 超时 <strong className={snapshot.support.slaBreached > 0 ? "text-danger" : ""}>{formatNumber(snapshot.support.slaBreached)}</strong></footer>
        </article>

        <article className="dashboard-panel city-panel">
          <header><div><h2>城市健康度</h2><span>按风险优先</span></div><MapPin size={22} /></header>
          <div className="city-table">
            <div className="city-table__head"><span>城市</span><span>今日订单</span><span>逾期</span><span>状态</span></div>
            {snapshot.cities.length === 0 ? (
              <div className="city-empty">当前范围没有已开放城市数据</div>
            ) : snapshot.cities.slice(0, 4).map((city) => (
              <div key={city.cityCode}>
                <strong>{city.cityName}</strong>
                <span>{formatNumber(city.ordersToday)}</span>
                <span>{formatNumber(city.overdueCount)}</span>
                <CityState state={city.state} />
              </div>
            ))}
          </div>
        </article>
      </section>

      <footer className="dashboard-footer">
        <strong>数据来源与新鲜度</strong>
        {snapshot.sources.map((source) => (
          <span key={source.source}>
            <i className={`source-dot source-dot--${source.state}`} />
            {source.label}
            <small>{source.lagSeconds}秒前</small>
          </span>
        ))}
        <span className="privacy-mark"><ShieldCheck size={20} />无个人敏感信息</span>
      </footer>
    </main>
  );
}

function LoadingScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="dashboard-loading" aria-busy="true">
      <div className="dashboard-logo dashboard-logo--large">XLB</div>
      <PlugsConnected size={48} weight="duotone" />
      <h1>正在连接实时运营数据</h1>
      <p>正在验证六个只读事实源，请稍候。</p>
      <button onClick={onLogout}>返回登录</button>
    </main>
  );
}

function ErrorScreen({
  message,
  onRetry,
  onLogout,
}: {
  message: string;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <main className="dashboard-loading dashboard-loading--error" role="alert">
      <WarningCircle size={48} weight="fill" />
      <h1>暂时无法读取运营快照</h1>
      <p>{message}</p>
      <div>
        <button onClick={onRetry}><ArrowsClockwise size={18} />重新连接</button>
        <button onClick={onLogout}>退出登录</button>
      </div>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<DashboardSession | null>(
    () => readDashboardSession(),
  );
  const [snapshot, setSnapshot] = useState<DashboardRealtimeSnapshot | null>(null);
  const [clock, setClock] = useState(new Date());
  const [fetchFailed, setFetchFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const cityCode = new URLSearchParams(window.location.search).get("cityCode") || undefined;
      const result = await dashboardApi.getRealtimeSnapshot(cityCode);
      setSnapshot(result.snapshot);
      setFetchFailed(false);
      setError(null);
    } catch (cause) {
      setFetchFailed(true);
      setError(cause instanceof Error ? cause.message : "Dashboard realtime request failed");
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [refresh, session]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    const online = () => {
      setClock(new Date());
      void refresh();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, [refresh]);

  const logout = useCallback(() => {
    clearDashboardSession();
    setSession(null);
    setSnapshot(null);
    setError(null);
  }, []);

  if (!session) return <LoginScreen onLogin={setSession} />;
  if (!snapshot && !error) return <LoadingScreen onLogout={logout} />;
  if (!snapshot) {
    return <ErrorScreen message={error ?? "未知错误"} onRetry={refresh} onLogout={logout} />;
  }

  const freshness = freshnessAt(snapshot, clock, fetchFailed);
  return (
    <DashboardWallboard
      snapshot={snapshot}
      connection={freshness.state}
      ageSeconds={freshness.ageSeconds}
      clock={clock}
      session={session}
      onRetry={refresh}
      onLogout={logout}
    />
  );
}
