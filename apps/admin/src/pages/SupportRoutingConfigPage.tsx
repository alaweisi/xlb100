import { useCallback, useEffect, useState } from "react";
import type {
  CreateSupportSkillGroupRequest, CreateSupportSlaPolicyRequest, SupportSkillGroup,
  SupportSlaPolicy, SupportTicketPriority, SupportTicketType,
} from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, Select, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";

const ticketTypes: SupportTicketType[] = ["order_question", "order_dispute", "service_complaint", "withdrawal_issue", "account_issue", "safety", "other"];
const priorities: SupportTicketPriority[] = ["low", "normal", "high", "urgent", "critical"];
const requestKey = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function SupportRoutingConfigPage({ cityCode }: { cityCode: string }) {
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
      setError(cause instanceof Error ? cause.message : "Unable to load routing configuration");
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
      setGroupName(""); setNotice("Skill group saved"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create skill group"); setBusy(false); }
  }

  async function toggleGroup(group: SupportSkillGroup) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.updateSupportSkillGroup(group.skillGroupId, {
        isActive: !group.isActive, expectedVersion: group.version,
        idempotencyKey: requestKey("support-group-status"),
      });
      setNotice("Skill group status updated"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update skill group"); setBusy(false); }
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
      setNotice("SLA policy saved"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create SLA policy"); setBusy(false); }
  }

  async function deactivatePolicy(policy: SupportSlaPolicy) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.reviseSupportSlaPolicy(policy.policyId, {
        isActive: false, expectedVersion: policy.version,
        idempotencyKey: requestKey("support-sla-deactivate"),
      });
      setNotice("SLA policy revision created"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to revise SLA policy"); setBusy(false); }
  }

  async function revisePolicyTiming(policy: SupportSlaPolicy) {
    setBusy(true); setError(null); setNotice(null);
    try {
      await api.reviseSupportSlaPolicy(policy.policyId, {
        firstResponseMinutes: Number(firstResponseMinutes), resolutionMinutes: Number(resolutionMinutes),
        expectedVersion: policy.version, idempotencyKey: requestKey("support-sla-revise"),
      });
      setNotice("SLA timing revision created"); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to revise SLA timing"); setBusy(false); }
  }

  return <div style={{ display: "grid", gap: 16 }}>
    <Card title="Routing configuration" actions={<StatusTag tone="muted">city: {cityCode}</StatusTag>}>
      <p style={{ marginTop: 0 }}>Configuration is city-scoped. A language-neutral default group is used only when no type/language match exists.</p>
      {error && <ApiErrorPanel title="Configuration operation failed" detail={error} />}
      {notice && <p role="status">{notice}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <FormField label="Skill group name"><Input value={groupName} onChange={event => setGroupName(event.target.value)} /></FormField>
        <FormField label="Matched ticket type"><Select value={groupType} onChange={event => setGroupType(event.target.value as SupportTicketType)}>{ticketTypes.map(value => <option key={value} value={value}>{value}</option>)}</Select></FormField>
        <FormField label="Matched languages"><Input placeholder="zh-CN,en" value={groupLanguages} onChange={event => setGroupLanguages(event.target.value)} /></FormField>
        <FormField label="Routing weight"><Input type="number" value={groupWeight} onChange={event => setGroupWeight(event.target.value)} /></FormField>
        <label><input type="checkbox" checked={groupDefault} onChange={event => setGroupDefault(event.target.checked)} /> Default fallback</label>
      </div>
      <Button variant="primary" disabled={busy || !groupName.trim() || (groupDefault && groupLanguages.trim().length > 0)} onClick={() => void createGroup()}>Create skill group</Button>
    </Card>
    <Card title="Skill groups">
      {busy && groups.length === 0 ? <LoadingState title="Loading skill groups" /> : groups.length === 0 ? <EmptyState title="No skill groups configured" /> : <Table rows={groups} getRowKey={row => row.skillGroupId} columns={[
        { key: "name", title: "Name", render: row => row.name },
        { key: "types", title: "Types", render: row => row.matchedTypes.join(", ") },
        { key: "languages", title: "Languages", render: row => row.matchedLanguages.join(", ") || "Neutral" },
        { key: "weight", title: "Weight", render: row => row.priorityWeight },
        { key: "status", title: "Status", render: row => row.isActive ? "Active" : "Inactive" },
        { key: "action", title: "", render: row => <Button disabled={busy} onClick={() => void toggleGroup(row)}>{row.isActive ? "Deactivate group" : "Activate group"}</Button> },
      ]} />}
    </Card>
    <Card title="SLA policy configuration">
      <p style={{ marginTop: 0 }}>Policy changes create a new revision. Due times already stored on tickets are never recalculated.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
        <FormField label="SLA ticket type"><Select value={policyType} onChange={event => setPolicyType(event.target.value as SupportTicketType)}>{ticketTypes.map(value => <option key={value} value={value}>{value}</option>)}</Select></FormField>
        <FormField label="SLA priority"><Select value={policyPriority} onChange={event => setPolicyPriority(event.target.value as SupportTicketPriority)}>{priorities.map(value => <option key={value} value={value}>{value}</option>)}</Select></FormField>
        <FormField label="First response minutes"><Input type="number" min="1" value={firstResponseMinutes} onChange={event => setFirstResponseMinutes(event.target.value)} /></FormField>
        <FormField label="Resolution minutes"><Input type="number" min="1" value={resolutionMinutes} onChange={event => setResolutionMinutes(event.target.value)} /></FormField>
      </div>
      <Button variant="primary" disabled={busy || Number(firstResponseMinutes) < 1 || Number(resolutionMinutes) < Number(firstResponseMinutes)} onClick={() => void createPolicy()}>Create SLA policy</Button>
    </Card>
    <Card title="SLA policy revisions">
      {busy && policies.length === 0 ? <LoadingState title="Loading SLA policies" /> : policies.length === 0 ? <EmptyState title="No SLA policies configured" /> : <Table rows={policies} getRowKey={row => row.policyId} columns={[
        { key: "match", title: "Match", render: row => `${row.type} / ${row.priority}` },
        { key: "timing", title: "First / resolution", render: row => `${row.firstResponseMinutes} / ${row.resolutionMinutes} min` },
        { key: "revision", title: "Revision", render: row => `r${row.revision}` },
        { key: "effective", title: "Effective", render: row => row.effectiveFrom },
        { key: "status", title: "Status", render: row => row.isActive ? "Active" : "Inactive" },
        { key: "action", title: "", render: row => <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><Button disabled={busy || !row.isActive || Number(firstResponseMinutes) < 1 || Number(resolutionMinutes) < Number(firstResponseMinutes)} onClick={() => void revisePolicyTiming(row)}>Revise timing</Button><Button disabled={busy || !row.isActive} onClick={() => void deactivatePolicy(row)}>Deactivate policy</Button></div> },
      ]} />}
    </Card>
  </div>;
}
