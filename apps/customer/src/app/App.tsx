import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Badge,
  BottomNav,
  Button,
  Card,
  EmptyState,
  ErrorState,
  MobileShell,
  OrderCard,
  SearchBar,
  ServiceCard,
  Skeleton,
  Tabs,
  TopBar,
} from "@xlb/ui";

type CustomerRoute = "home" | "services" | "createOrder" | "orders" | "profile";

const routeConfig: Record<CustomerRoute, { label: string; href: string; title: string }> = {
  home: { label: "首页", href: "/customer/", title: "安心到家修缮" },
  services: { label: "服务", href: "/customer/services", title: "选择维修项目" },
  createOrder: { label: "下单", href: "/customer/order/create", title: "填写上门信息" },
  orders: { label: "订单", href: "/customer/orders", title: "服务进度" },
  profile: { label: "我的", href: "/customer/profile", title: "账户入口" },
};

const shellStyle = {
  "--xlb-role-accent": "#B85F2A",
  background: "#FFFAF0",
  minHeight: "100vh",
} as CSSProperties;

function currentRoute(): CustomerRoute {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path.endsWith("/customer/services")) return "services";
  if (path.endsWith("/customer/order/create")) return "createOrder";
  if (path.endsWith("/customer/orders")) return "orders";
  if (path.endsWith("/customer/profile")) return "profile";
  return "home";
}

function AppFrame({ route, children }: { route: CustomerRoute; children: ReactNode }) {
  return (
    <div style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh" }}>
        <MobileShell
          topBar={<TopBar title={routeConfig[route].title} actions={<Badge tone="warning">not-wired</Badge>} />}
          bottomNav={
            <BottomNav
              items={(Object.keys(routeConfig) as CustomerRoute[]).map((key) => ({
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

function NotWiredCard({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <Card title={title}>
      <p style={{ color: "#4b5563", fontSize: 13, lineHeight: "20px", margin: 0 }}>{description}</p>
    </Card>
  );
}

function HomePage() {
  const [query, setQuery] = useState("");
  return (
    <>
      <Card>
        <p style={{ color: "#B85F2A", fontSize: 13, fontWeight: 700, margin: 0 }}>上海 · 静安区</p>
        <h1 style={{ color: "#2B2118", fontSize: 28, lineHeight: "36px", margin: "8px 0" }}>安心到家修缮</h1>
        <p style={{ color: "#4b5563", fontSize: 14, lineHeight: "22px", margin: 0 }}>搜索服务、查看订单、填写报修入口已就位，真实目录等待 API 接入。</p>
      </Card>
      <SearchBar value={query} onChange={setQuery} placeholder="搜索服务、订单号或地址" disabled />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ServiceCard title="服务目录" subtitle="等待真实服务 API" status={<Badge tone="muted">empty</Badge>} actionLabel="查看" />
        <ServiceCard title="快速报修" subtitle="下单链路未接 API" status={<Badge tone="warning">not-wired</Badge>} actionLabel="填写" />
      </div>
      <NotWiredCard title="真实数据边界" description="当前 shell 不展示假服务、假价格或假订单。Phase 15.3 接入真实服务目录后再呈现业务数据。" />
    </>
  );
}

function ServicesPage() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("all");
  return (
    <>
      <SearchBar value={query} onChange={setQuery} placeholder="搜索服务项目" disabled />
      <Tabs
        activeKey={active}
        onChange={setActive}
        items={[
          { key: "all", label: "全部" },
          { key: "repair", label: "维修" },
          { key: "clean", label: "清洗" },
        ]}
      />
      <EmptyState title="服务目录未接入" description="这里将展示真实服务类目和 SKU。当前不使用假服务数据。" action={<Button>等待 Phase 15.3</Button>} />
    </>
  );
}

function CreateOrderPage() {
  return (
    <>
      <NotWiredCard title="下单壳已就位" description="服务项目、地址、时间和报价区域将在真实 catalog/order API 接入后启用。" />
      <Card title="提交前状态">
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton style={{ height: 18, width: "70%" }} />
          <Skeleton style={{ height: 18, width: "86%" }} />
          <Skeleton style={{ height: 44 }} />
        </div>
      </Card>
      <ErrorState title="订单 API 未接入" description="不会在前端伪造下单成功，也不会触发派单。" />
    </>
  );
}

function OrdersPage() {
  return (
    <>
      <OrderCard title="订单列表" status={<Badge tone="muted">empty</Badge>} description="真实订单列表 API 尚未接入。" meta="不会展示假订单" />
      <EmptyState title="暂无可展示订单" description="接入真实订单 API 后，这里会显示后端返回的订单状态。" />
    </>
  );
}

function ProfilePage() {
  return (
    <>
      <Card title="我的">
        <p style={{ color: "#4b5563", fontSize: 13, lineHeight: "20px", margin: 0 }}>账户、地址、订单入口壳已建立。用户资料等待认证和账号 API。</p>
      </Card>
      <NotWiredCard title="资料状态" description="当前不伪造昵称、头像、地址或会员信息。" />
    </>
  );
}

export function App() {
  const route = useMemo(currentRoute, []);
  const content: Record<CustomerRoute, ReactNode> = {
    home: <HomePage />,
    services: <ServicesPage />,
    createOrder: <CreateOrderPage />,
    orders: <OrdersPage />,
    profile: <ProfilePage />,
  };

  return (
    <AppFrame route={route}>
      {content[route]}
    </AppFrame>
  );
}
