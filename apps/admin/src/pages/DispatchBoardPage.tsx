import { useCallback, useEffect, useState } from "react";
import type { DispatchBoardRow } from "@xlb/api-client";
import {
  ApiErrorPanel,
  Button,
  Card,
  EmptyState,
  ScopeBadge,
  StatusTag,
  Table,
} from "@xlb/ui";
import { adminOpsApi as api, adminVisibleError } from "../adminAuth";
import { adminDemoCityLabel, IS_ADMIN_INVESTOR_DEMO } from "../investorDemo";

function dispatchStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    accepted: "已接单",
    no_match: "待重新匹配",
    offering: "等待师傅响应",
    queued: "等待派单",
    reassigning: "重新派单中",
    timeout: "响应超时",
  };
  return labels[status] ?? "处理中";
}

export function DispatchBoardPage({
  initialCityCode,
  canManage = true,
}: {
  initialCityCode?: string;
  canManage?: boolean;
}) {
  const [rows, setRows] = useState<DispatchBoardRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setRows((await api.listDispatchBoard()).rows);
    } catch (caught) {
      setError(adminVisibleError(caught, "派单列表暂时无法加载，请稍后重试。"));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (caught) {
      setError(adminVisibleError(caught, "派单操作未完成，请刷新后重试。"));
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="智能派单看板"
        actions={
          <>
            <ScopeBadge scope={`城市：${adminDemoCityLabel(initialCityCode || "hangzhou")}`} />
            <StatusTag tone="success">隐私位置已保护</StatusTag>
          </>
        }
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button onClick={() => void load()} disabled={busy}>刷新列表</Button>
          {canManage && (
            <Button
              variant="primary"
              onClick={() => void act(() => api.runDispatchMatch())}
              disabled={busy}
            >
              为待处理订单匹配师傅
            </Button>
          )}
        </div>
      </Card>
      {error && (
        <ApiErrorPanel
          title="派单服务暂时不可用"
          detail={error}
          action={<Button onClick={() => void load()}>重新加载</Button>}
        />
      )}
      <Card
        title="待处理任务"
        actions={<StatusTag tone="warning">不显示精确坐标</StatusTag>}
      >
        {rows.length === 0 && !busy ? (
          <EmptyState
            title="当前没有待派任务"
            description="客户下单后，待派任务会显示在这里。"
          />
        ) : (
          <Table
            rows={rows}
            getRowKey={(row) => `${row.dispatchTaskId}:${row.offer?.offerId || "task"}`}
            columns={[
              { key: "task", title: "派单任务", render: (row) => row.dispatchTaskId },
              {
                key: "service",
                title: "服务",
                render: (row) => IS_ADMIN_INVESTOR_DEMO ? "演示服务项目" : row.skuId,
              },
              {
                key: "state",
                title: "状态",
                render: (row) => (
                  <StatusTag tone={row.status === "accepted" ? "success" : "primary"}>
                    {dispatchStatusLabel(row.status)}
                  </StatusTag>
                ),
              },
              {
                key: "worker",
                title: "候选师傅",
                render: (row) => row.offer
                  ? (IS_ADMIN_INVESTOR_DEMO ? "已匹配演示师傅" : row.offer.workerId)
                  : "待匹配",
              },
              {
                key: "distance",
                title: "预计距离与到达时间",
                render: (row) => row.offer
                  ? `${row.offer.distanceKm ?? "-"} 公里 / ${row.offer.etaMinutes ?? "-"} 分钟`
                  : "-",
              },
              ...(canManage
                ? [{
                    key: "action",
                    title: "操作",
                    render: (row: DispatchBoardRow) => (
                      <Button
                        disabled={
                          busy
                          || !["queued", "reassigning", "no_match"].includes(row.status)
                        }
                        onClick={() => void act(() => api.runDispatchMatch(row.dispatchTaskId))}
                      >
                        重新匹配
                      </Button>
                    ),
                  }]
                : []),
            ]}
          />
        )}
      </Card>
    </div>
  );
}
