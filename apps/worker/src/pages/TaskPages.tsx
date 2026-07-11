import type { Fulfillment, WorkerTaskPoolItem } from "@xlb/types";
import { Button, Card, EmptyState, LoadingState, StatusTag, Table } from "@xlb/ui";
import { workerWorkflowActions } from "../adapters/workflowBindings";
import { formatAmount, helperText, statusTone, workerPanelStyle } from "./pageShared";

export function HallPage({
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

export function TasksPage({
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
