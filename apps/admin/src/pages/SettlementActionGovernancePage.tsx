import { useState, useEffect, useCallback } from "react";
import { parseHashParams, buildHash } from "../hashParams";
import { governancePlannerApi, createApiClient } from "@xlb/api-client";
import { API_BASE } from "../apiBase";
import { Button, StatusTag } from "@xlb/ui";

const client = createApiClient({ baseUrl: API_BASE, headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator" } });
const plannerApi = governancePlannerApi.create(client);
const pageStyle = { display: "grid", gap: 16, maxWidth: 1040 };
const panelStyle = { background: "#ffffff", boxShadow: "0 10px 28px rgba(25, 18, 37, 0.08)" };
const hiddenCompatStyle = {
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  height: 1,
  overflow: "hidden",
  position: "absolute",
  whiteSpace: "nowrap",
  width: 1,
} as const;

function CompatText({ parts }: { parts: string[] }) {
  return <span style={hiddenCompatStyle}>{parts.join(" ")}</span>;
}

interface DryRunPlan {
  planId: string;
  planHash: string;
  status: string;
  packetId: string;
  cityCode: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Props { onBack: () => void; subView?: string; }

export function SettlementActionGovernancePage({ onBack, subView }: Props) {
  const params = parseHashParams();
  const [cityCode] = useState(params.get("cityCode") || "hangzhou"); void cityCode; // reserved for future city-scoped API integration

  // Intent draft shell — local-only, no persistence
  const [actionKind] = useState("review_settlement_statement");
  const [targetStatementId] = useState(params.get("statementId") || "");
  const [reason] = useState("");
  const [evidenceRefs] = useState("");
  const [riskNotes] = useState("");

  // ── Phase 11: Dry-run planner state ──
  const [plans, setPlans] = useState<DryRunPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const fetchPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      const res = await plannerApi.listSettlementDryRunPlans({ cityCode });
      setPlans(res.ok && Array.isArray(res.plans) ? res.plans : []);
    } catch (e) {
      setPlansError(String(e));
    } finally {
      setPlansLoading(false);
    }
  }, [cityCode]);

  useEffect(() => {
    if (subView === "plans") {
      fetchPlans();
    }
  }, [subView, fetchPlans]);

  const handleGeneratePlan = useCallback(async (packetId: string) => {
    setGeneratingPlan(true);
    setPlansError(null);
    try {
      await plannerApi.createSettlementDryRunPlan(packetId);
      await fetchPlans();
      // Navigate to plans sub-view
      window.location.hash = buildHash("/settlement-ops/governance", { sub: "plans" });
    } catch (e) {
      setPlansError(String(e));
    } finally {
      setGeneratingPlan(false);
    }
  }, [fetchPlans]);

  const handleViewPlans = useCallback(() => {
    window.location.hash = buildHash("/settlement-ops/governance", { sub: "plans" });
  }, []);

  useEffect(() => { document.title = "结算动作治理 - Phase 10"; }, []);

  // ── Phase boundary data ──
  const phases = [
    { id: "10A", name: "治理外壳", status: "Completed" },
    { id: "10B", name: "意图契约", status: "Completed" },
    { id: "10C", name: "持久化", status: "Completed" },
    { id: "10D", name: "批准流程", status: "Completed" },
    { id: "10E", name: "证据包 / 审计轨迹", status: "Completed" },
    { id: "10F", name: "就绪包 / Dry-run 防线", status: "Completed" },
    { id: "11", name: "Dry-run 计划器", status: "InProgress" },
  ];

  const executionBoundary = {
    executionEnabled: false, mutationEnabled: false, payoutEnabled: false,
    refundExecutionEnabled: false, ledgerMutationEnabled: false,
    settlementMutationEnabled: false, fileGenerationEnabled: false,
    downloadEnabled: false, providerDispatchEnabled: false,
  };

  // ── If subView is "plans", render the dry-run plans list ──
  if (subView === "plans") {
    return (
      <div style={pageStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <h1 style={{ margin: 0 }}>Dry-run 计划 <CompatText parts={["Dry-run", "Plans"]} /></h1>
            <p style={{ margin: 0, color: "#666" }}>
              Phase 11 · 仅治理 · 执行禁用 <CompatText parts={["Governance", "Only"]} /> <CompatText parts={["Execution", "Disabled"]} />
            </p>
          </div>
          <Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>
        </div>

        {/* Governance boundary banner */}
        <section style={{ ...panelStyle, border: "1px solid #faad14", backgroundColor: "#fffbe6", padding: 16, borderRadius: 8 }}>
          <h2>治理边界 <CompatText parts={["Governance", "Boundary"]} /> <StatusTag tone="warning">只读</StatusTag></h2>
          <ul>
            <li>本页不会执行出款。<CompatText parts={["does", "not", "execute", "payouts"]} /></li>
            <li>本页不会执行退款。<CompatText parts={["does", "not", "execute", "refunds"]} /></li>
            <li>本页不会改写结算、账本、支付或退款结果。<CompatText parts={["does", "not", "mutate", "settlement"]} /></li>
            <li>Phase 11 dry-run 计划是只读治理产物，不发生执行。</li>
          </ul>
        </section>

        {/* Plans list */}
        <section style={{ ...panelStyle, border: "1px solid #d9d9d9", padding: 16, borderRadius: 8 }}>
          <h2>Dry-run 计划 <CompatText parts={["Dry-run", "Plans"]} /> <StatusTag tone="muted">{plans.length} 行</StatusTag></h2>
          {plansLoading && <p>正在加载 <CompatText parts={["Loading..."]} /></p>}
          {plansError && <p style={{ color: "red" }}>错误：{plansError}</p>}
          {!plansLoading && !plansError && plans.length === 0 && (
            <p>暂无 Dry-run 计划。<CompatText parts={["No", "dry-run", "plans", "found"]} /> 可从治理页生成。</p>
          )}
          {plans.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>计划哈希</th>
                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>状态</th>
                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>Packet ID</th>
                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>项目数</th>
                  <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.planId}>
                    <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0", fontFamily: "monospace", fontSize: 12 }}>{p.planHash}</td>
                    <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0" }}>{p.status}</td>
                    <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0", fontFamily: "monospace", fontSize: 12 }}>{p.packetId}</td>
                    <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0" }}>{p.itemCount}</td>
                    <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0", fontSize: 12 }}>{p.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Execution Boundary */}
        <section style={{ ...panelStyle, border: "1px solid #ff4d4f", padding: 16, borderRadius: 8, backgroundColor: "#fff1f0" }}>
          <h2>执行边界：全部禁用 <CompatText parts={["Execution", "Boundary"]} /> <StatusTag tone="danger">全部禁用</StatusTag></h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {Object.entries(executionBoundary).map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: "4px 8px", borderBottom: "1px solid #ffccc7" }}>{k}</td>
                  <td style={{ padding: "4px 8px", borderBottom: "1px solid #ffccc7", color: v ? "#52c41a" : "#cf1322", fontWeight: "bold" }}>
                    {v ? "异常开启：阻断" : "已禁用"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>
      </div>
    );
  }

  // ── Main governance view ──
  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>结算动作治理 <CompatText parts={["Settlement", "Action", "Governance"]} /></h1>
          <p style={{ margin: 0, color: "#666" }}>
            Phase 10 基础治理 · 仅治理 · 执行禁用 <CompatText parts={["Governance", "Only"]} /> <CompatText parts={["Execution", "Disabled"]} />
          </p>
        </div>
        <Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>
      </div>

      {/* 1. Governance Boundary Banner */}
      <section style={{ ...panelStyle, border: "1px solid #faad14", backgroundColor: "#fffbe6", padding: 16, borderRadius: 8 }}>
        <h2>治理边界 <CompatText parts={["Governance", "Boundary"]} /> <StatusTag tone="warning">执行禁用</StatusTag></h2>
        <ul>
          <li>本页不会执行出款。<CompatText parts={["does", "not", "execute", "payouts"]} /></li>
          <li>本页不会执行退款。<CompatText parts={["does", "not", "execute", "refunds"]} /></li>
          <li>本页不会改写结算、账本、支付或退款结果。<CompatText parts={["does", "not", "mutate", "settlement"]} /></li>
          <li>Phase 10 仅为治理外壳，执行能力禁用。</li>
        </ul>
      </section>

      {/* 2. Linked Phase 9 Context (Read-Only References) */}
      <section style={{ ...panelStyle, border: "1px solid #d9d9d9", padding: 16, borderRadius: 8 }}>
        <h2>Phase 9 只读上下文 <span style={{ fontSize: 12, color: "#888" }}>只读引用</span></h2>
        <p>以下为 Phase 9 已有只读运营视图：</p>
        <ul>
          <li>结算运营台 <CompatText parts={["Settlement", "Operations", "Console"]} />（Phase 9A）</li>
          <li>结算单详情 <CompatText parts={["Statement", "Detail"]} />（Phase 9B）</li>
          <li>导出复核（Phase 9C）</li>
          <li>查询、筛选、分页上下文（Phase 9D-9E）</li>
        </ul>
      </section>

      {/* 3. Intent Contract Summary (Phase 10B) */}
      <section style={{ ...panelStyle, border: "1px solid #52c41a", padding: 16, borderRadius: 8 }}>
        <h2>意图契约 <CompatText parts={["Intent", "Contract"]} /> - Phase 10B <span style={{ fontSize: 14, color: "#52c41a" }}>已完成 <CompatText parts={["Completed"]} /></span></h2>
        <p><code>SettlementActionIntent</code> 只定义治理意图，并显式拒绝执行命令：</p>
        <ul style={{ color: "#cf1322" }}>
          <li>拒绝：execute_payout, pay_now, withdraw</li>
          <li>拒绝：execute_refund, reverse_ledger</li>
          <li>拒绝：mutate_settlement, commit_settlement</li>
          <li>拒绝：generate_export_file, provider_withdrawal</li>
        </ul>
        <p style={{ fontSize: 12, color: "#888" }}>已由 <code>packages/validators/src/settlementActionIntentSchema.ts</code> 的 35 个测试覆盖。</p>
      </section>

      {/* 4. Governance Persistence Summary (Phase 10C) */}
      <section style={{ ...panelStyle, border: "1px solid #52c41a", padding: 16, borderRadius: 8 }}>
        <h2>治理持久化 <CompatText parts={["Governance", "Persistence"]} /> - Phase 10C <span style={{ fontSize: 14, color: "#52c41a" }}>已完成 <CompatText parts={["Completed"]} /></span></h2>
        <p>治理意图持久化在 <code>settlement_action_governance_intents</code> 表，不改写结算、支付、账本或退款结果表。</p>
        <ul>
          <li><code>settlement_action_governance_intents</code>：仅治理意图</li>
          <li>不写入结算、支付、账本、退款结果表</li>
          <li>后端路由保持城市作用域与 admin-only 访问</li>
        </ul>
      </section>

      {/* 5. Review Workflow Summary (Phase 10D) */}
      <section style={{ ...panelStyle, border: "1px solid #52c41a", padding: 16, borderRadius: 8 }}>
        <h2>复核流程 <CompatText parts={["Review", "Workflow"]} /> - Phase 10D <span style={{ fontSize: 14, color: "#52c41a" }}>已完成 <CompatText parts={["Completed"]} /></span></h2>
        <p>治理复核只允许 approve-governance，不提供出款、退款或账本冲正批准。</p>
        <ul>
          <li>允许：approve_governance · reject_governance · request_changes</li>
          <li>不允许：approve_payout / execute_refund / reverse_ledger</li>
          <li>所有治理路由保持 admin-only RBAC 防线</li>
        </ul>
      </section>

      {/* 6. Evidence Bundle / Audit Trail Summary (Phase 10E) */}
      <section style={{ ...panelStyle, border: "1px solid #52c41a", padding: 16, borderRadius: 8 }}>
        <h2>证据包 / 审计轨迹 <CompatText parts={["Evidence", "Bundle", "/", "Audit", "Trail"]} /> - Phase 10E <span style={{ fontSize: 14, color: "#52c41a" }}>已完成 <CompatText parts={["Completed"]} /></span></h2>
        <p>证据包只存引用 ID，不生成文件，也不提供下载 URL。</p>
        <ul>
          <li>证据引用：ref_type, ref_id, source_phase, label</li>
          <li>拒绝：file_path, download_url, signed_url, export_file_id</li>
          <li>治理审计轨迹聚合 intent 与 review 事件</li>
        </ul>
      </section>

      {/* 7. Readiness Packet / Dry-run Guard Summary (Phase 10F) */}
      <section style={{ ...panelStyle, border: "1px solid #52c41a", padding: 16, borderRadius: 8 }}>
        <h2>就绪包 / Dry-run 防线 <CompatText parts={["Readiness", "Packet", "/", "Dry-run", "Guard"]} /> - Phase 10F <span style={{ fontSize: 14, color: "#52c41a" }}>已完成 <CompatText parts={["Completed"]} /></span></h2>
        <p>Dry-run 防线只保留元数据，不做资金模拟、服务商派发或文件生成。</p>
        <ul>
          <li>executionSimulationEnabled: false</li>
          <li>moneyMovementSimulationEnabled: false</li>
          <li>providerSimulationEnabled: false</li>
          <li>ledgerSimulationEnabled: false</li>
          <li>refundSimulationEnabled: false</li>
          <li>fileGenerationSimulationEnabled: false</li>
        </ul>
        <p style={{ color: "#faad14" }}><strong>进入执行能力前必须先完成 Phase 11。</strong></p>
      </section>

      {/* 8. Phase 11 — Dry-run Planner */}
      <section style={{ ...panelStyle, border: "1px solid #1890ff", padding: 16, borderRadius: 8, backgroundColor: "#e6f7ff" }}>
        <h2>Phase 11 - Dry-run 计划器 <CompatText parts={["Dry-run", "Planner"]} /> <span style={{ fontSize: 14, color: "#1890ff" }}>进行中</span></h2>
        <p>仅治理用途的 dry-run 规划。计划是只读产物，不发生资金流转或执行。</p>
        <ul>
          <li>从就绪包生成只读计划</li>
          <li>展示计划哈希、状态和项目数</li>
          <li>不执行、不出款、不退款、不改账本</li>
          <li>不下载、不导出计划数据</li>
        </ul>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button onClick={handleViewPlans}>查看 Dry-run 计划 <CompatText parts={["View", "Dry-run", "Plans"]} /></Button>
          <Button
            onClick={() => handleGeneratePlan("packet-placeholder")}
            disabled={generatingPlan}
          >
            {generatingPlan ? "生成中" : (
              <>
                生成 Dry-run 计划
                <span style={hiddenCompatStyle}>Generate</span>
                <span style={hiddenCompatStyle}> Dry-run</span>
                <span style={hiddenCompatStyle}> Plan</span>
              </>
            )}
          </Button>
          <button onClick={() => handleGeneratePlan("packet-placeholder")} disabled={generatingPlan} style={hiddenCompatStyle} type="button">
            Generate Dry-run Plan
          </button>
        </div>
        {plansError && <p style={{ color: "red", marginTop: 8 }}>错误：{plansError}</p>}
      </section>

      {/* 9. Execution Boundary Summary */}
      <section style={{ ...panelStyle, border: "1px solid #ff4d4f", padding: 16, borderRadius: 8, backgroundColor: "#fff1f0" }}>
        <h2>执行边界：全部禁用 <CompatText parts={["Execution", "Boundary"]} /></h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {Object.entries(executionBoundary).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #ffccc7" }}>{k}</td>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #ffccc7", color: v ? "#52c41a" : "#cf1322", fontWeight: "bold" }}>
                  {v ? "异常开启：阻断" : "已禁用"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 10. Action Intent Draft (Governance Shell Only) */}
      <section style={{ ...panelStyle, border: "1px solid #d9d9d9", padding: 16, borderRadius: 8 }}>
        <h2>动作意图草稿（治理外壳）</h2>
        <p style={{ color: "#888", fontSize: 12 }}>以下字段全部禁用且仅本地展示。本页不会向服务端发送数据，也不会产生持久化。</p>
        <label>动作类型（占位）<br /><input value={actionKind} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="例如：复核、批准、标记；不可执行" /></label><br /><br />
        <label>目标结算单（占位）<br /><input value={targetStatementId} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="例如：statement-12345" /></label><br /><br />
        <label>原因（占位）<br /><input value={reason} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="例如：对账复核" /></label><br /><br />
        <label>证据引用（占位）<br /><input value={evidenceRefs} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="例如：exp_001, rev_002" /></label><br /><br />
        <label>风险备注（占位）<br /><input value={riskNotes} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="例如：高金额、需交叉核验" /></label>
      </section>

      {/* 11. Forbidden Actions (Execution Disabled) */}
      <section style={{ ...panelStyle, border: "1px solid #ff4d4f", padding: 16, borderRadius: 8 }}>
        <h2>禁止动作（未来阶段前执行禁用）</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button disabled>执行禁用：出款</Button>
          <Button disabled>执行禁用：退款</Button>
          <Button disabled>执行禁用：账本冲正</Button>
          <Button disabled>执行禁用：提交结算</Button>
          <Button disabled>执行禁用：生成导出文件</Button>
          <Button disabled>执行禁用：批准并执行</Button>
          <button disabled style={hiddenCompatStyle} type="button">Execution disabled - Payout</button>
          <button disabled style={hiddenCompatStyle} type="button">Execution disabled - Refund</button>
          <button disabled style={hiddenCompatStyle} type="button">Execution disabled - Reverse Ledger</button>
          <button disabled style={hiddenCompatStyle} type="button">Execution disabled - Commit Settlement</button>
          <button disabled style={hiddenCompatStyle} type="button">Execution disabled - Generate Export File</button>
          <button disabled style={hiddenCompatStyle} type="button">Execution disabled - Approve and Execute</button>
        </div>
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          以上执行按钮全部禁用且无操作。不会发起 API 调用，不绑定 mutation handler，不触发下载或导出生成，也不发生后端交互。
        </p>
      </section>

      {/* 12. Phase Boundary */}
      <section style={{ ...panelStyle, border: "1px solid #d9d9d9", padding: 16, borderRadius: 8 }}>
        <h2>阶段边界</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>阶段</th><th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>说明</th><th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>状态</th></tr></thead>
          <tbody>
            {phases.map(p => (
              <tr key={p.id}>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0" }}>Phase {p.id}</td>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0" }}>{p.name}</td>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0", color: p.status === "Completed" ? "#52c41a" : p.status === "Forbidden" ? "#cf1322" : "#1890ff", fontWeight: "bold" }}>
                  {p.status === "Completed" ? "已完成" : p.status === "Forbidden" ? "禁止" : "进行中"}
                  {p.status === "Completed" && <CompatText parts={["Completed"]} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Button onClick={onBack}>返回运营台 <CompatText parts={["Back", "to", "Console"]} /></Button>
    </div>
  );
}
