import { useState, useEffect } from "react";
import { parseHashParams } from "../hashParams";

interface Props { onBack: () => void; }

export function SettlementActionGovernancePage({ onBack }: Props) {
  const params = parseHashParams();
  const [cityCode] = useState(params.get("cityCode") || "hangzhou"); void cityCode; // reserved for future city-scoped API integration

  // Intent draft shell — local-only, no persistence
  const [actionKind] = useState("review_settlement_statement");
  const [targetStatementId] = useState(params.get("statementId") || "");
  const [reason] = useState("");
  const [evidenceRefs] = useState("");
  const [riskNotes] = useState("");

  useEffect(() => { document.title = "Settlement Action Governance — Phase 10"; }, []);

  // ── Phase boundary data ──
  const phases = [
    { id: "10A", name: "Governance Shell", status: "Completed" },
    { id: "10B", name: "Intent Contract", status: "Completed" },
    { id: "10C", name: "Persistence", status: "Completed" },
    { id: "10D", name: "Approval Workflow", status: "Completed" },
    { id: "10E", name: "Evidence Bundle / Audit Trail", status: "Completed" },
    { id: "10F", name: "Readiness Packet / Dry-run Guard", status: "Completed" },
    { id: "11", name: "Money Execution", status: "Forbidden" },
  ];

  const executionBoundary = {
    executionEnabled: false, mutationEnabled: false, payoutEnabled: false,
    refundExecutionEnabled: false, ledgerMutationEnabled: false,
    settlementMutationEnabled: false, fileGenerationEnabled: false,
    downloadEnabled: false, providerDispatchEnabled: false,
  };

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>Settlement Action Governance</h1>
          <p style={{ margin: 0, color: "#666" }}>
            Phase 10 Foundation · <strong>Governance Only</strong> · <strong>Execution Disabled</strong>
          </p>
        </div>
        <button onClick={onBack}>← Back to Console</button>
      </div>

      {/* 1. Governance Boundary Banner */}
      <section style={{ border: "1px solid #faad14", backgroundColor: "#fffbe6", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Governance Boundary</h2>
        <ul>
          <li>This page does not execute payouts.</li>
          <li>This page does not execute refunds.</li>
          <li>This page does not mutate settlement, ledger, payment, or refund results.</li>
          <li>Phase 10 is governance shell only — execution disabled.</li>
        </ul>
      </section>

      {/* 2. Linked Phase 9 Context (Read-Only References) */}
      <section style={{ border: "1px solid #d9d9d9", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Linked Phase 9 Context <span style={{ fontSize: 12, color: "#888" }}>(Read-Only References)</span></h2>
        <p>These are read-only operational views from Phase 9:</p>
        <ul>
          <li>Settlement Operations Console (Phase 9A)</li>
          <li>Statement Detail (Phase 9B)</li>
          <li>Export Review (Phase 9C)</li>
          <li>Query/Filter/Pagination Context (Phase 9D–9E)</li>
        </ul>
      </section>

      {/* 3. Intent Contract Summary (Phase 10B) */}
      <section style={{ border: "1px solid #52c41a", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Intent Contract — Phase 10B <span style={{ fontSize: 14, color: "#52c41a" }}>Completed</span></h2>
        <p>The <code>SettlementActionIntent</code> type defines governance intents only. It explicitly rejects execution commands:</p>
        <ul style={{ color: "#cf1322" }}>
          <li>Rejected: execute_payout, pay_now, withdraw</li>
          <li>Rejected: execute_refund, reverse_ledger</li>
          <li>Rejected: mutate_settlement, commit_settlement</li>
          <li>Rejected: generate_export_file, provider_withdrawal</li>
        </ul>
        <p style={{ fontSize: 12, color: "#888" }}>Validated in <code>packages/validators/src/settlementActionIntentSchema.ts</code> — 35 tests.</p>
      </section>

      {/* 4. Governance Persistence Summary (Phase 10C) */}
      <section style={{ border: "1px solid #52c41a", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Governance Persistence — Phase 10C <span style={{ fontSize: 14, color: "#52c41a" }}>Completed</span></h2>
        <p>Governance intents are persisted in the <code>settlement_action_governance_intents</code> table. No settlement/payment/ledger/refund result tables are mutated.</p>
        <ul>
          <li>✅ <code>settlement_action_governance_intents</code> — governance intents only</li>
          <li>❌ No writes to settlement/payment/ledger/refund result tables</li>
          <li>🔒 City-scoped, admin-only access via backend routes</li>
        </ul>
      </section>

      {/* 5. Review Workflow Summary (Phase 10D) */}
      <section style={{ border: "1px solid #52c41a", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Review Workflow — Phase 10D <span style={{ fontSize: 14, color: "#52c41a" }}>Completed</span></h2>
        <p>Governance review workflow with approve-governance only. No payout/refund/ledger reversal approval.</p>
        <ul>
          <li>✅ approve_governance · reject_governance · request_changes</li>
          <li>❌ No approve_payout / execute_refund / reverse_ledger decisions</li>
          <li>🔒 Admin-only RBAC guard enforced on all governance routes</li>
        </ul>
      </section>

      {/* 6. Evidence Bundle / Audit Trail Summary (Phase 10E) */}
      <section style={{ border: "1px solid #52c41a", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Evidence Bundle / Audit Trail — Phase 10E <span style={{ fontSize: 14, color: "#52c41a" }}>Completed</span></h2>
        <p>Evidence bundles store reference IDs only. No file generation, no download URLs.</p>
        <ul>
          <li>✅ Evidence refs: ref_type, ref_id, source_phase, label</li>
          <li>❌ Rejected: file_path, download_url, signed_url, export_file_id</li>
          <li>📋 Governance audit trail aggregates intent + review events</li>
        </ul>
      </section>

      {/* 7. Readiness Packet / Dry-run Guard Summary (Phase 10F) */}
      <section style={{ border: "1px solid #52c41a", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Readiness Packet / Dry-run Guard — Phase 10F <span style={{ fontSize: 14, color: "#52c41a" }}>Completed</span></h2>
        <p>Dry-run guard is metadata-only. No money simulation, no provider dispatch, no file generation.</p>
        <ul>
          <li>🔒 executionSimulationEnabled: false</li>
          <li>🔒 moneyMovementSimulationEnabled: false</li>
          <li>🔒 providerSimulationEnabled: false</li>
          <li>🔒 ledgerSimulationEnabled: false</li>
          <li>🔒 refundSimulationEnabled: false</li>
          <li>🔒 fileGenerationSimulationEnabled: false</li>
        </ul>
        <p style={{ color: "#faad14" }}><strong>Phase 11 required before execution.</strong></p>
      </section>

      {/* 8. Execution Boundary Summary */}
      <section style={{ border: "1px solid #ff4d4f", padding: 16, borderRadius: 6, marginBottom: 16, backgroundColor: "#fff1f0" }}>
        <h2>Execution Boundary — All Disabled</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {Object.entries(executionBoundary).map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #ffccc7" }}>{k}</td>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #ffccc7", color: v ? "#52c41a" : "#cf1322", fontWeight: "bold" }}>
                  {v ? "❌ ENABLED — BLOCKING" : "DISABLED"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 9. Action Intent Draft (Governance Shell Only) */}
      <section style={{ border: "1px solid #d9d9d9", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Action Intent Draft (Governance Shell)</h2>
        <p style={{ color: "#888", fontSize: 12 }}>All fields below are disabled and local-only. No data is sent to the server. No persistence occurs from this page.</p>
        <label>Action Type (placeholder)<br /><input value={actionKind} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="e.g., review, approve, flag — not executable" /></label><br /><br />
        <label>Target Statement (placeholder)<br /><input value={targetStatementId} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="e.g., statement-12345" /></label><br /><br />
        <label>Reason (placeholder)<br /><input value={reason} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="e.g., reconciliation review" /></label><br /><br />
        <label>Evidence References (placeholder)<br /><input value={evidenceRefs} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="e.g., exp_001, rev_002" /></label><br /><br />
        <label>Risk Notes (placeholder)<br /><input value={riskNotes} disabled readOnly style={{ width: "100%", opacity: 0.5 }} placeholder="e.g., high value, cross-check" /></label>
      </section>

      {/* 10. Forbidden Actions (Execution Disabled) */}
      <section style={{ border: "1px solid #ff4d4f", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Forbidden Actions (Execution Disabled Until Future Phase)</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button disabled>Execution disabled — Payout</button>
          <button disabled>Execution disabled — Refund</button>
          <button disabled>Execution disabled — Reverse Ledger</button>
          <button disabled>Execution disabled — Commit Settlement</button>
          <button disabled>Execution disabled — Generate Export File</button>
          <button disabled>Execution disabled — Approve and Execute</button>
        </div>
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          All execution buttons above are disabled and no-op. No API calls are made. No mutation handlers are bound. No download/export generation is triggered. No backend interaction occurs.
        </p>
      </section>

      {/* 11. Phase Boundary */}
      <section style={{ border: "1px solid #d9d9d9", padding: 16, borderRadius: 6, marginBottom: 16 }}>
        <h2>Phase Boundary</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>Phase</th><th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>Description</th><th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #ccc" }}>Status</th></tr></thead>
          <tbody>
            {phases.map(p => (
              <tr key={p.id}>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0" }}>Phase {p.id}</td>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0" }}>{p.name}</td>
                <td style={{ padding: "4px 8px", borderBottom: "1px solid #f0f0f0", color: p.status === "Completed" ? "#52c41a" : p.status === "Forbidden" ? "#cf1322" : "#666", fontWeight: "bold" }}>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button onClick={onBack}>← Back to Console</button>
    </div>
  );
}
