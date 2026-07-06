import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Badge,
  BottomNav,
  Card,
  EmptyState,
  ErrorState,
  MobileShell,
  SearchBar,
  StatCard,
  Tabs,
  TopBar,
  WorkerTaskCard,
} from "@xlb/ui";

type WorkerRoute = "hall" | "tasks" | "wallet" | "profile";

const routeConfig: Record<WorkerRoute, { label: string; href: string; title: string }> = {
  hall: { label: "接单", href: "/worker/", title: "接单工作台" },
  tasks: { label: "任务", href: "/worker/tasks", title: "我的任务" },
  wallet: { label: "收入", href: "/worker/wallet", title: "收益" },
  profile: { label: "我的", href: "/worker/profile", title: "师傅资料" },
};

const shellStyle = {
  "--xlb-role-accent": "#08172B",
  background: "#FFFAF0",
  minHeight: "100vh",
} as CSSProperties;

function currentRoute(): WorkerRoute {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.endsWith("/worker/tasks")) return "tasks";
  if (path.endsWith("/worker/wallet")) return "wallet";
  if (path.endsWith("/worker/profile") || path.endsWith("/worker/certification")) return "profile";
  return "hall";
}

function AppFrame({ route, children }: { route: WorkerRoute; children: ReactNode }) {
  return (
    <div style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh" }}>
        <MobileShell
          topBar={<TopBar title={routeConfig[route].title} actions={<Badge tone="warning">not-wired</Badge>} />}
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
        >
          <div style={{ display: "grid", gap: 16 }}>{children}</div>
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
      <Card>
        <p style={{ color: "#08172B", fontSize: 13, fontWeight: 700, margin: 0 }}>服务城市 / 资质状态待后端确认</p>
        <h1 style={{ color: "#2B2118", fontSize: 26, lineHeight: "34px", margin: "8px 0" }}>接单工作台</h1>
        <p style={{ color: "#4b5563", fontSize: 14, lineHeight: "22px", margin: 0 }}>任务池壳已就位，不展示假任务，不伪造在线资格。</p>
      </Card>
      <SearchBar value={query} onChange={setQuery} placeholder="搜索工单号、地址或服务" disabled />
      <Tabs
        activeKey={active}
        onChange={setActive}
        items={[
          { key: "nearby", label: "附近" },
          { key: "urgent", label: "急单" },
          { key: "watched", label: "关注" },
        ]}
      />
      <WorkerTaskCard
        title="任务池未接入"
        status={<Badge tone="muted">empty</Badge>}
        location="真实任务将受服务城市与资质约束"
        timeWindow="不会显示假可抢单"
        meta="等待 Phase 15.4 API"
      />
      <EmptyState title="暂无真实任务" description="接入任务池 API 前，这里保持 empty / not-wired 状态。" />
    </>
  );
}

function TasksPage() {
  return (
    <>
      <WorkerTaskCard title="我的任务" status={<Badge tone="muted">empty</Badge>} location="任务详情 API 未接入" timeWindow="履约动作不可用" meta="不会伪造已接单任务" />
      <ErrorState title="任务详情未接线" description="出发、到达、服务、完工动作必须等待真实 API。" />
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
      <EmptyState title="收益未接入" description="不展示假收入、假提现或假结算状态。" />
    </>
  );
}

function ProfilePage() {
  return (
    <>
      <Card title="我的">
        <p style={{ color: "#4b5563", fontSize: 13, lineHeight: "20px", margin: 0 }}>师傅资料、认证资料、服务城市入口壳已建立。</p>
      </Card>
      <EmptyState title="认证资料未接入" description="不会伪造师傅身份、资质状态或服务城市。" />
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

  return (
    <AppFrame route={route}>
      {content[route]}
    </AppFrame>
  );
}
