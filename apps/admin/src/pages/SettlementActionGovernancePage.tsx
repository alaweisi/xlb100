import { useCallback, useEffect, useState } from "react";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { parseHashParams, buildHash } from "../hashParams";
import { adminPlannerApi as plannerApi } from "../adminAuth";
import { cityLabel, formatDateTime, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";

interface DryRunPlan { planId: string; planHash: string; status: string; packetId: string; cityCode: string; itemCount: number; createdAt: string; updatedAt: string; }
interface Props { onBack: () => void; subView?: string; }

const boundaryRows = [
  ["执行结算动作", "已禁用"], ["改写结算结果", "已禁用"], ["执行出款", "已禁用"], ["执行退款", "已禁用"],
  ["改写账本", "已禁用"], ["生成或下载文件", "已禁用"], ["向服务商派发", "已禁用"],
];

export function SettlementActionGovernancePage({ onBack, subView }: Props) {
  const params = parseHashParams();
  const cityCode = params.get("cityCode") || "hangzhou";
  const online = useOnlineStatus();
  const [packetId, setPacketId] = useState(params.get("packetId") || "");
  const [plans, setPlans] = useState<DryRunPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true); setError(null); setNotice(null);
    try {
      const response = await plannerApi.listSettlementDryRunPlans({ cityCode });
      setPlans(response.ok && Array.isArray(response.plans) ? response.plans : []);
    } catch (cause) {
      const failure = presentFailure(cause, "结算只读计划列表");
      setError({ title: failure.title, detail: failure.detail });
      if (failure.kind === "forbidden") setPlans([]);
    } finally { setPlansLoading(false); }
  }, [cityCode]);

  useEffect(() => { if (subView === "plans") void fetchPlans(); }, [subView, fetchPlans]);
  useEffect(() => { document.title = "结算动作治理"; }, []);

  async function handleGeneratePlan() {
    const target = packetId.trim();
    if (!online || !target) return;
    setGeneratingPlan(true); setError(null); setNotice(null);
    try {
      await plannerApi.createSettlementDryRunPlan(target);
      setNotice("只读计划已由服务端生成；未发生结算、资金、账本或服务商执行。");
      window.location.hash = buildHash("/settlement-ops/governance", { sub: "plans", cityCode });
    } catch (cause) {
      const failure = presentFailure(cause, "生成结算只读计划");
      setError({ title: failure.title, detail: failure.detail });
    } finally { setGeneratingPlan(false); }
  }

  const header = <Card title={subView === "plans" ? "结算只读计划" : "结算动作治理"} actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone="warning">仅治理，不执行</StatusTag><StatusTag tone={online ? "success" : "danger"}>{online ? "在线" : "离线"}</StatusTag></>}>
    <p>本工作台只生成和查看治理计划，不执行出款、退款、账本改写、结算提交、文件生成或服务商派发。</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button onClick={onBack}>返回结算运营台</Button>{subView === "plans" ? <Button disabled={!online || plansLoading} onClick={() => void fetchPlans()}>刷新计划</Button> : <Button onClick={() => { window.location.hash = buildHash("/settlement-ops/governance", { sub: "plans", cityCode }); }}>查看只读计划</Button>}</div>
  </Card>;

  const boundary = <Card title="执行边界" actions={<StatusTag tone="danger">全部禁用</StatusTag>}><Table rows={boundaryRows} getRowKey={row => String(row[0])} columns={[{ key: "capability", title: "能力", render: row => row[0] }, { key: "state", title: "状态", render: row => <StatusTag tone="danger">{row[1]}</StatusTag> }]} /></Card>;

  if (subView === "plans") return <div style={{ display: "grid", gap: 16, maxWidth: 1040 }}>
    {header}
    {!online && <ApiErrorPanel title="当前网络不可用" detail="页面不会把缓存数据标记为最新。恢复网络后请刷新计划。" />}
    {error && <ApiErrorPanel title={error.title} detail={error.detail} action={<Button disabled={!online} onClick={() => void fetchPlans()}>重试</Button>} />}
    {notice && <p role="status">{notice}</p>}
    <Card title="计划列表" actions={<StatusTag tone="muted">{plans.length} 条</StatusTag>}>
      {plansLoading && <LoadingState title="正在加载只读计划" />}
      {!plansLoading && plans.length === 0 ? <EmptyState title="当前城市没有只读计划" description="请返回治理页，输入真实就绪包编号后生成。" /> : <Table rows={plans} getRowKey={row => row.planId} columns={[
        { key: "hash", title: "计划摘要", render: row => row.planHash },
        { key: "status", title: "状态", render: row => <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> },
        { key: "packet", title: "就绪包编号", render: row => row.packetId },
        { key: "items", title: "项目数", render: row => row.itemCount },
        { key: "created", title: "创建时间", render: row => formatDateTime(row.createdAt) },
      ]} />}
    </Card>
    {boundary}
  </div>;

  return <div style={{ display: "grid", gap: 16, maxWidth: 1040 }}>
    {header}
    {!online && <ApiErrorPanel title="当前网络不可用" detail="计划生成已停用。恢复网络后再提交。" />}
    {error && <ApiErrorPanel title={error.title} detail={error.detail} />}{notice && <p role="status">{notice}</p>}
    <Card title="生成只读治理计划" actions={<StatusTag tone="warning">需要真实就绪包</StatusTag>}>
      <p>计划由服务端根据就绪包生成，只保存治理元数据与摘要。计划生成成功不代表任何资金或结算动作已执行。</p>
      <FormField label="就绪包编号" description="不得使用占位值；请从已批准的治理就绪包复制编号。"><Input value={packetId} onChange={event => setPacketId(event.target.value)} placeholder="输入真实就绪包编号" /></FormField>
      <Button variant="primary" disabled={!online || generatingPlan || !packetId.trim()} onClick={() => void handleGeneratePlan()}>{generatingPlan ? "生成中" : "生成只读计划"}</Button>
    </Card>
    <Card title="治理链路状态"><Table rows={[["治理意图", "已建立"], ["复核与证据", "已建立"], ["就绪包防线", "已建立"], ["只读计划器", "可用"], ["执行能力", "禁止"]]} getRowKey={row => String(row[0])} columns={[{ key: "stage", title: "阶段", render: row => row[0] }, { key: "state", title: "状态", render: row => <StatusTag tone={row[1] === "禁止" ? "danger" : "success"}>{row[1]}</StatusTag> }]} /></Card>
    {boundary}
    <Card title="禁止动作"><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><Button disabled>出款</Button><Button disabled>退款</Button><Button disabled>账本冲正</Button><Button disabled>提交结算</Button><Button disabled>生成导出文件</Button><Button disabled>批准并执行</Button></div></Card>
  </div>;
}
