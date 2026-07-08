import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BottomNav,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  MobileShell,
  StatusTag,
  Table,
} from "@xlb/ui";
import { createApiClient, workerApi } from "@xlb/api-client";

interface WorkerTaskPoolItem {
  dispatchTaskId: string;
  cityCode: string;
  orderId: string;
  skuId: string;
  amount: number;
  streamName: string;
  status: string;
  createdAt: string;
}

const DEFAULT_CITY_CODE = "hangzhou";
const DEFAULT_WORKER_ID = "worker-demo-hangzhou";

type WorkerRoute = "hall" | "tasks" | "taskDetail" | "wallet" | "profile" | "certification";

interface QueryParams {
  cityCode: string;
  workerId: string;
}

interface ResolvedRoute {
  route: WorkerRoute;
  fulfillmentId?: string;
}


interface FulfillmentResponse {
  fulfillmentId: string;
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: string;
  workerId: string;
  skuId: string;
  status: "accepted" | "in_progress" | "completed" | "cancelled";
  startedAt?: string | null;
  completedAt?: string | null;
  completionNote?: string | null;
  createdAt: string;
  updatedAt: string;
}


const readQueryParams = (): QueryParams => {
  const params = new URLSearchParams(window.location.search);
  return {
    cityCode: params.get("cityCode")?.trim() || DEFAULT_CITY_CODE,
    workerId: params.get("workerId")?.trim() || DEFAULT_WORKER_ID,
  };
};

const normalizeApiBase = (value: string | undefined): string => {
  const raw = (value || "").trim().replace(/\/+$/, "");
  return raw.endsWith("/api") ? raw.slice(0, -4) : raw;
};

const resolveRoute = (): ResolvedRoute => {
  const rawPath = window.location.pathname.replace(/\/+$/, "") || "/";

  if (rawPath === "/worker" || rawPath === "/worker/") {
    return { route: "hall" };
  }

  if (rawPath === "/worker/tasks") {
    return { route: "tasks" };
  }

  const taskDetail = rawPath.match(/^\/worker\/tasks\/([^/?#]+)$/);
  if (taskDetail) {
    return { route: "taskDetail", fulfillmentId: decodeURIComponent(taskDetail[1]) };
  }

  if (rawPath === "/worker/wallet") {
    return { route: "wallet" };
  }

  if (rawPath === "/worker/profile") {
    return { route: "profile" };
  }

  if (rawPath === "/worker/certification") {
    return { route: "certification" };
  }

  return { route: "hall" };
};

const createApi = ({ cityCode, workerId }: QueryParams) => {
  const apiBase = normalizeApiBase((import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE);
  const client = createApiClient({
    baseUrl: apiBase,
    headers: {
      "x-xlb-app-type": "worker",
      "x-xlb-role": "worker",
      "x-xlb-city-code": cityCode,
      "x-xlb-user-id": workerId,
    },
  });

  return workerApi.create(client);
};

function WorkerHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "grid", gap: 4, marginBottom: 8 }}>
      <p style={{ color: "#8ba9cb", fontSize: 12, fontWeight: 700, margin: 0 }}>Worker UAT</p>
      <h1 style={{ color: "#f8fbff", fontFamily: "Noto Serif SC, serif", fontSize: 30, margin: 0, lineHeight: 1.1 }}>{title}</h1>
    </div>
  );
}

function RouteNav({ activeRoute, navigate }: { activeRoute: WorkerRoute; navigate: (next: string) => void }) {
  return (
    <BottomNav
      items={[
        { key: "hall", label: "工地", active: activeRoute === "hall", href: "/worker/", onClick: () => navigate("/worker/"), },
        { key: "tasks", label: "任务", active: activeRoute === "tasks" || activeRoute === "taskDetail", href: "/worker/tasks", onClick: () => navigate("/worker/tasks") },
        { key: "wallet", label: "钱包", active: activeRoute === "wallet", href: "/worker/wallet", onClick: () => navigate("/worker/wallet") },
        { key: "profile", label: "我的", active: activeRoute === "profile", href: "/worker/profile", onClick: () => navigate("/worker/profile") },
        { key: "certification", label: "认证", active: activeRoute === "certification", href: "/worker/certification", onClick: () => navigate("/worker/certification"), prominent: true },
      ]}
      style={{
        background: "rgba(255, 250, 240, 0.14)",
        borderTop: "1px solid rgba(138, 174, 210, 0.2)",
        color: "#f8fbff",
      }}
    />
  );
}

function ActionHint() {
  return (
    <p style={{ color: "#a7bdd7", fontSize: 12, lineHeight: "18px", margin: 0 }}>
      当前为验收只读视图：展示真实 API 列表与详情，不发起写入。
    </p>
  );
}

function HallPage({
  tasks,
  loading,
  error,
  cityCode,
  workerId,
  onRefresh,
}: {
  tasks: WorkerTaskPoolItem[];
  loading: boolean;
  error: string | null;
  cityCode: string;
  workerId: string;
  onRefresh: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title="任务池状态" actions={<StatusTag tone="success">只读验收</StatusTag>}>
        <p style={{ color: "#b9d0ec", margin: 0 }}>
          当前城市 <strong>{cityCode}</strong>，工人 <strong>{workerId}</strong>。
        </p>
      </Card>

      {loading && <LoadingState title="读取任务池" description="基于真实 GET /api/worker/task-pool" />}
      {error && <p style={{ color: "#fda29b" }}>{error}</p>}

      {!loading && !error && (
        <Card title="待接任务池" actions={<StatusTag tone="warning">{tasks.length} 条</StatusTag>}>
          {tasks.length === 0 ? (
            <EmptyState title="当前无待接任务" description="任务池返回空或当前身份不可见。" />
          ) : (
            <Table
              rows={tasks}
              getRowKey={(row) => row.dispatchTaskId}
              columns={[
                { key: "dispatchTaskId", title: "Task ID", render: (row) => row.dispatchTaskId },
                { key: "orderId", title: "Order ID", render: (row) => row.orderId },
                { key: "cityCode", title: "City", render: (row) => row.cityCode },
                { key: "skuId", title: "SKU ID", render: (row) => row.skuId },
                { key: "status", title: "状态", render: (row) => <StatusTag tone="warning">{row.status}</StatusTag> },
              ]}
            />
          )}
        </Card>
      )}

      <Card title="任务池动作" actions={<StatusTag tone="muted">只展示未开放入口</StatusTag>}>
        <div style={{ color: "#b9d0ec", display: "grid", gap: 8 }}>
          <Button onClick={onRefresh} variant="primary">刷新任务池</Button>
          <Button disabled>接单（验收模式，仅展示）</Button>
          <p style={{ color: "#ffd37d", fontSize: 12, margin: 0 }}>接单为真实写接口，当前 UAT 只读，不执行真实接单。</p>
        </div>
      </Card>

      <ActionHint />
    </div>
  );
}

function TaskListPage({
  fulfillments,
  loading,
  error,
  cityCode,
  onRefresh,
  onOpenDetail,
}: {
  fulfillments: FulfillmentResponse[];
  loading: boolean;
  error: string | null;
  cityCode: string;
  onRefresh: () => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title="我的任务列表" actions={<StatusTag tone="success">真实列表</StatusTag>}>
        <p style={{ color: "#b9d0ec", margin: 0 }}>城市：{cityCode}</p>
      </Card>

      {loading && <LoadingState title="读取履约任务" description="基于真实 GET /api/worker/fulfillments" />}
      {error && <p style={{ color: "#fda29b" }}>{error}</p>}

      {!loading && !error && (
        <Card title="任务列表" actions={<Button onClick={onRefresh}>刷新</Button>}>
          {fulfillments.length === 0 ? (
            <EmptyState title="当前无履约任务" description="真实接口无数据，或当前工人未绑定任务。" />
          ) : (
            <Table
              rows={fulfillments}
              getRowKey={(row) => row.fulfillmentId}
              columns={[
                { key: "fulfillmentId", title: "Task ID", render: (row) => row.fulfillmentId },
                { key: "orderId", title: "Order ID", render: (row) => row.orderId },
                { key: "cityCode", title: "City", render: (row) => row.cityCode },
                { key: "skuId", title: "SKU ID", render: (row) => row.skuId },
                { key: "status", title: "状态", render: (row) => <StatusTag tone={row.status === "completed" ? "primary" : "warning"}>{row.status}</StatusTag> },
                {
                  key: "actions",
                  title: "详情",
                  render: (row) => (
                    <Button onClick={() => onOpenDetail(row.fulfillmentId)}>
                      查看
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}

      <Card title="动作" actions={<StatusTag tone="muted">验收说明</StatusTag>}>
        <div style={{ color: "#b9d0ec", display: "grid", gap: 8 }}>
          <Button disabled>Start（验收模式：动作不可执行）</Button>
          <Button disabled>Complete（验收模式：动作不可执行）</Button>
          <p style={{ color: "#ffd37d", fontSize: 12, margin: 0 }}>如需验证真实动作流程，请由后端联调后在 staging 提供完整执行链路。</p>
        </div>
      </Card>

      <ActionHint />
    </div>
  );
}

function TaskDetailPage({
  fulfillment,
  loading,
  error,
  fulfillmentId,
  onBack,
}: {
  fulfillment: FulfillmentResponse | null;
  loading: boolean;
  error: string | null;
  fulfillmentId: string;
  onBack: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Card title="任务详情" actions={<StatusTag tone="success">真实详情</StatusTag>}>
        <p style={{ color: "#b9d0ec", margin: 0 }}>查询 ID: {fulfillmentId}</p>
      </Card>

      {loading && <LoadingState title="读取履约详情" description="基于真实 GET /api/worker/fulfillments/:fulfillmentId" />}
      {error && <p style={{ color: "#fda29b" }}>{error}</p>}

      {!loading && !error && fulfillment && (
        <Card title="字段快照">
          <Table
            rows={[
              ["fulfillmentId", fulfillment.fulfillmentId],
              ["acceptanceId", fulfillment.acceptanceId],
              ["dispatchTaskId", fulfillment.dispatchTaskId],
              ["orderId", fulfillment.orderId],
              ["cityCode", fulfillment.cityCode],
              ["skuId", fulfillment.skuId],
              ["workerId", fulfillment.workerId],
              ["status", fulfillment.status],
              ["startedAt", fulfillment.startedAt || "-"],
              ["completedAt", fulfillment.completedAt || "-"],
              ["createdAt", fulfillment.createdAt],
              ["updatedAt", fulfillment.updatedAt],
            ]}
            getRowKey={(row) => String(row[0])}
            columns={[
              { key: "field", title: "字段", render: (row) => row[0], width: 220 },
              { key: "value", title: "值", render: (row) => row[1] },
            ]}
          />
        </Card>
      )}

      <Card title="动作" actions={<StatusTag tone="muted">动作说明</StatusTag>}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button disabled>Start（验收模式，仅展示）</Button>
          <Button disabled>Complete（验收模式，仅展示）</Button>
          <Button onClick={onBack}>返回任务列表</Button>
        </div>
        <p style={{ color: "#ffd37d", fontSize: 12, margin: "8px 0 0" }}>
          所有动作按钮处于禁用态，防止触发真实状态流转。
        </p>
      </Card>

      <ActionHint />
    </div>
  );
}

function PlaceholderPage({ label }: { label: string }) {
  return <EmptyState title={label} description="该页面为占位路由，不含真实业务动作。" />;
}

export function App() {
  const initialQuery = readQueryParams();
  const [route, setRoute] = useState(resolveRoute);
  const [workerCityCode, setWorkerCityCode] = useState(initialQuery.cityCode);
  const [workerId, setWorkerId] = useState(initialQuery.workerId);
  const [taskPool, setTaskPool] = useState<WorkerTaskPoolItem[]>([]);
  const [fulfillments, setFulfillments] = useState<FulfillmentResponse[]>([]);
  const [taskDetail, setTaskDetail] = useState<FulfillmentResponse | null>(null);
  const [loadingHall, setLoadingHall] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [hallError, setHallError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const api = useMemo(() => createApi({ cityCode: workerCityCode, workerId }), [workerCityCode, workerId]);

  const onRouteChange = useCallback(() => {
    setRoute(resolveRoute());
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, [onRouteChange]);

  useEffect(() => {
    if (route.route === "hall") {
      void loadTaskPool();
      return;
    }

    if (route.route === "tasks") {
      void loadFulfillments();
      return;
    }

    if (route.route === "taskDetail" && route.fulfillmentId) {
      void loadTaskDetail(route.fulfillmentId);
    }
  }, [route.route, route.fulfillmentId]);

  const loadTaskPool = useCallback(async () => {
    setLoadingHall(true);
    setHallError(null);

    try {
      const response = await api.getTaskPool();
      if (!response.ok) {
        setHallError("任务池返回异常");
        setTaskPool([]);
        return;
      }
      setTaskPool(response.tasks);
    } catch (error) {
      setHallError(error instanceof Error ? error.message : "读取任务池失败");
      setTaskPool([]);
    } finally {
      setLoadingHall(false);
    }
  }, [api]);

  const loadFulfillments = useCallback(async () => {
    setLoadingTasks(true);
    setTasksError(null);

    try {
      const response = await api.getMyFulfillments();
      if (!response.ok) {
        setTasksError("履约列表返回异常");
        setFulfillments([]);
        return;
      }
      setFulfillments(response.fulfillments);
    } catch (error) {
      setTasksError(error instanceof Error ? error.message : "读取履约列表失败");
      setFulfillments([]);
    } finally {
      setLoadingTasks(false);
    }
  }, [api]);

  const loadTaskDetail = useCallback(async (fulfillmentId: string) => {
    setLoadingDetail(true);
    setDetailError(null);
    setTaskDetail(null);

    try {
      const response = await api.getFulfillment(fulfillmentId);
      if (!response.ok) {
        setDetailError("未找到任务详情");
        return;
      }
      setTaskDetail(response.fulfillment);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "读取任务详情失败");
    } finally {
      setLoadingDetail(false);
    }
  }, [api]);

  const navigate = useCallback((next: string) => {
    window.history.pushState({}, "", next);
    setRoute(resolveRoute());
  }, []);

  const pageTitle =
    route.route === "hall"
      ? "Worker Hall"
      : route.route === "tasks"
        ? "我的任务"
        : route.route === "taskDetail"
          ? "任务详情"
          : route.route === "wallet"
            ? "钱包"
            : route.route === "profile"
              ? "我的"
              : "认证";

  const content =
    route.route === "hall" ? (
      <HallPage
        tasks={taskPool}
        loading={loadingHall}
        error={hallError}
        cityCode={workerCityCode}
        workerId={workerId}
        onRefresh={loadTaskPool}
      />
    ) : route.route === "tasks" ? (
      <TaskListPage
        fulfillments={fulfillments}
        loading={loadingTasks}
        error={tasksError}
        cityCode={workerCityCode}
        onRefresh={loadFulfillments}
        onOpenDetail={(fulfillmentId) => {
          navigate(`/worker/tasks/${encodeURIComponent(fulfillmentId)}`);
        }}
      />
    ) : route.route === "taskDetail" && route.fulfillmentId ? (
      <TaskDetailPage
        fulfillment={taskDetail}
        loading={loadingDetail}
        error={detailError}
        fulfillmentId={route.fulfillmentId}
        onBack={() => {
          navigate("/worker/tasks");
        }}
      />
    ) : route.route === "wallet" ? (
      <PlaceholderPage label="钱包" />
    ) : route.route === "profile" ? (
      <PlaceholderPage label="我的" />
    ) : (
      <PlaceholderPage label="认证" />
    );

  return (
    <div style={{ background: "#08172B", color: "#f8fbff", minHeight: "100vh" }}>
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh", padding: "28px 18px" }}>
        <MobileShell
          topBar={<WorkerHeader title={pageTitle} />}
          bottomNav={<RouteNav activeRoute={route.route} navigate={navigate} />}
          contentStyle={{ padding: "8px 20px 0" }}
          style={{ background: "#08172B", color: "#f8fbff", minHeight: 824 }}
        >
          <div style={{ display: "grid", gap: 12 }}>
            <Card title="会话上下文" actions={<StatusTag tone="muted">UAT 参数</StatusTag>}>
              <p style={{ color: "#b9d0ec", margin: 0, fontSize: 13 }}>当前 headers：x-xlb-city-code / x-xlb-user-id 均来自页面入参。</p>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                <FormField label="cityCode">
                  <Input value={workerCityCode} onChange={(event) => setWorkerCityCode(event.target.value || DEFAULT_CITY_CODE)} />
                </FormField>
                <FormField label="x-xlb-user-id">
                  <Input value={workerId} onChange={(event) => setWorkerId(event.target.value || DEFAULT_WORKER_ID)} />
                </FormField>
                <Button
                  onClick={() => {
                    void loadTaskPool();
                    void loadFulfillments();
                    if (route.fulfillmentId) {
                      void loadTaskDetail(route.fulfillmentId);
                    }
                  }}
                  variant="primary"
                >
                  重新加载
                </Button>
              </div>
            </Card>
            {content}
          </div>
        </MobileShell>
      </div>
    </div>
  );
}
