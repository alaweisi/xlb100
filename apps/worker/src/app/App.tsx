import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  BottomNav,
  Button,
  Card,
  EmptyState,
  ErrorState,
  MobileShell,
  SearchBar,
  StatCard,
  StatusTag,
  Tabs,
  Timeline,
  TopBar,
  WorkerTaskCard,
} from "@xlb/ui";

type WorkerRoute = "hall" | "tasks" | "wallet" | "profile";

const routeConfig: Record<WorkerRoute, { label: string; href: string; title: string; subtitle: string }> = {
  hall: { label: "接单", href: "/worker/", title: "接单大厅", subtitle: "Worker / GrabHall / Online" },
  tasks: { label: "任务", href: "/worker/tasks", title: "我的任务", subtitle: "Worker / Tasks / Accepted" },
  wallet: { label: "收入", href: "/worker/wallet", title: "收入", subtitle: "Worker / Income / Default" },
  profile: { label: "我的", href: "/worker/profile", title: "我的", subtitle: "Worker / Mine / Default" },
};

const shellStyle = {
  "--xlb-role-accent": "#08172B",
  background: "linear-gradient(180deg, #eef6ff 0%, #f8fafc 45%, #f9fafb 100%)",
  minHeight: "100vh",
} as CSSProperties;

const grid = { display: "grid", gap: 14 } as CSSProperties;
const helperText = { color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 } as CSSProperties;
const workerAccent = "#08172B";

function currentRoute(): WorkerRoute {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.endsWith("/worker/tasks")) return "tasks";
  if (path.endsWith("/worker/wallet")) return "wallet";
  if (path.endsWith("/worker/profile") || path.endsWith("/worker/certification")) return "profile";
  return "hall";
}

function HelperText({ children }: { children: ReactNode }) {
  return <p style={helperText}>{children}</p>;
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p style={{ color: workerAccent, fontSize: 12, fontWeight: 800, letterSpacing: 0, margin: 0 }}>{children}</p>;
}

function AppFrame({ route, children }: { route: WorkerRoute; children: ReactNode }) {
  return (
    <div data-role="worker" style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh" }}>
        <MobileShell
          topBar={
            <TopBar
              title={routeConfig[route].title}
              subtitle={routeConfig[route].subtitle}
              actions={<StatusTag tone="warning">not-wired</StatusTag>}
            />
          }
          bottomNav={
            <BottomNav
              items={(Object.keys(routeConfig) as WorkerRoute[]).map((key) => ({
                key,
                label: routeConfig[key].label,
                active: key === route,
                href: routeConfig[key].href,
              }))}
            />
          }
          contentStyle={{ padding: 14 }}
        >
          <div style={grid}>{children}</div>
        </MobileShell>
      </div>
    </div>
  );
}

function HallPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("nearby");

  return (
    <>
      <Card style={{ background: "#eef6ff", borderColor: "#bfdbfe", boxShadow: "0 16px 38px rgba(8, 23, 43, 0.12)" }}>
        <div style={{ display: "grid", gap: 10 }}>
          <Eyebrow>服务城市 / 资质 / 在线状态</Eyebrow>
          <h1 style={{ color: "#0f172a", fontSize: 28, lineHeight: "36px", margin: 0 }}>接单工作台</h1>
          <HelperText>本阶段只做 Figma 初装修。任务池、在线资格、抢单动作尚未接真实 W 端 API，因此保持 not-wired。</HelperText>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatusTag tone="warning">task pool not-wired</StatusTag>
            <StatusTag tone="warning">eligibility not-wired</StatusTag>
            <StatusTag tone="muted">no local sample orders</StatusTag>
          </div>
        </div>
      </Card>

      <SearchBar value={query} onChange={setQuery} placeholder="搜索工单号、地址或服务" disabled leadingIcon="⌕" />

      <Tabs
        activeKey={active}
        onChange={setActive}
        density="compact"
        items={[
          { key: "nearby", label: "附近" },
          { key: "urgent", label: "急单" },
          { key: "watched", label: "关注" },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatCard label="今日可抢" value="--" hint="等待任务池 API" tone="muted" />
        <StatCard label="在线资格" value="--" hint="等待资质 API" tone="muted" />
      </div>

      <WorkerTaskCard
        title="任务池未接入"
        status={<StatusTag tone="muted">empty</StatusTag>}
        location="真实任务将受服务城市、资质、距离约束"
        timeWindow="不会展示本地样例工单"
        meta="Phase 15.4 需接入真实 worker API"
        actions={<Button disabled>等待真实 API</Button>}
      >
        <Timeline
          items={[
            { key: "city", title: "城市范围", description: "必须由后端返回或请求上下文确认" },
            { key: "cert", title: "师傅资质", description: "不得在前端伪造可接单资格" },
            { key: "pool", title: "任务池", description: "真实任务池 API 未接入前保持空态" },
          ]}
        />
      </WorkerTaskCard>

      <EmptyState title="暂无真实任务" description="接入任务池 API 前，这里保持 empty / not-wired 状态。" />
    </>
  );
}

function TasksPage() {
  return (
    <>
      <Card title="任务状态" actions={<StatusTag tone="warning">not-wired</StatusTag>}>
        <HelperText>已接任务、履约中、待完工等状态必须来自真实任务详情与履约 API，本阶段不生成本地状态。</HelperText>
      </Card>
      <WorkerTaskCard
        title="我的任务"
        status={<StatusTag tone="muted">empty</StatusTag>}
        location="任务详情 API 未接入"
        timeWindow="出发、到达、服务、完工动作不可用"
        meta="不会伪造已接单任务"
      />
      <ErrorState title="任务详情未接线" description="履约动作必须等待真实 API；当前只保留页面壳和可读状态。" />
    </>
  );
}

function WalletPage() {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatCard label="本周收益" value="--" hint="等待真实收入 API" tone="muted" />
        <StatCard label="完成任务" value="--" hint="等待履约数据" tone="muted" />
      </div>
      <Card title="收入明细" actions={<StatusTag tone="warning">not-wired</StatusTag>}>
        <Timeline
          items={[
            { key: "summary", title: "收益概览", description: "等待 worker income API" },
            { key: "settlement", title: "结算记录", description: "不得展示本地示例结算" },
            { key: "withdraw", title: "提现能力", description: "本阶段不接入、不暗示可用" },
          ]}
        />
      </Card>
      <EmptyState title="收益未接入" description="不展示本地示例收入、提现或结算状态。" />
    </>
  );
}

function ProfilePage() {
  return (
    <>
      <Card title="师傅资料" actions={<StatusTag tone="warning">not-wired</StatusTag>}>
        <HelperText>资料、认证材料、服务城市入口已按 Figma 信息架构占位，但状态必须等待真实 W 端 API。</HelperText>
      </Card>
      <Card title="认证与服务能力">
        <Timeline
          items={[
            { key: "identity", title: "身份认证", description: "认证状态 API 未接入" },
            { key: "skill", title: "服务能力", description: "服务类目与城市绑定未接入" },
            { key: "settings", title: "账号设置", description: "登录态和安全设置未接入" },
          ]}
        />
      </Card>
      <EmptyState title="认证资料未接入" description="不展示本地样例身份、资质状态或服务城市。" />
    </>
  );
}

export function App() {
  const route = useMemo(currentRoute, []);
  const content: Record<WorkerRoute, ReactNode> = {
    hall: <HallPage />,
    tasks: <TasksPage />,
    wallet: <WalletPage />,
    profile: <ProfilePage />,
  };

  return <AppFrame route={route}>{content[route]}</AppFrame>;
}
