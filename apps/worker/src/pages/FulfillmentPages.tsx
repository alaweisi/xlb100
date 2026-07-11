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
import { formatNullable, helperText, statusTone, workerPanelStyle } from "./pageShared";

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

      <Card title="Fulfillment Evidence" actions={<StatusTag tone="primary">Local / Mock only</StatusTag>} style={workerPanelStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <FormField label="Evidence node">
            <Select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as FulfillmentEvidenceType)}>
              <option value="arrival">Arrival</option><option value="before_service">Before service</option>
              <option value="diagnosis">Diagnosis</option><option value="material">Material</option>
              <option value="after_service">After service</option><option value="completion">Completion</option>
            </Select>
          </FormField>
          <FormField label="Image (JPEG / PNG / WebP, max 5 MiB)">
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)} />
          </FormField>
          <FormField label="Complaint ID (optional)"><Input value={evidenceComplaintId} onChange={(event) => setEvidenceComplaintId(event.target.value)} /></FormField>
          <FormField label="Evidence note"><Textarea value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} /></FormField>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button variant="primary" disabled={!evidenceFile || evidenceBusy} onClick={() => evidenceFile && onUploadEvidence(fulfillmentId,evidenceFile,{
              evidenceType,complaintId:evidenceComplaintId.trim()||undefined,note:evidenceNote.trim()||undefined,
            })}>{evidenceBusy ? "Uploading" : "Store evidence"}</Button>
            <Button disabled={evidenceLoading} onClick={() => onRefreshEvidence(fulfillmentId)}>Refresh evidence</Button>
          </div>
          <p style={helperText}>Storage is private. Provider state is stored_local or stored_mock; externalProviderExecuted is always false.</p>
        </div>
      </Card>

      {evidenceError && <Card title="Evidence action failed" actions={<StatusTag tone="danger">Error</StatusTag>} style={workerPanelStyle}><p style={helperText}>{evidenceError}</p></Card>}
      {evidenceLoading && <LoadingState title="Loading evidence" description="Reading private evidence metadata." />}
      {!evidenceLoading && evidenceAggregate && (
        <Card title="Evidence Timeline" actions={<StatusTag tone={evidenceAggregate.confirmation?.status === "confirmed" ? "success" : "warning"}>{evidenceAggregate.confirmation?.status ?? "not completed"}</StatusTag>} style={workerPanelStyle}>
          {evidenceAggregate.evidence.length===0?<EmptyState title="No evidence uploaded" />:<Table rows={evidenceAggregate.evidence} getRowKey={(item)=>item.evidenceId} columns={[
            {key:"type",title:"Node",render:(item)=>item.evidenceType},
            {key:"file",title:"File",render:(item)=>item.mediaAsset.originalFileName},
            {key:"provider",title:"Provider",render:(item)=><StatusTag tone="primary">{item.mediaAsset.storage.providerStatus}</StatusTag>},
            {key:"hash",title:"SHA-256",render:(item)=>item.mediaAsset.checksumSha256.slice(0,12)},
            {key:"scan",title:"Security",render:(item)=>item.mediaAsset.securityScanStatus},
          ]}/>}
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
          Phase 18 keeps lifecycle actions and evidence writes separate; customer confirmation is customer-owned.
        </p>
      </Card>
    </>
  );
}
