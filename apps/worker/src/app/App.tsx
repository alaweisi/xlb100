import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { WorkflowUiBinding } from "@xlb/types";
import {
  ActionDock,
  BottomNav,
  Card,
  MetricCard,
  MobileShell,
  StatusTag,
  RuntimeThemeSurface,
} from "@xlb/ui";
import {
  createWorkerWorkflowBinding,
  workerWorkflowActions,
} from "../adapters/workflowBindings";

type WorkerRoute = "hall" | "tasks" | "wallet" | "profile" | "certification";

const routeConfig: Record<WorkerRoute, { label: string; href: string; title: string; subtitle: string; icon: string; prominent?: boolean }> = {
  hall: { label: "接单", href: "/worker/", title: "接单已暂停", subtitle: "陈明师傅 · 静安", icon: "⌁" },
  tasks: { label: "任务", href: "/worker/tasks", title: "我的任务", subtitle: "履约工作流未接线", icon: "▤" },
  wallet: { label: "收益", href: "/worker/wallet", title: "收益", subtitle: "收入 API 未接线", icon: "▣" },
  profile: { label: "我的", href: "/worker/profile", title: "我的", subtitle: "资料 API 未接线", icon: "♙" },
  certification: { label: "认证", href: "/worker/certification", title: "认证", subtitle: "资质 API 未接线", icon: "+", prominent: true },
};

const shellStyle = {
  "--xlb-role-accent": "#d98245",
  background: "#efe7da",
  minHeight: "100vh",
} as CSSProperties;

const grid = { display: "grid", gap: 14 } as CSSProperties;
const helperText = { color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 } as CSSProperties;
const workerPanelStyle: CSSProperties = {
  background: "rgba(47, 75, 110, 0.86)",
  borderColor: "rgba(138, 174, 210, 0.24)",
  borderRadius: 22,
  boxShadow: "none",
  color: "#f8fbff",
};
const workerSoftPanelStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.08)",
  borderColor: "rgba(138, 174, 210, 0.18)",
  borderRadius: 22,
  boxShadow: "none",
  color: "#f8fbff",
};

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

function PhoneStatusBar() {
  return (
    <div style={{ alignItems: "center", color: "#f8fbff", display: "flex", fontSize: 12, fontWeight: 800, justifyContent: "space-between", lineHeight: "16px" }}>
      <span>9:41</span>
      <span>5G ▰</span>
    </div>
  );
}

function WorkerPageHeader({ route }: { route: WorkerRoute }) {
  const config = routeConfig[route];
  return (
    <header style={{ display: "grid", gap: 10, padding: "20px 20px 8px" }}>
      <PhoneStatusBar />
      <div style={{ alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "#a9bdd0", fontSize: 13, fontWeight: 700, lineHeight: "18px" }}>{config.subtitle}</span>
          <h1 style={{ color: "#fffaf0", fontFamily: "Noto Serif SC, STSong, SimSun, serif", fontSize: 29, fontWeight: 800, letterSpacing: 0, lineHeight: "36px", margin: 0 }}>
            {config.title}
          </h1>
        </div>
        <StatusTag tone={route === "hall" ? "muted" : "warning"}>{route === "hall" ? "已关闭" : "未接线"}</StatusTag>
      </div>
    </header>
  );
}

function WorkerMetricStrip() {
  const metrics = [
    ["今日接单", "--", "等待任务池 API"],
    ["今日收益", "--", "等待收入 API"],
    ["完成率", "--", "等待履约 API"],
  ];
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
      {metrics.map(([label, value, hint]) => (
        <div
          key={label}
          title={hint}
          style={{
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(138, 174, 210, 0.18)",
            borderRadius: 20,
            color: "#f8fbff",
            display: "grid",
            gap: 8,
            minHeight: 78,
            padding: "14px 12px",
          }}
        >
          <span style={{ color: "#a9bdd0", fontSize: 12, lineHeight: "16px" }}>{label}</span>
          <strong style={{ fontSize: 21, lineHeight: "24px" }}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function RadarPanel() {
  return (
    <div style={{ display: "grid", justifyItems: "center", padding: "8px 0 4px" }}>
      <div
        style={{
          alignItems: "center",
          background: "radial-gradient(circle, rgba(55, 113, 171, 0.4) 0 24%, rgba(55, 113, 171, 0.16) 25% 48%, rgba(55, 113, 171, 0.1) 49% 68%, rgba(55, 113, 171, 0) 69%)",
          border: "1px solid rgba(61, 142, 216, 0.42)",
          borderRadius: 999,
          color: "#9bd3ff",
          display: "grid",
          height: 214,
          justifyItems: "center",
          placeContent: "center",
          width: 214,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1 }}>⌁</span>
        <span style={{ color: "#dbeafe", fontSize: 13, fontWeight: 700, lineHeight: "18px", marginTop: 10 }}>暂停扫描</span>
      </div>
    </div>
  );
}

function VoiceRepairPanel() {
  return (
    <Card title="C端语音报修" actions={<StatusTag tone="muted">已暂停</StatusTag>} style={workerPanelStyle}>
      <div style={{ display: "grid", gap: 12 }}>
        <div aria-hidden="true" style={{ alignItems: "end", display: "flex", gap: 4, height: 28 }}>
          {[12, 22, 16, 26, 20, 24, 14].map((height, index) => (
            <span key={`${height}-${index}`} style={{ background: "#7f9ab8", borderRadius: 999, height, width: 4 }} />
          ))}
        </div>
        <HelperText>开启接单后继续监听附近工单；当前无后端任务池，不展示样例语音或工单。</HelperText>
      </div>
    </Card>
  );
}

function WorkerBoundaryPanel({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <Card title={title} actions={<StatusTag tone="warning">未接线</StatusTag>} style={workerSoftPanelStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        {description && <p style={{ color: "#b7c9dc", fontSize: 13, lineHeight: "20px", margin: 0 }}>{description}</p>}
        {action}
      </div>
    </Card>
  );
}

function WorkerTimeline({ items }: { items: Array<{ key: string; title: ReactNode; description?: ReactNode }> }) {
  return (
    <ol style={{ display: "grid", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item.key} style={{ borderLeft: "2px solid #4aa3ff", display: "grid", gap: 3, paddingLeft: 12 }}>
          <strong style={{ color: "#f8fbff", fontSize: 13, lineHeight: "18px" }}>{item.title}</strong>
          {item.description && <span style={{ color: "#9fb8d1", fontSize: 12, lineHeight: "18px" }}>{item.description}</span>}
        </li>
      ))}
    </ol>
  );
}

function WorkerBindingFootnote({ binding }: { binding: Pick<WorkflowUiBinding, "workflowName" | "state" | "figmaBinding"> }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "rgba(255, 255, 255, 0.07)",
        border: "1px solid rgba(138, 174, 210, 0.18)",
        borderRadius: 16,
        color: "#9fb8d1",
        display: "flex",
        fontSize: 11,
        gap: 8,
        justifyContent: "space-between",
        lineHeight: "16px",
        padding: "8px 10px",
      }}
    >
      <span style={{ color: "#f8fbff", fontWeight: 700 }}>{binding.state.label}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{binding.workflowName} · {binding.figmaBinding.kind}</span>
    </div>
  );
}

function AppFrame({ route, children }: { route: WorkerRoute; children: ReactNode }) {
  return (
    <div data-role="worker" style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh", padding: "28px 18px" }}>
        <div
          style={{
            background: "#08172B",
            border: "10px solid #1d6595",
            borderRadius: 44,
            boxShadow: "0 24px 54px rgba(8, 23, 43, 0.32)",
            boxSizing: "border-box",
            minHeight: 844,
            overflow: "hidden",
          }}
        >
        <MobileShell
          topBar={<WorkerPageHeader route={route} />}
          bottomNav={
            <BottomNav
              items={(Object.keys(routeConfig) as WorkerRoute[]).map((key) => ({
                key,
                label: routeConfig[key].label,
                active: key === route,
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
          }
          contentStyle={{ padding: "8px 20px 0" }}
          style={{ background: "#08172B", color: "#f8fbff", minHeight: 824 }}
        >
          <div style={{ ...grid, paddingBottom: 18 }}>{children}</div>
        </MobileShell>
        </div>
      </div>
    </div>
  );
}

function HallPage() {
  const binding = createWorkerWorkflowBinding({ route: "hall" });
  const taskPoolAction = workerWorkflowActions.waitForTaskPool();

  return (
    <RuntimeThemeSurface binding={binding}>
      <WorkerMetricStrip />
      <RadarPanel />
      <VoiceRepairPanel />

      <Card title="附近可抢订单" actions={<StatusTag tone="muted">空状态</StatusTag>} style={workerPanelStyle}>
        <div style={{ color: "#b7c9dc", display: "grid", fontSize: 13, gap: 8, lineHeight: "20px" }}>
          <span>任务必须来自后端任务池、城市范围与资质校验</span>
          <span>当前暂停监听</span>
          <span>不会展示本地样例工单</span>
          <span>当前卡片只表达未接线边界，不创建本地任务。</span>
        </div>
        <WorkerTimeline
          items={[
            { key: "city", title: "城市范围", description: "必须由后端返回或请求上下文确认" },
            { key: "cert", title: "师傅资质", description: "不得在前端伪造可接单资格" },
            { key: "pool", title: "任务池", description: "真实任务池 API 未接入前保持空态" },
          ]}
        />
        <ActionDock actions={[taskPoolAction]} density="compact" showDisabledReason={false} />
      </Card>

      <WorkerBoundaryPanel
        title="暂无真实任务"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" showDisabledReason={false} />}
      />
      <WorkerBindingFootnote binding={binding} />
    </RuntimeThemeSurface>
  );
}

function TasksPage() {
  const binding = createWorkerWorkflowBinding({ route: "tasks" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <Card title="任务状态" actions={<StatusTag tone="warning">未接线</StatusTag>} style={workerPanelStyle}>
        <HelperText>已接任务、履约中、待完工等状态必须来自真实任务详情与履约 API，本阶段不生成本地状态。</HelperText>
      </Card>
      <Card title="我的任务" actions={<StatusTag tone="muted">空状态</StatusTag>} style={workerPanelStyle}>
        <div style={{ color: "#b7c9dc", display: "grid", fontSize: 13, gap: 8, lineHeight: "20px" }}>
          <span>任务详情 API 未接入</span>
          <span>出发、到达、服务、完工动作不可用</span>
          <span>不会伪造已接单任务</span>
        </div>
        <ActionDock actions={binding.availableActions} density="compact" showDisabledReason={false} />
      </Card>
      <WorkerBoundaryPanel
        title="任务详情未接线"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" showDisabledReason={false} />}
      />
      <WorkerBindingFootnote binding={binding} />
    </RuntimeThemeSurface>
  );
}

function WalletPage() {
  const binding = createWorkerWorkflowBinding({ route: "wallet" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <MetricCard productRole="worker" label="本周收益" value="--" hint="等待真实收入 API" tone="muted" style={workerSoftPanelStyle} />
        <MetricCard productRole="worker" label="完成任务" value="--" hint="等待履约数据" tone="muted" style={workerSoftPanelStyle} />
      </div>
      <Card title="收入明细" actions={<StatusTag tone="warning">未接线</StatusTag>} style={workerPanelStyle}>
        <WorkerTimeline
          items={[
            { key: "summary", title: "收益概览", description: "等待 worker income API" },
            { key: "settlement", title: "结算记录", description: "不得展示本地示例结算" },
            { key: "withdraw", title: "提现能力", description: "本阶段不接入、不暗示可用" },
          ]}
        />
      </Card>
      <WorkerBoundaryPanel
        title="收益未接入"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" showDisabledReason={false} />}
      />
      <WorkerBindingFootnote binding={binding} />
    </RuntimeThemeSurface>
  );
}

function ProfilePage() {
  const binding = createWorkerWorkflowBinding({ route: "profile" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <Card title="师傅资料" actions={<StatusTag tone="warning">未接线</StatusTag>} style={workerPanelStyle}>
        <HelperText>资料、认证材料、服务城市入口已按 Figma 信息架构占位，但状态必须等待真实 W 端 API。</HelperText>
      </Card>
      <Card title="认证与服务能力" style={workerPanelStyle}>
        <WorkerTimeline
          items={[
            { key: "identity", title: "身份认证", description: "认证状态 API 未接入" },
            { key: "skill", title: "服务能力", description: "服务类目与城市绑定未接入" },
            { key: "settings", title: "账号设置", description: "登录态和安全设置未接入" },
          ]}
        />
      </Card>
      <WorkerBoundaryPanel
        title="认证资料未接入"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" showDisabledReason={false} />}
      />
      <WorkerBindingFootnote binding={binding} />
    </RuntimeThemeSurface>
  );
}

function CertificationPage() {
  const binding = createWorkerWorkflowBinding({ route: "certification" });

  return (
    <RuntimeThemeSurface binding={binding}>
      <Card title="认证状态" actions={<StatusTag tone="warning">未接线</StatusTag>} style={workerPanelStyle}>
        <WorkerTimeline
          items={[
            { key: "certification", title: "认证状态", description: "必须来自 worker certification API" },
            { key: "eligibility", title: "接单资格", description: "必须来自 eligibility / qualification workflow" },
            { key: "city", title: "服务城市", description: "必须来自 worker city binding 或请求上下文" },
          ]}
        />
      </Card>
      <WorkerBoundaryPanel
        title="认证 workflow 未接入"
        description={binding.notWiredPolicy?.userCopy}
        action={<ActionDock actions={binding.availableActions} density="compact" showDisabledReason={false} />}
      />
      <WorkerBindingFootnote binding={binding} />
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
