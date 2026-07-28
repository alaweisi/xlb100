import { useState } from "react";
import type { Fulfillment, FulfillmentEvidenceType } from "@xlb/types";
import type {
  AftersaleRepairOrderResponse,
  FulfillmentEvidenceAggregateResponse,
} from "@xlb/api-client";
import {
  Button, Card, EmptyState, FormField, Input, LoadingState, Select, StatusTag, Table, Textarea,
} from "@xlb/ui";
import { workerWorkflowActions } from "../adapters/workflowBindings";
import { IS_WORKER_INVESTOR_DEMO, workerDemoCityLabel } from "../investorDemo";
import { formatNullable, helperText, statusLabel, statusTone, workerPanelStyle } from "./pageShared";

function evidenceTypeLabel(value: FulfillmentEvidenceType): string {
  const labels: Partial<Record<FulfillmentEvidenceType, string>> = {
    arrival: "到达现场",
    before_service: "服务前",
    diagnosis: "现场检查",
    material: "服务材料",
    after_service: "服务后",
    completion: "完工凭证",
  };
  return labels[value] ?? "服务凭证";
}

export function RepairOrdersPage({
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

export function TaskDetailPage({
  fulfillment,
  loading,
  error,
  fulfillmentId,
  lifecycleError,
  lifecycleNotice,
  lifecycleAction,
  evidenceAggregate,
  evidenceLoading,
  evidenceError,
  evidenceBusy,
  onBack,
  onRetry,
  onStart,
  onComplete,
  onRefreshEvidence,
  onUploadEvidence,
}: {
  fulfillment: Fulfillment | null;
  loading: boolean;
  error: string | null;
  fulfillmentId: string;
  lifecycleError: string | null;
  lifecycleNotice: string | null;
  lifecycleAction: "start" | "complete" | null;
  evidenceAggregate: FulfillmentEvidenceAggregateResponse | null;
  evidenceLoading: boolean;
  evidenceError: string | null;
  evidenceBusy: boolean;
  onBack: () => void;
  onRetry: (fulfillmentId: string) => void;
  onStart: (fulfillmentId: string) => void;
  onComplete: (fulfillmentId: string) => void;
  onRefreshEvidence: (fulfillmentId: string) => void;
  onUploadEvidence: (fulfillmentId: string, file: File, metadata: { evidenceType: FulfillmentEvidenceType; complaintId?: string; note?: string }) => void;
}) {
  const [evidenceType, setEvidenceType] = useState<FulfillmentEvidenceType>("before_service");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceComplaintId, setEvidenceComplaintId] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
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
        ["服务单号", fulfillment.fulfillmentId],
        ["订单号", fulfillment.orderId],
        ["服务城市", workerDemoCityLabel(fulfillment.cityCode)],
        ["演示师傅", IS_WORKER_INVESTOR_DEMO ? "当前登录师傅" : fulfillment.workerId],
        ["服务项目", fulfillment.skuId],
        ["当前状态", statusLabel(fulfillment.status)],
        ["开始时间", formatNullable(fulfillment.startedAt)],
        ["完成时间", formatNullable(fulfillment.completedAt)],
        ["完工说明", formatNullable(fulfillment.completionNote)],
      ]
    : [];

  return (
    <>
      <Card title="服务单详情" actions={<StatusTag tone="success">演示服务已连接</StatusTag>} style={workerPanelStyle}>
        <p style={helperText}>请按“开始服务 → 完成服务”顺序操作，并等待客户确认。</p>
      </Card>

      {loading && <LoadingState title="正在加载服务单" description="正在同步最新服务进度。" />}
      {error && (
        <Card title="服务单加载失败" actions={<Button onClick={() => onRetry(fulfillmentId)}>重新加载</Button>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>
        </Card>
      )}
      {lifecycleError && (
        <Card title="操作未完成" actions={<Button onClick={() => onRetry(fulfillmentId)}>刷新服务状态</Button>} style={workerPanelStyle}>
          <p style={{ ...helperText, color: "#fda29b" }}>{lifecycleError}</p>
        </Card>
      )}
      {lifecycleNotice && (
        <Card title="操作成功" actions={<StatusTag tone="success">状态已更新</StatusTag>} style={workerPanelStyle}>
          <p style={helperText}>{lifecycleNotice}</p>
        </Card>
      )}

      {!loading && !error && fulfillment && (
        <Card title="服务信息" style={workerPanelStyle}>
          <Table
            rows={rows}
            getRowKey={(row) => row[0]}
            columns={[
              { key: "field", title: "项目", render: (row) => row[0] },
              { key: "value", title: "内容", render: (row) => row[1] },
            ]}
          />
        </Card>
      )}

      <Card title="服务凭证" actions={<StatusTag tone="primary">仅供模拟演示</StatusTag>} style={workerPanelStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="凭证阶段">
            <Select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as FulfillmentEvidenceType)}>
              <option value="arrival">到达现场</option><option value="before_service">服务前</option>
              <option value="diagnosis">现场检查</option><option value="material">服务材料</option>
              <option value="after_service">服务后</option><option value="completion">完工凭证</option>
            </Select>
          </FormField>
          <FormField label="现场图片（最大 5 MB）">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} />
          </FormField>
          <FormField label="关联售后单（选填）"><Input value={evidenceComplaintId} onChange={(event) => setEvidenceComplaintId(event.target.value)} /></FormField>
          <FormField label="凭证说明"><Textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} /></FormField>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button variant="primary" disabled={!evidenceFile || evidenceBusy} onClick={() => evidenceFile && onUploadEvidence(fulfillmentId,evidenceFile,{
              evidenceType,complaintId:evidenceComplaintId.trim()||undefined,note:evidenceNote.trim()||undefined,
            })}>{evidenceBusy ? "正在上传…" : "保存服务凭证"}</Button>
            <Button disabled={evidenceLoading} onClick={() => onRefreshEvidence(fulfillmentId)}>刷新凭证</Button>
          </div>
          <p style={helperText}>凭证仅用于本次模拟演示，只保存在隔离的演示环境，不会发送到第三方服务。</p>
        </div>
      </Card>

      {evidenceError && <Card title="凭证操作未完成" actions={<Button onClick={() => onRefreshEvidence(fulfillmentId)}>重新加载</Button>} style={workerPanelStyle}><p style={helperText}>{evidenceError}</p></Card>}
      {evidenceLoading && <LoadingState title="正在加载服务凭证" description="正在读取本次服务的凭证记录。" />}
      {!evidenceLoading && evidenceAggregate && (
        <Card title="凭证记录" actions={<StatusTag tone={evidenceAggregate.confirmation?.status === "confirmed" ? "success" : "warning"}>{evidenceAggregate.confirmation?.status === "confirmed" ? "客户已确认" : "等待客户确认"}</StatusTag>} style={workerPanelStyle}>
          {evidenceAggregate.evidence.length===0?<EmptyState title="尚未上传服务凭证" />:<Table rows={evidenceAggregate.evidence} getRowKey={(item)=>item.evidenceId} columns={[
            {key:"type",title:"阶段",render:(item)=>evidenceTypeLabel(item.evidenceType)},
            {key:"file",title:"文件",render:(item)=>item.mediaAsset.originalFileName},
            {key:"provider",title:"保存状态",render:()=><StatusTag tone="primary">已保存到演示环境</StatusTag>},
          ]}/>}
        </Card>
      )}

      <Card title="服务操作" actions={<StatusTag tone="success">固定演示链</StatusTag>} style={workerPanelStyle}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button
            disabled={!canStart}
            onClick={() => onStart(fulfillmentId)}
            variant="primary"
          >
            {lifecycleAction === "start" ? "正在开始…" : "开始服务"}
          </Button>
          <Button
            disabled={!canComplete}
            onClick={() => onComplete(fulfillmentId)}
            variant="primary"
          >
            {lifecycleAction === "complete" ? "正在提交…" : "完成服务"}
          </Button>
          <Button onClick={onBack}>返回服务单列表</Button>
        </div>
        <p style={{ ...helperText, color: "#ffd37d", marginTop: 10 }}>
          完成服务后，请切换到客户端进行确认与评价。
        </p>
      </Card>
    </>
  );
}
