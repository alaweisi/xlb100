import type { Fulfillment, WorkerTaskPoolItem } from "@xlb/types";
import { Button, Card, EmptyState, LoadingState, StatusTag, Table } from "@xlb/ui";
import { workerWorkflowActions } from "../adapters/workflowBindings";
import { IS_WORKER_INVESTOR_DEMO, workerDemoCityLabel } from "../investorDemo";
import { formatAmount, helperText, statusLabel, statusTone, workerPanelStyle } from "./pageShared";

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
      <Card title="任务池概览" actions={<StatusTag tone="success">{tasks.length} 个待接任务</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>
          当前服务区：{workerDemoCityLabel(cityCode)}
          {IS_WORKER_INVESTOR_DEMO ? "，当前为演示师傅账号。" : `，师傅：${workerId}。`}
          点击任务即可接单。
        </p>
      </Card>

      {loading && <LoadingState title="正在加载任务池" description="正在同步可接取的演示任务。" />}
      {error && (
        <Card title="任务池加载失败" actions={<Button onClick={onRefresh}>重新加载</Button>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}
      {acceptError && (
        <Card title="接单未完成" actions={<Button onClick={onRefresh}>刷新任务状态</Button>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{acceptError}</p>
        </Card>
      )}
      {acceptNotice && (
        <Card title="接单成功" actions={<StatusTag tone="success">已接单</StatusTag>} style={workerPanelStyle}>
          <p style={helperText}>{acceptNotice}</p>
        </Card>
      )}

      {!loading && !error && (
        <Card title="可接任务" actions={<Button onClick={onRefresh}>刷新</Button>} style={workerPanelStyle}>
          {tasks.length === 0 ? (
            <EmptyState title="暂无待接任务" description="请先在客户端创建演示订单，再回到这里刷新任务池。" />
          ) : (
            <Table
              rows={tasks}
              getRowKey={(row) => row.dispatchTaskId}
              columns={[
                { key: "dispatchTaskId", title: "任务编号", render: (row) => row.dispatchTaskId },
                { key: "orderId", title: "订单编号", render: (row) => row.orderId },
                { key: "skuId", title: "服务项目", render: (row) => row.skuId },
                { key: "amount", title: "金额", render: (row) => formatAmount(row.amount) },
                { key: "status", title: "状态", render: (row) => <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> },
                {
                  key: "actions",
                  title: "操作",
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
                          {acceptingDispatchTaskId === row.dispatchTaskId ? "正在接单…" : "接单"}
                        </Button>
                        {simulationControlsEnabled && (
                          <>
                            <Button
                              disabled={!canSimulate || busy}
                              onClick={() => onReject(row.dispatchTaskId)}
                            >
                              {simulationAction?.type === "reject" && simulationAction.dispatchTaskId === row.dispatchTaskId
                                ? "正在拒绝…"
                                : "拒绝任务"}
                            </Button>
                            <Button
                              disabled={!canSimulate || busy}
                              onClick={() => onSimulateTimeout(row.dispatchTaskId)}
                            >
                              {simulationAction?.type === "timeout" && simulationAction.dispatchTaskId === row.dispatchTaskId
                                ? "正在模拟超时…"
                                : "模拟超时"}
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
            演示包只开放固定业务链所需的接单操作；支付、短信与地图均为模拟能力。
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
      <Card title="服务单概览" actions={<StatusTag tone="success">共 {fulfillments.length} 单</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>打开服务单即可开始服务、上传演示凭证并提交完成。</p>
      </Card>

      {loading && <LoadingState title="正在加载服务单" description="正在同步已接取的演示任务。" />}
      {error && (
        <Card title="服务单加载失败" actions={<Button onClick={onRefresh}>重新加载</Button>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}

      {!loading && !error && (
        <Card title="我的服务单" actions={<Button onClick={onRefresh}>刷新</Button>} style={workerPanelStyle}>
          {fulfillments.length === 0 ? (
            <EmptyState title="暂无服务单" description="接单成功后，服务单会出现在这里。" />
          ) : (
            <Table
              rows={fulfillments}
              getRowKey={(row) => row.fulfillmentId}
              columns={[
                { key: "fulfillmentId", title: "服务单号", render: (row) => row.fulfillmentId },
                { key: "orderId", title: "订单号", render: (row) => row.orderId },
                { key: "skuId", title: "服务项目", render: (row) => row.skuId },
                { key: "status", title: "状态", render: (row) => <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> },
                { key: "detail", title: "操作", render: (row) => <Button onClick={() => onOpenDetail(row.fulfillmentId)}>查看详情</Button> },
              ]}
            />
          )}
        </Card>
      )}
    </>
  );
}
