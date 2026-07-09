import { useCallback, useEffect, useState } from "react";
import { type WorkerWithdrawalResponse } from "@xlb/api-client";
import {
  ApiErrorPanel,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  ScopeBadge,
  StatusTag,
  Table,
} from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";

function statusTone(status: WorkerWithdrawalResponse["status"]): "success" | "warning" | "muted" | "primary" {
  if (status === "marked_paid") return "success";
  if (status === "requested") return "warning";
  if (status === "approved") return "primary";
  return "muted";
}

interface Props {
  initialCityCode?: string;
}

export function WorkerWithdrawalsPage({ initialCityCode }: Props) {
  const [cityCode, setCityCode] = useState(initialCityCode || "hangzhou");
  const [withdrawals, setWithdrawals] = useState<WorkerWithdrawalResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listWorkerWithdrawals({ cityCode, limit: 100 });
      setWithdrawals(response.withdrawals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load worker withdrawals failed");
    } finally {
      setLoading(false);
    }
  }, [cityCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(
    withdrawalId: string,
    action: "approve" | "reject" | "markPaid",
  ) {
    setBusyId(withdrawalId);
    setError(null);
    try {
      if (action === "approve") {
        await api.reviewWorkerWithdrawal(withdrawalId, { decision: "approved" });
      } else if (action === "reject") {
        await api.reviewWorkerWithdrawal(withdrawalId, { decision: "rejected" });
      } else {
        await api.markWorkerWithdrawalPaid(withdrawalId, {});
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "worker withdrawal mutation failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="Worker Withdrawals"
        actions={<ScopeBadge scope={`city: ${cityCode}`} />}
      >
        <div style={{ display: "grid", gap: 12 }}>
          <FormField label="City">
            <Input value={cityCode} onChange={(event) => setCityCode(event.target.value)} />
          </FormField>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => void load()} variant="primary" disabled={loading}>
              {loading ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

      {loading && <LoadingState title="Loading worker withdrawals" />}
      {error && <ApiErrorPanel title="Request failed" detail={error} action={<Button onClick={() => void load()}>Retry</Button>} />}

      <Card title="Withdrawal Queue" actions={<StatusTag tone="muted">{withdrawals.length} rows</StatusTag>}>
        {!loading && withdrawals.length === 0 ? (
          <EmptyState title="No withdrawal requests" />
        ) : (
          <Table
            rows={withdrawals}
            getRowKey={(item) => item.withdrawalId}
            emptyText="No withdrawal requests"
            columns={[
              { key: "id", title: "Request", render: (item) => item.withdrawalId },
              { key: "worker", title: "Worker", render: (item) => item.workerId },
              { key: "amount", title: "Amount", render: (item) => `CNY ${item.amount.toFixed(2)}` },
              { key: "bank", title: "Bank", render: (item) => item.bankAccountId },
              {
                key: "status",
                title: "Status",
                render: (item) => <StatusTag tone={statusTone(item.status)}>{item.status}</StatusTag>,
              },
              { key: "requestedAt", title: "Requested", render: (item) => item.requestedAt },
              {
                key: "actions",
                title: "Actions",
                render: (item) => (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button
                      disabled={item.status !== "requested" || busyId === item.withdrawalId}
                      onClick={() => void mutate(item.withdrawalId, "approve")}
                    >
                      Approve
                    </Button>
                    <Button
                      disabled={item.status !== "requested" || busyId === item.withdrawalId}
                      onClick={() => void mutate(item.withdrawalId, "reject")}
                    >
                      Reject
                    </Button>
                    <Button
                      disabled={item.status !== "approved" || busyId === item.withdrawalId}
                      onClick={() => void mutate(item.withdrawalId, "markPaid")}
                      variant="primary"
                    >
                      Mark Paid
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}
