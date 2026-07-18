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
      <Card title="今日接单" actions={<StatusTag tone="success">{tasks.length} 个可接任务</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>
          工作城市：{cityCode === "hangzhou" ? "杭州" : cityCode === "shanghai" ? "上海" : "北京"}。新任务会按照服务资格和城市范围进入这里。
        </p>
      </Card>

      {loading && <LoadingState title="正在加载任务大厅" description="正在读取真实师傅任务数据。" />}
      {error && (
        <Card title="任务加载失败" actions={<StatusTag tone="danger">错误</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}
      {acceptError && (
        <Card title="接单失败" actions={<StatusTag tone="danger">错误</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{acceptError}</p>
        </Card>
      )}
      {acceptNotice && (
        <Card title="接单完成" actions={<StatusTag tone="success">已承接</StatusTag>} style={workerPanelStyle}>
          <p style={helperText}>{acceptNotice}</p>
        </Card>
      )}

      {!loading && !error && (
        <Card title="可承接任务" actions={<Button onClick={onRefresh}>刷新</Button>} style={workerPanelStyle}>
          {tasks.length === 0 ? (
            <EmptyState title="当前没有待接任务" description="新任务进入本城市派单队列后会显示在这里。" />
          ) : (
            <Table
              rows={tasks}
              getRowKey={(row) => row.dispatchTaskId}
              columns={[
                { key: "dispatchTaskId", title: "派单编号", render: (row) => row.dispatchTaskId },
                { key: "orderId", title: "订单编号", render: (row) => row.orderId },
                { key: "skuId", title: "服务编号", render: (row) => row.skuId },
                { key: "amount", title: "服务金额", render: (row) => formatAmount(row.amount) },
                { key: "status", title: "当前状态", render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
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
                          {acceptingDispatchTaskId === row.dispatchTaskId ? "正在接单" : "立即接单"}
                        </Button>
                        {simulationControlsEnabled && (
                          <>
                            <Button
                              disabled={!canSimulate || busy}
                              onClick={() => onReject(row.dispatchTaskId)}
                            >
                              {simulationAction?.type === "reject" && simulationAction.dispatchTaskId === row.dispatchTaskId
                                ? "正在拒绝"
                                : "拒绝"}
                            </Button>
                            <Button
                              disabled={!canSimulate || busy}
                              onClick={() => onSimulateTimeout(row.dispatchTaskId)}
                            >
                              {simulationAction?.type === "timeout" && simulationAction.dispatchTaskId === row.dispatchTaskId
                                ? "正在超时"
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
          {simulationControlsEnabled && <p style={{ ...helperText, color: "#ffd37d", marginTop: 10 }}>
            开发环境边界：接单连接真实业务；拒绝与超时按钮只用于本地派单状态验证。
          </p>}
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
      <Card title="履约任务" actions={<StatusTag tone="success">共 {fulfillments.length} 个</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>打开任务可开始服务、上传凭证或登记完成结果。</p>
      </Card>

      {loading && <LoadingState title="正在加载履约任务" description="正在读取已承接的真实任务。" />}
      {error && (
        <Card title="任务加载失败" actions={<StatusTag tone="danger">错误</StatusTag>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}

      {!loading && !error && (
        <Card title="我的履约任务" actions={<Button onClick={onRefresh}>刷新</Button>} style={workerPanelStyle}>
          {fulfillments.length === 0 ? (
            <EmptyState title="暂无履约任务" description="接单成功后，待服务、服务中和已完成任务会显示在这里。" />
          ) : (
            <Table
              rows={fulfillments}
              getRowKey={(row) => row.fulfillmentId}
              columns={[
                { key: "fulfillmentId", title: "履约编号", render: (row) => row.fulfillmentId },
                { key: "orderId", title: "订单编号", render: (row) => row.orderId },
                { key: "skuId", title: "服务编号", render: (row) => row.skuId },
                { key: "status", title: "当前状态", render: (row) => <StatusTag tone={statusTone(row.status)}>{row.status}</StatusTag> },
                { key: "detail", title: "详情", render: (row) => <Button onClick={() => onOpenDetail(row.fulfillmentId)}>打开</Button> },
              ]}
            />
          )}
        </Card>
      )}
    </>
  );
}
