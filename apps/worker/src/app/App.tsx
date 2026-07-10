import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Fulfillment, WorkerTaskPoolItem } from "@xlb/types";
import type { AftersaleRepairOrderResponse } from "@xlb/api-client";
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
import { workerWorkflowActions } from "../adapters/workflowBindings";
import {
  createWorkerApiClient,
  isUnauthorizedError,
  loginWorkerWithCode,
  readWorkerDebugCode,
  requestWorkerLoginCode,
  type WorkerSession,
} from "./workerAuth";

const DEFAULT_CITY_CODE = "hangzhou";
const DEFAULT_WORKER_PHONE = "13800000001";

type WorkerRoute =
  | "hall"
  | "tasks"
  | "taskDetail"
  | "repairs"
  | "wallet"
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
    label: "Pool",
    href: "/worker/",
    title: "Task Pool",
    subtitle: "Worker task pool with accept",
    icon: "P",
  },
  tasks: {
    label: "Tasks",
    href: "/worker/tasks",
    title: "My Tasks",
    subtitle: "Fulfillment lifecycle",
    icon: "T",
  },
  taskDetail: {
    label: "Detail",
    href: "/worker/tasks",
    title: "Task Detail",
    subtitle: "Start and complete service",
    icon: "D",
  },
  repairs: {
    label: "Repairs",
    href: "/worker/repairs",
    title: "Repair Visits",
    subtitle: "Aftersale repair lifecycle",
    icon: "R",
  },
  wallet: {
    label: "Wallet",
    href: "/worker/wallet",
    title: "Wallet",
    subtitle: "Income API is not wired",
    icon: "W",
  },
  profile: {
    label: "Profile",
    href: "/worker/profile",
    title: "Profile",
    subtitle: "Demo identity context",
    icon: "M",
  },
  certification: {
    label: "Cert",
    href: "/worker/certification",
    title: "Certification",
    subtitle: "Demo qualification status",
    icon: "+",
    prominent: true,
  },
};

const shellStyle = {
  "--xlb-role-accent": "#d98245",
  background: "#efe7da",
  minHeight: "100vh",
} as CSSProperties;

const workerPanelStyle: CSSProperties = {
  background: "rgba(47, 75, 110, 0.86)",
  borderColor: "rgba(138, 174, 210, 0.24)",
  borderRadius: 8,
  boxShadow: "none",
  color: "#f8fbff",
};

const helperText: CSSProperties = {
  color: "#b7c9dc",
  fontSize: 13,
  lineHeight: "20px",
  margin: 0,
};

const mutedBoxStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.08)",
  border: "1px solid rgba(138, 174, 210, 0.18)",
  borderRadius: 8,
  display: "grid",
  gap: 8,
  padding: 12,
};

function readQueryParams(): QueryParams {
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
  if (rawPath === "/worker/certification") return { route: "certification" };
  if (rawPath === "/worker/profile") return { route: "profile" };
  return { route: "hall" };
}

function formatAmount(amount: number): string {
  return `CNY ${amount.toFixed(2)}`;
}

function statusTone(status: string): "primary" | "success" | "warning" | "danger" | "muted" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "primary";
  if (status === "accepted" || status === "queued" || status === "offering" || status === "reassigning") return "warning";
  if (status === "cancelled" || status === "failed" || status === "no_match" || status === "manual_review") return "danger";
  return "muted";
}

function formatNullable(value: string | null | undefined): string {
  return value || "-";
}

function PhoneStatusBar() {
  return (
    <div
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
  const isWorkerApiRoute = route === "hall" || route === "tasks" || route === "taskDetail" || route === "repairs";

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
          {isWorkerApiRoute ? "Real API" : "Not wired"}
        </StatusTag>
      </div>
    </header>
  );
}

function RouteNav({ activeRoute }: { activeRoute: WorkerRoute }) {
  return (
    <BottomNav
      items={(["hall", "tasks", "repairs", "wallet", "profile", "certification"] as WorkerRoute[]).map((key) => ({
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
    <div data-role="worker" style={shellStyle}>
      <div style={{ margin: "0 auto", maxWidth: 430, minHeight: "100vh", padding: "28px 18px" }}>
        <div
          style={{
            background: "#08172B",
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
            style={{ background: "#08172B", color: "#f8fbff", minHeight: 824 }}
          >
            <div style={{ display: "grid", gap: 14, paddingBottom: 18 }}>{children}</div>
          </MobileShell>
        </div>
      </div>
    </div>
  );
}

function WorkerLoginPage({
  cityCode,
  onCityChange,
  onLogin,
}: {
  cityCode: string;
  onCityChange: (value: string) => void;
  onLogin: (session: WorkerSession) => void;
}) {
  const [phone, setPhone] = useState(DEFAULT_WORKER_PHONE);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"request" | "debug" | "login" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debugCodeEnabledInUi =
    ((import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE ?? "development") !== "production";

  const requestCode = useCallback(async () => {
    setLoading("request");
    setError(null);
    setNotice(null);
    try {
      const result = await requestWorkerLoginCode(phone.trim());
      setNotice(`Code sent. It expires in ${result.ttlSeconds}s.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to request login code");
    } finally {
      setLoading(null);
    }
  }, [phone]);

  const fillDebugCode = useCallback(async () => {
    setLoading("debug");
    setError(null);
    setNotice(null);
    try {
      const result = await readWorkerDebugCode(phone.trim());
      setCode(result.code);
      setNotice("Debug code filled for local verification.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debug code unavailable");
    } finally {
      setLoading(null);
    }
  }, [phone]);

  const submitLogin = useCallback(async () => {
    setLoading("login");
    setError(null);
    setNotice(null);
    try {
      const session = await loginWorkerWithCode(phone.trim(), code.trim());
      onLogin(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Worker login failed");
    } finally {
      setLoading(null);
    }
  }, [code, onLogin, phone]);

  return (
    <AppFrame route="hall">
      <Card title="Worker Login" actions={<StatusTag tone="primary">Bearer</StatusTag>} style={workerPanelStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <p style={helperText}>Use phone OTP login before opening the worker task pool.</p>
          <FormField label="cityCode">
            <Input value={cityCode} onChange={(event) => onCityChange(event.target.value || DEFAULT_CITY_CODE)} />
          </FormField>
          <FormField label="phone">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormField label="code">
            <Input value={code} onChange={(event) => setCode(event.target.value)} />
          </FormField>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={requestCode} disabled={loading !== null || !phone.trim()}>
              {loading === "request" ? "Sending" : "Send code"}
            </Button>
            {debugCodeEnabledInUi && (
              <Button onClick={fillDebugCode} disabled={loading !== null || !phone.trim()}>
                {loading === "debug" ? "Reading" : "Fill debug code"}
              </Button>
            )}
            <Button onClick={submitLogin} disabled={loading !== null || !phone.trim() || !code.trim()} variant="primary">
              {loading === "login" ? "Logging in" : "Login"}
            </Button>
          </div>
          {notice && <p style={helperText}>{notice}</p>}
          {error && <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>}
        </div>
      </Card>
    </AppFrame>
  );
}

function SessionCard({
  cityCode,
  session,
  onCityChange,
  onLogout,
  onReload,
}: {
  cityCode: string;
  session: WorkerSession;
  onCityChange: (value: string) => void;
  onLogout: () => void;
  onReload: () => void;
}) {
  return (
    <Card title="Worker Session" actions={<StatusTag tone="success">Logged in</StatusTag>} style={workerPanelStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        <p style={helperText}>
          Authenticated as {session.userId}. Worker requests use Authorization: Bearer.
        </p>
        <FormField label="cityCode">
          <Input value={cityCode} onChange={(event) => onCityChange(event.target.value || DEFAULT_CITY_CODE)} />
        </FormField>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button onClick={onReload} variant="primary">
            Reload current view
          </Button>
          <Button onClick={onLogout}>Logout</Button>
        </div>
      </div>
    </Card>
  );
}

function HallPage({
  tasks,
  loading,
  error,
  acceptError,
  acceptNotice,
  acceptingDispatchTaskId,
  simulationAction,
  simulationControlsEnabled,
  cityCode,
  workerId,
  onRefresh,
  onAccept,
  onReject,
  onSimulateTimeout,
}: {
  tasks: WorkerTaskPoolItem[];
  loading: boolean;
  error: string | null;
  acceptError: string | null;
  acceptNotice: string | null;
  acceptingDispatchTaskId: string | null;
  simulationAction: { type: "reject" | "timeout"; dispatchTaskId: string } | null;
  simulationControlsEnabled: boolean;
  cityCode: string;
  workerId: string;
  onRefresh: () => void;
  onAccept: (dispatchTaskId: string) => void;
  onReject: (dispatchTaskId: string) => void;
  onSimulateTimeout: (dispatchTaskId: string) => void;
}) {
  return (
    <>
      <Card title="Task Pool Status" actions={<StatusTag tone="success">{tasks.length} available</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>
          city={cityCode}, worker={workerId}. Source: GET /api/worker/task-pool.
        </p>
      </Card>

      {loading && <LoadingState title="Loading task pool" description="Requesting real worker task pool data." />}
      {error && (
        <Card title="Load failed" actions={<StatusTag tone="danger">Error</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}
      {acceptError && (
        <Card title="Accept failed" actions={<StatusTag tone="danger">Error</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{acceptError}</p>
        </Card>
      )}
      {acceptNotice && (
        <Card title="Accept completed" actions={<StatusTag tone="success">Accepted</StatusTag>} style={workerPanelStyle}>
          <p style={helperText}>{acceptNotice}</p>
        </Card>
      )}

      {!loading && !error && (
        <Card title="Available Tasks" actions={<Button onClick={onRefresh}>Refresh</Button>} style={workerPanelStyle}>
          {tasks.length === 0 ? (
            <EmptyState title="No queued task" description="Create and pay an order, then let auto-run create a queued dispatch_task." />
          ) : (
            <Table
              rows={tasks}
              getRowKey={(row) => row.dispatchTaskId}
              columns={[
                { key: "dispatchTaskId", title: "Task ID", render: (row) => row.dispatchTaskId },
                { key: "orderId", title: "Order ID", render: (row) => row.orderId },
                { key: "skuId", title: "SKU", render: (row) => row.skuId },
                { key: "amount", title: "Amount", render: (row) => formatAmount(row.amount) },
                { key: "status", title: "Status", render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
                {
                  key: "actions",
                  title: "Action",
                  render: (row) => {
                    const busy = acceptingDispatchTaskId !== null || simulationAction !== null;
                    const acceptAction = workerWorkflowActions.acceptTask({
                      dispatchTaskStatus: row.status,
                      busy,
                      hasWorkerIdentity: Boolean(cityCode && workerId),
                    });
                    const canSimulate = simulationControlsEnabled && row.status === "offering";
                    return (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <Button
                          disabled={!acceptAction.enabled}
                          onClick={() => onAccept(row.dispatchTaskId)}
                          variant="primary"
                        >
                          {acceptingDispatchTaskId === row.dispatchTaskId ? "Accepting" : "Accept"}
                        </Button>
                        {simulationControlsEnabled && (
                          <>
                            <Button
                              disabled={!canSimulate || busy}
                              onClick={() => onReject(row.dispatchTaskId)}
                            >
                              {simulationAction?.type === "reject" && simulationAction.dispatchTaskId === row.dispatchTaskId
                                ? "Rejecting"
                                : "Reject"}
                            </Button>
                            <Button
                              disabled={!canSimulate || busy}
                              onClick={() => onSimulateTimeout(row.dispatchTaskId)}
                            >
                              {simulationAction?.type === "timeout" && simulationAction.dispatchTaskId === row.dispatchTaskId
                                ? "Timing out"
                                : "Timeout"}
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  },
                },
              ]}
            />
          )}
          <p style={{ ...helperText, color: "#ffd37d", marginTop: 10 }}>
            Boundary: Accept is real. Reject and timeout are test-only dispatch simulation controls.
          </p>
        </Card>
      )}
    </>
  );
}

function TasksPage({
  fulfillments,
  loading,
  error,
  onRefresh,
  onOpenDetail,
}: {
  fulfillments: Fulfillment[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenDetail: (id: string) => void;
}) {
  return (
    <>
      <Card title="Fulfillment Status" actions={<StatusTag tone="success">{fulfillments.length} total</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>Source: GET /api/worker/fulfillments. Open a task to start or complete service.</p>
      </Card>

      {loading && <LoadingState title="Loading fulfillments" description="Requesting real fulfillment list data." />}
      {error && (
        <Card title="Load failed" actions={<StatusTag tone="danger">Error</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}

      {!loading && !error && (
        <Card title="My Fulfillments" actions={<Button onClick={onRefresh}>Refresh</Button>} style={workerPanelStyle}>
          {fulfillments.length === 0 ? (
            <EmptyState title="No fulfillment yet" description="After a later accept action, accepted/in_progress/completed tasks appear here." />
          ) : (
            <Table
              rows={fulfillments}
              getRowKey={(row) => row.fulfillmentId}
              columns={[
                { key: "fulfillmentId", title: "Fulfillment ID", render: (row) => row.fulfillmentId },
                { key: "orderId", title: "Order ID", render: (row) => row.orderId },
                { key: "skuId", title: "SKU", render: (row) => row.skuId },
                { key: "status", title: "Status", render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
                { key: "detail", title: "Detail", render: (row) => <Button onClick={() => onOpenDetail(row.fulfillmentId)}>Open</Button> },
              ]}
            />
          )}
        </Card>
      )}
    </>
  );
}

function RepairOrdersPage({
  repairOrders,
  loading,
  error,
  busyId,
  notes,
  onRefresh,
  onNoteChange,
  onStart,
  onComplete,
}: {
  repairOrders: AftersaleRepairOrderResponse[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  notes: Record<string, string>;
  onRefresh: () => void;
  onNoteChange: (repairOrderId: string, note: string) => void;
  onStart: (repairOrderId: string) => void;
  onComplete: (repairOrderId: string, note: string) => void;
}) {
  return (
    <>
      {loading && <LoadingState title="Loading repair visits" description="Requesting assigned aftersale repair orders." />}
      {error && (
        <Card title="Repair request failed" actions={<StatusTag tone="danger">Error</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}
      <Card title="Assigned Repair Visits" actions={<Button onClick={onRefresh}>Refresh</Button>} style={workerPanelStyle}>
        {repairOrders.length === 0 && !loading ? (
          <EmptyState title="No repair visits" description="Assigned complaint repair tasks appear here." />
        ) : (
          <Table
            rows={repairOrders}
            getRowKey={(item) => item.repairOrderId}
            columns={[
              { key: "id", title: "Repair", render: (item) => item.repairOrderId },
              { key: "order", title: "Order", render: (item) => item.orderId },
              { key: "reason", title: "Reason", render: (item) => item.reason },
              { key: "status", title: "Status", render: (item) => <StatusTag tone={statusTone(item.status)}>{item.status}</StatusTag> },
              {
                key: "actions",
                title: "Actions",
                render: (item) => (
                  <div style={{ display: "grid", gap: 8, minWidth: 220 }}>
                    <FormField label="Completion note">
                      <Input value={notes[item.repairOrderId] ?? ""} onChange={(event) => onNoteChange(item.repairOrderId, event.target.value)} />
                    </FormField>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Button disabled={item.status !== "assigned" || busyId === item.repairOrderId} onClick={() => onStart(item.repairOrderId)}>Start</Button>
                      <Button
                        variant="primary"
                        disabled={item.status !== "in_progress" || busyId === item.repairOrderId || !(notes[item.repairOrderId] ?? "").trim()}
                        onClick={() => onComplete(item.repairOrderId, (notes[item.repairOrderId] ?? "").trim())}
                      >
                        Complete
                      </Button>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}

function TaskDetailPage({
  fulfillment,
  loading,
  error,
  fulfillmentId,
  lifecycleError,
  lifecycleNotice,
  lifecycleAction,
  onBack,
  onStart,
  onComplete,
}: {
  fulfillment: Fulfillment | null;
  loading: boolean;
  error: string | null;
  fulfillmentId: string;
  lifecycleError: string | null;
  lifecycleNotice: string | null;
  lifecycleAction: "start" | "complete" | null;
  onBack: () => void;
  onStart: (fulfillmentId: string) => void;
  onComplete: (fulfillmentId: string) => void;
}) {
  const lifecycleBusy = lifecycleAction !== null;
  const startAction = workerWorkflowActions.startFulfillment({
    fulfillmentStatus: fulfillment?.status,
    busy: lifecycleBusy,
    hasWorkerIdentity: Boolean(fulfillment?.workerId),
  });
  const completeAction = workerWorkflowActions.completeFulfillment({
    fulfillmentStatus: fulfillment?.status,
    busy: lifecycleBusy,
    hasWorkerIdentity: Boolean(fulfillment?.workerId),
  });
  const canStart = startAction.enabled;
  const canComplete = completeAction.enabled;

  const rows = fulfillment
    ? [
        ["fulfillmentId", fulfillment.fulfillmentId],
        ["acceptanceId", fulfillment.acceptanceId],
        ["dispatchTaskId", fulfillment.dispatchTaskId],
        ["orderId", fulfillment.orderId],
        ["cityCode", fulfillment.cityCode],
        ["workerId", fulfillment.workerId],
        ["skuId", fulfillment.skuId],
        ["status", fulfillment.status],
        ["startedAt", formatNullable(fulfillment.startedAt)],
        ["completedAt", formatNullable(fulfillment.completedAt)],
        ["completionNote", formatNullable(fulfillment.completionNote)],
        ["createdAt", fulfillment.createdAt],
        ["updatedAt", fulfillment.updatedAt],
      ]
    : [];

  return (
    <>
      <Card title="Fulfillment Detail" actions={<StatusTag tone="success">Real API</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>Source: GET /api/worker/fulfillments/{fulfillmentId}</p>
      </Card>

      {loading && <LoadingState title="Loading detail" description="Requesting real fulfillment detail data." />}
      {error && (
        <Card title="Load failed" actions={<StatusTag tone="danger">Error</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}
      {lifecycleError && (
        <Card title="Action failed" actions={<StatusTag tone="danger">Error</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{lifecycleError}</p>
        </Card>
      )}
      {lifecycleNotice && (
        <Card title="Action completed" actions={<StatusTag tone="success">Updated</StatusTag>} style={workerPanelStyle}>
          <p style={helperText}>{lifecycleNotice}</p>
        </Card>
      )}

      {!loading && !error && fulfillment && (
        <Card title="Field Snapshot" style={workerPanelStyle}>
          <Table
            rows={rows}
            getRowKey={(row) => row[0]}
            columns={[
              { key: "field", title: "Field", render: (row) => row[0] },
              { key: "value", title: "Value", render: (row) => row[1] },
            ]}
          />
        </Card>
      )}

      <Card title="Actions" actions={<StatusTag tone="success">Lifecycle</StatusTag>} style={workerPanelStyle}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button
            disabled={!canStart}
            onClick={() => onStart(fulfillmentId)}
            variant="primary"
          >
            {lifecycleAction === "start" ? "Starting" : "Start service"}
          </Button>
          <Button
            disabled={!canComplete}
            onClick={() => onComplete(fulfillmentId)}
            variant="primary"
          >
            {lifecycleAction === "complete" ? "Completing" : "Complete service"}
          </Button>
          <Button onClick={onBack}>Back to list</Button>
        </div>
        <p style={{ ...helperText, color: "#ffd37d", marginTop: 10 }}>
          Boundary: only start and complete fulfillment actions are enabled in P1 stage 3.
        </p>
      </Card>
    </>
  );
}

function PlaceholderPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title} actions={<StatusTag tone="warning">Not wired</StatusTag>} style={workerPanelStyle}>
      <p style={helperText}>{children}</p>
    </Card>
  );
}

function CertificationPage({
  cityCode,
  workerId,
  certType,
  certName,
  submitting,
  error,
  notice,
  onCertTypeChange,
  onCertNameChange,
  onSubmit,
}: QueryParams & {
  workerId: string;
  certType: string;
  certName: string;
  submitting: boolean;
  error: string | null;
  notice: string | null;
  onCertTypeChange: (value: string) => void;
  onCertNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card title="Certification Apply" actions={<StatusTag tone={notice ? "success" : "warning"}>Real API</StatusTag>} style={workerPanelStyle}>
      <div style={mutedBoxStyle}>
        <p style={helperText}>
          Submitting uses POST /api/worker/certifications for {workerId} in {cityCode}.
        </p>
        <FormField label="certType">
          <Input value={certType} onChange={(event) => onCertTypeChange(event.target.value)} />
        </FormField>
        <FormField label="certName">
          <Input value={certName} onChange={(event) => onCertNameChange(event.target.value)} />
        </FormField>
        <Button
          disabled={submitting || !certType.trim() || !certName.trim()}
          onClick={onSubmit}
          variant="primary"
        >
          {submitting ? "Submitting" : "Submit certification"}
        </Button>
        {error && <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>}
        {notice && <p style={helperText}>{notice}</p>}
        <p style={helperText}>
          Certification status/profile read APIs are not available yet, so this page does not invent a local approved state.
        </p>
      </div>
    </Card>
  );
}

export function App() {
  const initialQuery = readQueryParams();
  const [route, setRoute] = useState<ResolvedRoute>(resolveRoute);
  const [workerCityCode, setWorkerCityCode] = useState(initialQuery.cityCode);
  const [session, setSession] = useState<WorkerSession | null>(null);
  const [taskPool, setTaskPool] = useState<WorkerTaskPoolItem[]>([]);
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [repairOrders, setRepairOrders] = useState<AftersaleRepairOrderResponse[]>([]);
  const [repairNotes, setRepairNotes] = useState<Record<string, string>>({});
  const [taskDetail, setTaskDetail] = useState<Fulfillment | null>(null);
  const [loadingHall, setLoadingHall] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingRepairs, setLoadingRepairs] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [acceptingDispatchTaskId, setAcceptingDispatchTaskId] = useState<string | null>(null);
  const [simulationAction, setSimulationAction] = useState<{ type: "reject" | "timeout"; dispatchTaskId: string } | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<"start" | "complete" | null>(null);
  const [hallError, setHallError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [repairsError, setRepairsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
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

  const api = useMemo(
    () => (session ? createWorkerApiClient(workerCityCode, session) : null),
    [session, workerCityCode],
  );

  const handleApiError = useCallback(
    (error: unknown, fallback: string, setError: (message: string) => void) => {
      if (isUnauthorizedError(error)) {
        setSession(null);
        setError("Session expired. Please login again.");
        return;
      }
      setError(error instanceof Error ? error.message : fallback);
    },
    [],
  );

  const loadTaskPool = useCallback(async () => {
    if (!api) return;
    setLoadingHall(true);
    setHallError(null);
    try {
      const response = await api.getTaskPool();
      setTaskPool(response.tasks);
    } catch (error) {
      handleApiError(error, "Failed to load task pool", setHallError);
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
      handleApiError(error, "Failed to load fulfillments", setTasksError);
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

  const reloadCurrent = useCallback(() => {
    if (route.route === "hall") void loadTaskPool();
    if (route.route === "tasks") void loadFulfillments();
    if (route.route === "taskDetail") void loadTaskDetail(route.fulfillmentId);
    if (route.route === "repairs") void loadRepairOrders();
  }, [loadFulfillments, loadRepairOrders, loadTaskDetail, loadTaskPool, route]);

  const acceptTask = useCallback(
    async (dispatchTaskId: string) => {
      if (!api) return;
      setAcceptingDispatchTaskId(dispatchTaskId);
      setAcceptError(null);
      setAcceptNotice(null);
      try {
        const response = await api.acceptTask(dispatchTaskId);
        setAcceptNotice(
          `Accepted ${response.acceptance.dispatchTaskId}; fulfillment ${response.fulfillment.fulfillmentId} is now ${response.fulfillment.status}.`,
        );
        await Promise.all([loadTaskPool(), loadFulfillments()]);
      } catch (error) {
        handleApiError(error, "Failed to accept task", setAcceptError);
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
      await Promise.all([loadTaskPool(), loadFulfillments(), loadTaskDetail(fulfillmentId)]);
    },
    [loadFulfillments, loadTaskDetail, loadTaskPool],
  );

  const startFulfillment = useCallback(
    async (fulfillmentId: string) => {
      if (!api) return;
      setLifecycleAction("start");
      setLifecycleError(null);
      setLifecycleNotice(null);
      try {
        const response = await api.startFulfillment(fulfillmentId);
        setLifecycleNotice(`Fulfillment ${response.fulfillment.fulfillmentId} is now ${response.fulfillment.status}.`);
        await refreshFulfillmentState(fulfillmentId);
      } catch (error) {
        handleApiError(error, "Failed to start service", setLifecycleError);
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
        setLifecycleNotice(`Fulfillment ${response.fulfillment.fulfillmentId} is now ${response.fulfillment.status}.`);
        await refreshFulfillmentState(fulfillmentId);
      } catch (error) {
        handleApiError(error, "Failed to complete service", setLifecycleError);
      } finally {
        setLifecycleAction(null);
      }
    },
    [api, handleApiError, refreshFulfillmentState],
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

  const clearWorkerData = useCallback(() => {
    setTaskPool([]);
    setFulfillments([]);
    setRepairOrders([]);
    setRepairNotes({});
    setTaskDetail(null);
    setHallError(null);
    setTasksError(null);
    setRepairsError(null);
    setDetailError(null);
    setAcceptError(null);
    setAcceptNotice(null);
    setLifecycleError(null);
    setLifecycleNotice(null);
    setRepairBusyId(null);
    setCertError(null);
    setCertNotice(null);
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

  if (!session) {
    return (
      <WorkerLoginPage
        cityCode={workerCityCode}
        onCityChange={setWorkerCityCode}
        onLogin={handleLogin}
      />
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
        onBack={() => navigate("/worker/tasks")}
        onStart={(fulfillmentId) => void startFulfillment(fulfillmentId)}
        onComplete={(fulfillmentId) => void completeFulfillment(fulfillmentId)}
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
      <PlaceholderPage title="Wallet">
        Income, statement, and payout surfaces are outside this stage. No wallet write action is added.
      </PlaceholderPage>
    ) : route.route === "profile" ? (
      <PlaceholderPage title="Profile">
        Current worker session is {session.userId} / {workerCityCode}.
      </PlaceholderPage>
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
        onReload={reloadCurrent}
      />
      {content}
    </AppFrame>
  );
}
