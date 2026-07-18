import { useCallback, useEffect, useState } from "react";
import type {
  CreateSupportSkillGroupRequest, CreateSupportSlaPolicyRequest, SupportSkillGroup,
  SupportSlaPolicy, SupportTicketPriority, SupportTicketType,
} from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, Select, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import { businessLabel, cityLabel, formatDateTime, presentFailure, useOnlineStatus } from "../operationsPresentation";

const ticketTypes: SupportTicketType[] = ["order_question", "order_dispute", "service_complaint", "withdrawal_issue", "account_issue", "safety", "other"];
const priorities: SupportTicketPriority[] = ["low", "normal", "high", "urgent", "critical"];
const requestKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function SupportRoutingConfigPage({ cityCode }: { cityCode: string }) {
  const online = useOnlineStatus();
  const [groups, setGroups] = useState<SupportSkillGroup[]>([]);
  const [policies, setPolicies] = useState<SupportSlaPolicy[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupType, setGroupType] = useState<SupportTicketType>("other");
  const [groupLanguages, setGroupLanguages] = useState("");
  const [groupWeight, setGroupWeight] = useState("0");
  const [groupDefault, setGroupDefault] = useState(false);
  const [policyType, setPolicyType] = useState<SupportTicketType>("other");
  const [policyPriority, setPolicyPriority] = useState<SupportTicketPriority>("normal");
  const [firstResponseMinutes, setFirstResponseMinutes] = useState("240");
  const [resolutionMinutes, setResolutionMinutes] = useState("2880");

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const [groupResult, policyResult] = await Promise.all([
        api.listSupportSkillGroups({ limit: 100 }),
        api.listSupportSlaPolicies({ limit: 100 }),
      ]);
      setGroups(groupResult.skillGroups);
      setPolicies(policyResult.policies);
    } catch (cause) {
      setError(presentFailure(cause, "客服路由配置").detail);
    } finally { setBusy(false); }
  }, [cityCode]);

  useEffect(() => { void load(); }, [load]);

  async function createGroup() {
    const languages = groupLanguages.split(",").map(value => value.trim()).filter(Boolean);
    const body: CreateSupportSkillGroupRequest = {
      name: groupName.trim(), matchedTypes: [groupType], matchedLanguages: languages,
      priorityWeight: Number(groupWeight), isDefault: groupDefault, isActive: true,
      idempotencyKey: requestKey("support-group-create"),
    };
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.createSupportSkillGroup(body);
      setGroupName(""); setNotice("技能组已保存。等待列表刷新确认。"); await load();
    } catch (cause) { setError(presentFailure(cause, "创建客服技能组").detail); setBusy(false); }
  }

  async function toggleGroup(group: SupportSkillGroup) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.updateSupportSkillGroup(group.skillGroupId, {
        isActive: !group.isActive, expectedVersion: group.version,
        idempotencyKey: requestKey("support-group-status"),
      });
      setNotice("技能组状态已更新。等待列表刷新确认。"); await load();
    } catch (cause) { setError(presentFailure(cause, "更新客服技能组").detail); setBusy(false); }
  }

  async function createPolicy() {
    const body: CreateSupportSlaPolicyRequest = {
      type: policyType, priority: policyPriority,
      firstResponseMinutes: Number(firstResponseMinutes), resolutionMinutes: Number(resolutionMinutes),
      isActive: true, idempotencyKey: requestKey("support-sla-create"),
    };
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.createSupportSlaPolicy(body);
      setNotice("服务时限策略已保存。等待列表刷新确认。"); await load();
    } catch (cause) { setError(presentFailure(cause, "创建服务时限策略").detail); setBusy(false); }
  }

  async function deactivatePolicy(policy: SupportSlaPolicy) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.reviseSupportSlaPolicy(policy.policyId, {
        isActive: false, expectedVersion: policy.version,
        idempotencyKey: requestKey("support-sla-deactivate"),
      });
      setNotice("停用策略的新修订已创建。等待列表刷新确认。"); await load();
    } catch (cause) { setError(presentFailure(cause, "停用服务时限策略").detail); setBusy(false); }
  }

  async function revisePolicyTiming(policy: SupportSlaPolicy) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.reviseSupportSlaPolicy(policy.policyId, {
        firstResponseMinutes: Number(firstResponseMinutes), resolutionMinutes: Number(resolutionMinutes),
        expectedVersion: policy.version, idempotencyKey: requestKey("support-sla-revise"),
      });
      setNotice("时限调整的新修订已创建。等待列表刷新确认。"); await load();
    } catch (cause) { setError(presentFailure(cause, "调整服务时限").detail); setBusy(false); }
  }

  return <div style={{ display: "grid", gap: 16 }}>
    <Card title="客服路由配置" actions={<><StatusTag tone="muted">城市：{cityLabel(cityCode)}</StatusTag><StatusTag tone={online ? "success" : "danger"}>{online ? "在线" : "离线"}</StatusTag></>}>
      <p style={{ marginTop: 0 }}>配置按城市隔离。仅在工单类型与语言均无匹配时，才使用不限定语言的默认技能组。</p>
      {!online && <ApiErrorPanel title="当前网络不可用" detail="配置写入已停用。恢复网络并刷新后再继续操作。" />}
      {error && <ApiErrorPanel title="客服路由操作失败" detail={error} />}
      {notice && <p role="status">{notice}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <FormField label="技能组名称"><Input value={groupName} onChange={event => setGroupName(event.target.value)} /></FormField>
        <FormField label="匹配工单类型"><Select value={groupType} onChange={event => setGroupType(event.target.value as SupportTicketType)}>{ticketTypes.map(value => <option key={value} value={value}>{businessLabel(value)}</option>)}</Select></FormField>
        <FormField label="匹配语言"><Input placeholder="例如：简体中文、英语（以服务端语言代码输入并用逗号分隔）" value={groupLanguages} onChange={event => setGroupLanguages(event.target.value)} /></FormField>
        <FormField label="路由权重"><Input type="number" value={groupWeight} onChange={event => setGroupWeight(event.target.value)} /></FormField>
        <label><input type="checkbox" checked={groupDefault} onChange={event => setGroupDefault(event.target.checked)} /> 设为兜底技能组</label>
      </div>
      <Button variant="primary" disabled={!online || busy || !groupName.trim() || (groupDefault && groupLanguages.trim().length > 0)} onClick={() => void createGroup()}>创建技能组</Button>
    </Card>
    <Card title="技能组列表">
      {busy && groups.length === 0 ? <LoadingState title="正在加载技能组" /> : groups.length === 0 ? <EmptyState title="当前城市未配置技能组" /> : <Table rows={groups} getRowKey={row => row.skillGroupId} columns={[
        { key: "name", title: "名称", render: row => row.name },
        { key: "types", title: "工单类型", render: row => row.matchedTypes.map(businessLabel).join("、") },
        { key: "languages", title: "语言", render: row => row.matchedLanguages.join("、") || "不限定" },
        { key: "weight", title: "权重", render: row => row.priorityWeight },
        { key: "status", title: "状态", render: row => row.isActive ? "启用" : "停用" },
        { key: "action", title: "操作", render: row => <Button disabled={!online || busy} onClick={() => void toggleGroup(row)}>{row.isActive ? "停用技能组" : "启用技能组"}</Button> },
      ]} />}
    </Card>
    <Card title="服务时限策略配置">
      <p style={{ marginTop: 0 }}>策略变更会生成新修订；已经写入工单的响应与解决时限不会被追溯重算。</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <FormField label="工单类型"><Select value={policyType} onChange={event => setPolicyType(event.target.value as SupportTicketType)}>{ticketTypes.map(value => <option key={value} value={value}>{businessLabel(value)}</option>)}</Select></FormField>
        <FormField label="优先级"><Select value={policyPriority} onChange={event => setPolicyPriority(event.target.value as SupportTicketPriority)}>{priorities.map(value => <option key={value} value={value}>{businessLabel(value)}</option>)}</Select></FormField>
        <FormField label="首次响应（分钟）"><Input type="number" min="1" value={firstResponseMinutes} onChange={event => setFirstResponseMinutes(event.target.value)} /></FormField>
        <FormField label="解决时限（分钟）"><Input type="number" min="1" value={resolutionMinutes} onChange={event => setResolutionMinutes(event.target.value)} /></FormField>
      </div>
      <Button variant="primary" disabled={!online || busy || Number(firstResponseMinutes) < 1 || Number(resolutionMinutes) < Number(firstResponseMinutes)} onClick={() => void createPolicy()}>创建时限策略</Button>
    </Card>
    <Card title="服务时限策略修订">
      {busy && policies.length === 0 ? <LoadingState title="正在加载服务时限策略" /> : policies.length === 0 ? <EmptyState title="当前城市未配置服务时限策略" /> : <Table rows={policies} getRowKey={row => row.policyId} columns={[
        { key: "match", title: "匹配条件", render: row => `${businessLabel(row.type)} / ${businessLabel(row.priority)}` },
        { key: "timing", title: "首次响应 / 解决", render: row => `${row.firstResponseMinutes} / ${row.resolutionMinutes} 分钟` },
        { key: "revision", title: "修订", render: row => `第 ${row.revision} 版` },
        { key: "effective", title: "生效时间", render: row => formatDateTime(row.effectiveFrom) },
        { key: "status", title: "状态", render: row => row.isActive ? "启用" : "停用" },
        { key: "action", title: "操作", render: row => <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Button disabled={!online || busy || !row.isActive || Number(firstResponseMinutes) < 1 || Number(resolutionMinutes) < Number(firstResponseMinutes)} onClick={() => void revisePolicyTiming(row)}>按上方时限新建修订</Button><Button disabled={!online || busy || !row.isActive} onClick={() => void deactivatePolicy(row)}>停用策略</Button></div> },
      ]} />}
    </Card>
  </div>;
}
