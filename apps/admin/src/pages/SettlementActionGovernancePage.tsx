import { useState } from "react";

interface Props {
  onBack: () => void;
}

export function SettlementActionGovernancePage({ onBack }: Props) {
  // Intent draft shell — all local-only, no persistence, no API calls
  const [actionType, setActionType] = useState("");
  const [targetStatementId, setTargetStatementId] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceRefs, setEvidenceRefs] = useState("");
  const [riskNotes, setRiskNotes] = useState("");

  const bannerStyle: React.CSSProperties = {
    background: "#fff3cd",
    border: "1px solid #ffc107",
    padding: "16px",
    borderRadius: "4px",
    marginBottom: "16px",
  };

  const disabledInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px",
    marginBottom: "8px",
    background: "#f5f5f5",
    border: "1px solid #ddd",
    borderRadius: "4px",
    color: "#999",
  };

  const disabledButtonStyle: React.CSSProperties = {
    padding: "8px 16px",
    margin: "4px",
    background: "#e0e0e0",
    border: "1px solid #ccc",
    borderRadius: "4px",
    color: "#999",
    cursor: "not-allowed",
  };

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack}>← Back to Console</button>
      <h1>Settlement Action Governance</h1>
      <h2 style={{ color: "#666", fontSize: "16px", fontWeight: "normal" }}>
        Phase 10A Foundation — Governance Only — Execution Disabled
      </h2>

      {/* ── 1. Governance Boundary Banner ── */}
      <section>
        <h2>Governance Boundary</h2>
        <div style={bannerStyle}>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>This page does not execute payouts.</li>
            <li>This page does not execute refunds.</li>
            <li>This page does not mutate settlement, ledger, payment, or refund results.</li>
            <li>Phase 10A is governance shell only.</li>
          </ul>
        </div>
      </section>

      {/* ── 2. Linked Phase 9 Context ── */}
      <section>
        <h2>Linked Phase 9 Context (Read-Only References)</h2>
        <p>
          Refer to the following Phase 9 capabilities for settlement context:
        </p>
        <ul>
          <li>Settlement Operations Console — statement audit, review summary, settlement audit summary, reconciliation gap scan</li>
          <li>Statement Detail — full statement/review/export/outbox drilldown</li>
          <li>Export Review — export audit listing with cursor pagination</li>
          <li>Query / Filter / Pagination — city-scoped filtering and cursor-based navigation</li>
        </ul>
        <p style={{ color: "#666", fontStyle: "italic" }}>
          These are read-only operational views. No data is modified when navigating here.
        </p>
      </section>

      {/* ── 3. Intent Draft Shell ── */}
      <section>
        <h2>Action Intent Draft (Governance Shell Only — No Persistence)</h2>
        <p style={{ color: "#666", fontSize: "14px" }}>
          All fields below are disabled and local-only. No data is sent to the server.
        </p>

        <div>
          <label>Action Type (placeholder)</label>
          <input
            style={disabledInputStyle}
            value={actionType}
            onChange={(e) => setActionType(e.target.value)}
            placeholder="e.g., review, approve, flag — not executable"
            disabled
            readOnly
          />
        </div>

        <div>
          <label>Target Statement (placeholder)</label>
          <input
            style={disabledInputStyle}
            value={targetStatementId}
            onChange={(e) => setTargetStatementId(e.target.value)}
            placeholder="statement-id-reference — not executable"
            disabled
            readOnly
          />
        </div>

        <div>
          <label>Reason (placeholder)</label>
          <textarea
            style={{ ...disabledInputStyle, minHeight: "60px", resize: "vertical" }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="reason for governance action — not executable"
            disabled
            readOnly
          />
        </div>

        <div>
          <label>Evidence References (placeholder)</label>
          <input
            style={disabledInputStyle}
            value={evidenceRefs}
            onChange={(e) => setEvidenceRefs(e.target.value)}
            placeholder="export-id, review-id, outbox-event-id — not executable"
            disabled
            readOnly
          />
        </div>

        <div>
          <label>Risk Notes (placeholder)</label>
          <textarea
            style={{ ...disabledInputStyle, minHeight: "60px", resize: "vertical" }}
            value={riskNotes}
            onChange={(e) => setRiskNotes(e.target.value)}
            placeholder="risk assessment notes — not executable"
            disabled
            readOnly
          />
        </div>
      </section>

      {/* ── 4. Forbidden Action Guard ── */}
      <section>
        <h2>Forbidden Actions (Execution Disabled Until Future Phase)</h2>
        <p style={{ color: "#666" }}>
          The following controls are permanently disabled. They do not call any API and cannot trigger mutations.
        </p>

        <div>
          <button style={disabledButtonStyle} disabled>
            Execution disabled — Payout
          </button>
          <button style={disabledButtonStyle} disabled>
            Execution disabled — Refund
          </button>
          <button style={disabledButtonStyle} disabled>
            Execution disabled — Reverse Ledger
          </button>
          <button style={disabledButtonStyle} disabled>
            Execution disabled — Commit Settlement
          </button>
          <button style={disabledButtonStyle} disabled>
            Execution disabled — Generate Export File
          </button>
          <button style={disabledButtonStyle} disabled>
            Execution disabled — Approve and Execute
          </button>
        </div>

        <div style={{ ...bannerStyle, marginTop: "16px" }}>
          <strong>All execution buttons above are disabled and no-op.</strong>
          <ul style={{ margin: "8px 0 0 0", paddingLeft: 20 }}>
            <li>No API calls are made</li>
            <li>No mutation handlers are bound</li>
            <li>No download/export generation is triggered</li>
            <li>No backend interaction occurs</li>
          </ul>
        </div>
      </section>

      {/* ── 5. Phase Boundary Card ── */}
      <section>
        <h2>Phase Boundary</h2>
        <div style={{ border: "1px solid #ddd", padding: "16px", borderRadius: "4px", background: "#fafafa" }}>
          <table>
            <tbody>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>Phase 10A</td>
                <td style={{ padding: "4px 0", color: "#0066cc" }}>Active — Governance Shell (current)</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>Phase 10B</td>
                <td style={{ padding: "4px 0", color: "#999" }}>Not Started — Intent Contract</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>Phase 10C</td>
                <td style={{ padding: "4px 0", color: "#999" }}>Not Started — Persistence</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>Phase 10D</td>
                <td style={{ padding: "4px 0", color: "#999" }}>Not Started — Approval Workflow</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>Phase 10E</td>
                <td style={{ padding: "4px 0", color: "#999" }}>Not Started — Evidence Bundle</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>Phase 10F</td>
                <td style={{ padding: "4px 0", color: "#999" }}>Not Started — Execution Readiness / Dry-Run</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 12px 4px 0", fontWeight: "bold" }}>Phase 11</td>
                <td style={{ padding: "4px 0", color: "#cc0000" }}>Forbidden — Money Execution (not yet authorized)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p style={{ marginTop: "24px" }}>
        <button onClick={onBack}>← Back to Console</button>
      </p>
    </div>
  );
}
