import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ActionDock,
  BottomNav,
  Card,
  HeroCard,
  MetricCard,
  MobileShell,
  NotWiredState,
  SearchBar,
  StatusTag,
  Tabs,
  Timeline,
  TopBar,
  RuntimeThemeSurface,
  WorkerAnswerCard,
  WorkerStatusCard,
  WorkflowStatePanel,
} from "@xlb/ui";
import {
  createWorkerWorkflowBinding,
  workerWorkflowActions,
} from "../adapters/workflowBindings";

type WorkerRoute = "hall" | "tasks" | "wallet" | "profile" | "certification";

const routeConfig: Record<WorkerRoute, { label: string; href: string; title: string; subtitle: string }> = {
  hall: { label: "接单", href: "/worker/", title: "接单大厅", subtitle: "师傅端 / 接单大厅 / 待接线" },
  tasks: { label: "任务", href: "/worker/tasks", title: "我的任务", subtitle: "师傅端 / 任务 / 待接线" },
  wallet: { label: "收入", href: "/worker/wallet", title: "收入", subtitle: "师傅端 / 收入 / 待接线" },
  profile: { label: "我的", href: "/worker/profile", title: "我的", subtitle: "师傅端 / 我的 / 待接线" },
  certification: { label: "认证", href: "/worker/certification", title: "认证", subtitle: "师傅端 / 认证 / 待接线" },
};

const shellStyle = {
  "--xlb-role-accent": "#08172B",
  background: "linear-gradient(180deg, #eef6ff 0%, #f8fafc 45%, #f9fafb 100%)",
  minHeight: "100vh",
} as CSSProperties;

const grid = { display: "grid", gap: 14 } as CSSProperties;
const helperText = { color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 } as CSSProperties;

function currentRoute(): WorkerRoute {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.endsWith("/worker/tasks")) return "tasks";
  if (path.endsWith("/worker/wallet")) return "wallet";
  if (path.endsWith("/worker/certification")) return "certification";
  if (path.endsWith("/worker/profile")) return "profile";
  return "hall";
}

function HelperText({ children }: { children: ReactNode }) {
  return <p style={helperText}>{children}</p>;
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
              actions={<StatusTag tone="warning">能力未接线</StatusTag>}
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
  const binding = createWorkerWorkflowBinding({ route: "hall" });
  const taskPoolAction = workerWorkflowActions.waitForTaskPool();

  return (
    <RuntimeThemeSurface binding={binding}>
      <WorkflowStatePanel binding={binding} />
      <WorkerAnswerCard state={binding.state} />
      <HeroCard
        productRole="worker"
        eyebrow="服务城市 / 资质 / 在线状态"
        title="接单工作台"
        description="本阶段只做 Figma 视觉精修。任务池、在线资格、抢单动作尚未接真实 W 端 API，因此保持未接线。"
        footer={
          <>
            <StatusTag tone="warning">任务池未接线</StatusTag>
            <StatusTag tone="warning">资格未接线</StatusTag>
            <StatusTag tone="muted">无本地样例工单</StatusTag>
          </>
        }
      />

      <SearchBar value={query} onChange={setQuery} placeholder="搜索工单号、地址或服务" disabled leadingIcon="⌕" />

      <Tabs
        activeKey={active}
        onChange={setActive}
        density="compact"
        items={[
          { key: "nearby", label: "附近", disabled: true },
          { key: "urgent", label: "急单", disabled: true },
          { key: "watched", label: "关注", disabled: true },
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <MetricCard productRole="worker" label="今日可抢" value="--" hint="等待任务池 API" tone="muted" />
        <MetricCard productRole="worker" label="在线资格" value="--" hint="等待资质 API" tone="muted" />
      </div>

      <WorkerStatusCard
        title="任务池未接入"
        status={<StatusTag tone="muted">空状态</StatusTag>}
        location="真实任务将受服务城市、资质、距离约束"
        timeWindow="不会展示本地样例工单"
        meta="Phase 15.4 需接入真实 worker API"
        boundary="当前卡片只表达未接线边界，不创建本地任务。"
        actions={<ActionDock actions={[taskPoolAction]} density="compact" />}
      >
        <Timeline
          items={[
            { key: "city", title: "城市范围", description: "必须由后端返回或请求上下文确认" },
            { key: "cert", title: "师傅资质", description: "不得在前端伪造可接单资格" },
            { key: "pool", title: "任务池", description: "真实任务池 API 未接入前保持空态" },
          ]}
        />
      </WorkerStatusCard>

      <NotWiredState
        title="暂无真实任务"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" />}
      />
    </RuntimeThemeSurface>
  );
}

function TasksPage() {
  const binding = createWorkerWorkflowBinding({ route: "tasks" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <WorkflowStatePanel binding={binding} />
      <WorkerAnswerCard state={binding.state} />
      <Card title="任务状态" actions={<StatusTag tone="warning">未接线</StatusTag>}>
        <HelperText>已接任务、履约中、待完工等状态必须来自真实任务详情与履约 API，本阶段不生成本地状态。</HelperText>
      </Card>
      <WorkerStatusCard
        title="我的任务"
        status={<StatusTag tone="muted">空状态</StatusTag>}
        location="任务详情 API 未接入"
        timeWindow="出发、到达、服务、完工动作不可用"
        meta="不会伪造已接单任务"
        actions={<ActionDock actions={binding.availableActions} density="compact" />}
      />
      <NotWiredState
        title="任务详情未接线"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" />}
      />
    </RuntimeThemeSurface>
  );
}

function WalletPage() {
  const binding = createWorkerWorkflowBinding({ route: "wallet" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <WorkflowStatePanel binding={binding} />
      <WorkerAnswerCard state={binding.state} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <MetricCard productRole="worker" label="本周收益" value="--" hint="等待真实收入 API" tone="muted" />
        <MetricCard productRole="worker" label="完成任务" value="--" hint="等待履约数据" tone="muted" />
      </div>
      <Card title="收入明细" actions={<StatusTag tone="warning">未接线</StatusTag>}>
        <Timeline
          items={[
            { key: "summary", title: "收益概览", description: "等待 worker income API" },
            { key: "settlement", title: "结算记录", description: "不得展示本地示例结算" },
            { key: "withdraw", title: "提现能力", description: "本阶段不接入、不暗示可用" },
          ]}
        />
      </Card>
      <NotWiredState
        title="收益未接入"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" />}
      />
    </RuntimeThemeSurface>
  );
}

function ProfilePage() {
  const binding = createWorkerWorkflowBinding({ route: "profile" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <WorkflowStatePanel binding={binding} />
      <WorkerAnswerCard state={binding.state} />
      <Card title="师傅资料" actions={<StatusTag tone="warning">未接线</StatusTag>}>
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
      <NotWiredState
        title="认证资料未接入"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" />}
      />
    </RuntimeThemeSurface>
  );
}

function CertificationPage() {
  const binding = createWorkerWorkflowBinding({ route: "certification" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <WorkflowStatePanel binding={binding} />
      <WorkerAnswerCard state={binding.state} />
      <Card title="认证状态" actions={<StatusTag tone="warning">未接线</StatusTag>}>
        <Timeline
          items={[
            { key: "certification", title: "认证状态", description: "必须来自 worker certification API" },
            { key: "eligibility", title: "接单资格", description: "必须来自 eligibility / qualification workflow" },
            { key: "city", title: "服务城市", description: "必须来自 worker city binding 或请求上下文" },
          ]}
        />
      </Card>
      <NotWiredState
        title="认证 workflow 未接入"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" />}
      />
    </RuntimeThemeSurface>
  );
}

export function App() {
  const route = useMemo(currentRoute, []);
  const content: Record<WorkerRoute, ReactNode> = {
    hall: <HallPage />,
    tasks: <TasksPage />,
    wallet: <WalletPage />,
    profile: <ProfilePage />,
    certification: <CertificationPage />,
  };

  return <AppFrame route={route}>{content[route]}</AppFrame>;
}
