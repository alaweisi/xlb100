import { useCallback, useEffect, useMemo, useState } from "react";
import { createApiClient, createAuthApi, createDashboardApi } from "@xlb/api-client";
import type { DashboardOperationsSnapshot } from "@xlb/types";
import { Button, FormField, Input } from "@xlb/ui";

type EndpointState = { ok: boolean; status: number; data: Record<string, unknown> | null };
type Snapshot = {
  capturedAt: number;
  endpoints: Record<string, EndpointState>;
  operations: DashboardOperationsSnapshot | null;
};

const SYSTEM_ENDPOINTS = ["/health", "/health/ready", "/api/system/status"] as const;
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const TOKEN_KEY = "xlb.dashboard.token";
const USERNAME_KEY = "xlb.dashboard.username";

async function readEndpoint(path: string): Promise<EndpointState> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: { Accept: "application/json" } });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function text(value: unknown, fallback = "未提供"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function cityName(cityCode: string): string {
  if (cityCode === "hangzhou") return "杭州";
  if (cityCode === "shanghai") return "上海";
  if (cityCode === "beijing") return "北京";
  return cityCode;
}

function readToken(): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_KEY) ?? "";
}

export function App() {
  const [token, setToken] = useState(readToken);
  const [username, setUsername] = useState(() => window.localStorage.getItem(USERNAME_KEY) ?? "oa_global");
  const [code, setCode] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const requestCode = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
      const result = await auth.requestDashboardLoginCode(username.trim());
      if (!result.ok) throw new Error(result.error);
      window.localStorage.setItem(USERNAME_KEY, username.trim());
      setAuthNotice(`验证码已发送，${result.ttlSeconds} 秒内有效。`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "验证码发送失败，请稍后重试");
    } finally {
      setAuthBusy(false);
    }
  }, [username]);

  const login = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const auth = createAuthApi(createApiClient({ baseUrl: API_BASE }));
      const result = await auth.dashboardLogin(username.trim(), code.trim());
      if (!result.ok) throw new Error(result.error);
      window.localStorage.setItem(TOKEN_KEY, result.token);
      window.localStorage.setItem(USERNAME_KEY, username.trim());
      setToken(result.token);
      setCode("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "大屏身份验证失败");
    } finally {
      setAuthBusy(false);
    }
  }, [code, username]);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setSnapshot(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    setRefreshing(true);
    const client = createApiClient({
      baseUrl: API_BASE,
      headers: { Authorization: `Bearer ${token}` },
    });
    const [systemResults, operationsResult] = await Promise.all([
      Promise.all(SYSTEM_ENDPOINTS.map(readEndpoint)),
      createDashboardApi(client).getOperations().catch((error: unknown) => {
        if (error && typeof error === "object" && "status" in error && Number((error as { status?: number }).status) === 401) logout();
        return null;
      }),
    ]);
    setSnapshot({
      capturedAt: Date.now(),
      endpoints: Object.fromEntries(SYSTEM_ENDPOINTS.map((path, index) => [path, systemResults[index]])),
      operations: operationsResult?.ok ? operationsResult.snapshot : null,
    });
    setRefreshing(false);
  }, [logout, token]);

  useEffect(() => {
    if (!token) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [refresh, token]);

  const state = useMemo(() => {
    if (!snapshot) return "loading";
    const healthy = Object.values(snapshot.endpoints).filter((item) => item.ok).length;
    if (now - snapshot.capturedAt > 45_000) return "stale";
    if (healthy === 0 || !snapshot.operations) return "disconnected";
    if (healthy < SYSTEM_ENDPOINTS.length) return "partial";
    return "live";
  }, [now, snapshot]);

  if (!token) {
    return (
      <main className="wallboard wallboard-auth">
        <section className="dashboard-auth-panel" aria-labelledby="dashboard-auth-title">
          <span className="eyebrow">总部只读大屏</span>
          <h1 id="dashboard-auth-title">验证大屏访问身份</h1>
          <p>只接受总部全局管理员账号。大屏会获得独立的只读令牌，不复用 OA 或移动后台会话。</p>
          <div className="dashboard-auth-form">
            <FormField label="总部账号"><Input value={username} onChange={(event) => setUsername(event.target.value)} /></FormField>
            <FormField label="短信验证码"><Input value={code} onChange={(event) => setCode(event.target.value)} /></FormField>
          </div>
          {authNotice ? <div className="dashboard-auth-notice" role="status">{authNotice}</div> : null}
          {authError ? <div className="dashboard-auth-error" role="alert">{authError}</div> : null}
          <div className="dashboard-auth-actions">
            <Button disabled={authBusy || !username.trim()} onClick={() => void requestCode()}>获取验证码</Button>
            <Button variant="primary" disabled={authBusy || !username.trim() || !code.trim()} onClick={() => void login()}>进入实时大屏</Button>
          </div>
        </section>
      </main>
    );
  }

  const ready = snapshot?.endpoints["/health/ready"];
  const system = snapshot?.endpoints["/api/system/status"];
  const health = snapshot?.endpoints["/health"];
  const operations = snapshot?.operations;
  const apps = Array.isArray(system?.data?.apps) ? system.data.apps.filter((item): item is string => typeof item === "string") : [];
  const updated = snapshot ? new Date(snapshot.capturedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "等待首轮采集";

  const metrics = [
    ["今日订单", operations?.totals.todayOrders, "今日创建"],
    ["进行中订单", operations?.totals.activeOrders, "尚未终态"],
    ["今日完成", operations?.totals.completedToday, "服务完成或已支付"],
    ["待派单处理", operations?.totals.pendingDispatch, "含人工复核"],
    ["待处理客服", operations?.totals.openSupportTickets, "未解决工单"],
    ["待处理售后", operations?.totals.openAftersaleComplaints, "未结案投诉"],
  ] as const;

  return (
    <main className="wallboard">
      <header className="wallboard-header">
        <div><span className="eyebrow">总部实时运营中心</span><h1>喜乐帮运营态势</h1></div>
        <div className={`live-pill ${state}`}><i />{state === "live" ? "实时连接" : state === "loading" ? "正在连接" : state === "partial" ? "部分信号异常" : state === "stale" ? "数据已过期" : "连接已中断"}</div>
        <div className="clock"><strong>{new Date(now).toLocaleTimeString("zh-CN", { hour12: false })}</strong><span>上次采集 {updated} · 15 秒刷新</span><button type="button" onClick={logout}>退出大屏</button></div>
      </header>

      {state === "loading" ? <section className="state-panel" aria-busy="true"><strong>正在读取总部实时运营数据</strong><span>不会以演示数字代替真实业务数据。</span></section> : null}
      {state === "disconnected" ? <section className="state-panel danger"><strong>实时数据连接中断</strong><span>运营聚合或系统状态不可用，画面不会继续显示为正常。</span><button onClick={() => void refresh()} disabled={refreshing}>立即重连</button></section> : null}

      <section className="operations-grid" aria-label="实时运营指标">
        {metrics.map(([label, value, hint], index) => (
          <article className={`signal-card ${index === 0 ? "hero-card" : ""}`} key={label}>
            <span>{label}</span><strong>{value ?? "—"}</strong><small>{hint}</small>
          </article>
        ))}
      </section>

      <section className="wallboard-lower">
        <article className="surface-panel city-operations-panel">
          <header><div><span className="eyebrow">城市运营分布</span><h2>各城市实时业务</h2></div><b>{operations?.cities.length ?? 0}</b></header>
          {operations?.cities.length ? (
            <div className="city-operations-table" role="table" aria-label="城市运营指标">
              <div role="row" className="city-row city-row-head"><span>城市</span><span>今日订单</span><span>进行中</span><span>待派单</span><span>客服</span><span>售后</span></div>
              {operations.cities.map((city) => <div role="row" className="city-row" key={city.cityCode}><strong>{cityName(city.cityCode)}</strong><span>{city.todayOrders}</span><span>{city.activeOrders}</span><span>{city.pendingDispatch}</span><span>{city.openSupportTickets}</span><span>{city.openAftersaleComplaints}</span></div>)}
            </div>
          ) : <div className="empty-state">服务端没有返回城市运营聚合，不以默认值冒充业务数据。</div>}
        </article>
        <article className="freshness-panel">
          <header><span className="eyebrow">数据源状态</span><h2>新鲜度与运行状态</h2></header>
          <div className="source-row"><code>运营只读聚合</code><span className={operations ? "ok" : "error"}>{operations ? "可用" : "断开"}</span></div>
          {SYSTEM_ENDPOINTS.map((path) => { const endpoint = snapshot?.endpoints[path]; return <div className="source-row" key={path}><code>{path}</code><span className={endpoint?.ok ? "ok" : "error"}>{endpoint?.ok ? "可用" : endpoint?.status ? `HTTP ${endpoint.status}` : "断开"}</span></div>; })}
          <p>运营指标来自 MySQL 只读聚合；画面显示采集时间、过期、部分失败和断流状态，不提供任何业务写操作。</p>
          <div className="system-summary"><span>后端服务</span><strong>{health?.ok ? text(health.data?.service, "在线") : "不可用"}</strong><span>数据库</span><strong>{text(ready?.data?.mysql, "未知") === "ok" ? "正常" : "异常"}</strong><span>Redis</span><strong>{text(ready?.data?.redis, "未知") === "ok" ? "正常" : "异常"}</strong><span>五端登记</span><strong>{apps.length}/5</strong></div>
        </article>
      </section>
    </main>
  );
}
