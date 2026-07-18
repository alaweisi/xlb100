import { useCallback, useEffect, useState } from "react";
import { type WorkerWithdrawalResponse } from "@xlb/api-client";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, LoadingState, ScopeBadge, Select, StatusTag, Table, Textarea } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import { cityLabel, formatCurrency, formatDateTime, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";

interface Props { initialCityCode?: string; }

export function WorkerWithdrawalsPage({ initialCityCode }: Props) {
  const online = useOnlineStatus();
  const [cityCode, setCityCode] = useState(initialCityCode || "hangzhou");
  const [withdrawals, setWithdrawals] = useState<WorkerWithdrawalResponse[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await api.listWorkerWithdrawals({ cityCode, limit: 100 });
      setWithdrawals(response.withdrawals);
    } catch (cause) {
      const failure = presentFailure(cause, "师傅提现队列");
      setError({ title: failure.title, detail: failure.detail });
      if (failure.kind === "forbidden") setWithdrawals([]);
    } finally { setLoading(false); }
  }, [cityCode]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(item: WorkerWithdrawalResponse, action: "approve" | "reject" | "markPaid") {
    const note = notes[item.withdrawalId]?.trim();
    if (!online || !note) return;
    setBusyId(item.withdrawalId); setError(null); setNotice(null);
    try {
      if (action === "approve") await api.reviewWorkerWithdrawal(item.withdrawalId, { decision: "approved", reviewNote: note });
      else if (action === "reject") await api.reviewWorkerWithdrawal(item.withdrawalId, { decision: "rejected", reviewNote: note });
      else await api.markWorkerWithdrawalPaid(item.withdrawalId, { markedPaidNote: note });
      setNotice(action === "approve" ? "提现申请已批准。" : action === "reject" ? "提现申请已驳回。" : "提现已由服务端标记付款；本页面不会代替真实付款渠道执行打款。");
      setNotes(previous => ({ ...previous, [item.withdrawalId]: "" }));
      await load();
    } catch (cause) {
      const failure = presentFailure(cause, action === "markPaid" ? "标记提现付款" : "审核提现申请");
      setError({ title: failure.title, detail: failure.detail });
    } finally { setBusyId(null); }
  }

  return <div style={{ display: "grid", gap: 16 }}>
    <Card title="师傅提现审核" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone={online ? "success" : "danger"}>{online ? "在线" : "离线"}</StatusTag></>}>
      <p>批准与驳回只更新提现审核状态；“标记已付款”只记录服务端状态，不会在页面中调用银行或支付服务商。</p>
      <div style={{ display: "grid", gap: 12 }}><FormField label="城市"><Select value={cityCode} onChange={event => setCityCode(event.target.value)}><option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option></Select></FormField><div><Button onClick={() => void load()} variant="primary" disabled={!online || loading}>{loading ? "刷新中" : "刷新队列"}</Button></div></div>
    </Card>
    {!online && <ApiErrorPanel title="当前网络不可用" detail="提现审核写入已停用。恢复网络并刷新服务端状态后再继续。" />}
    {loading && <LoadingState title="正在加载提现申请" />}
    {error && <ApiErrorPanel title={error.title} detail={error.detail} action={<Button disabled={!online} onClick={() => void load()}>重试</Button>} />}
    {notice && <p role="status">{notice}</p>}
    <Card title="提现申请队列" actions={<StatusTag tone="muted">{withdrawals.length} 条</StatusTag>}>
      {!loading && withdrawals.length === 0 ? <EmptyState title="当前城市没有提现申请" /> : <Table rows={withdrawals} getRowKey={item => item.withdrawalId} emptyText="当前城市没有提现申请" columns={[
        { key: "id", title: "申请编号", render: item => item.withdrawalId },
        { key: "worker", title: "师傅", render: item => item.workerId },
        { key: "amount", title: "金额", render: item => formatCurrency(item.amount, item.currency) },
        { key: "bank", title: "收款账户编号", render: item => item.bankAccountId },
        { key: "status", title: "状态", render: item => <StatusTag tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusTag> },
        { key: "requestedAt", title: "申请时间", render: item => formatDateTime(item.requestedAt) },
        { key: "note", title: "处理说明", render: item => <Textarea disabled={!online || busyId !== null || item.status === "marked_paid" || item.status === "rejected"} maxLength={255} placeholder="操作前必填，记录审核或付款标记依据" value={notes[item.withdrawalId] ?? ""} onChange={event => setNotes(previous => ({ ...previous, [item.withdrawalId]: event.target.value }))} /> },
        { key: "actions", title: "操作", render: item => <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Button disabled={!online || item.status !== "requested" || busyId !== null || !notes[item.withdrawalId]?.trim()} onClick={() => void mutate(item, "approve")}>批准</Button><Button disabled={!online || item.status !== "requested" || busyId !== null || !notes[item.withdrawalId]?.trim()} onClick={() => void mutate(item, "reject")}>驳回</Button><Button disabled={!online || item.status !== "approved" || busyId !== null || !notes[item.withdrawalId]?.trim()} onClick={() => void mutate(item, "markPaid")} variant="primary">标记已付款</Button></div> },
      ]} />}
    </Card>
  </div>;
}
