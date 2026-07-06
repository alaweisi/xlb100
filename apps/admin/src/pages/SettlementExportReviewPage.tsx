import { useState, useEffect, useCallback } from "react";
import { settlementApi, createApiClient } from "@xlb/api-client";
import { API_BASE } from "../apiBase";

const client = createApiClient({ baseUrl: API_BASE, headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator" } });
const api = settlementApi.create(client);

interface ExportItem {
  exportId: string; cityCode: string; statementId: string;
  reviewId: string | null; workerId: string;
  exportFormat: string; payloadVersion: string;
  contentHash: string; exportedAt: string; exportedBy: string;
  outboxEventId: string | null;
}

interface Props {
  onBack: () => void;
  onNavigateToDetail?: (statementId: string) => void;
  filterStatementId?: string;
  filterCityCode?: string;
}

export function SettlementExportReviewPage({ onBack, onNavigateToDetail, filterStatementId, filterCityCode }: Props) {
  const [cityCode, setCityCode] = useState(filterCityCode || "hangzhou");
  const [items, setItems] = useState<ExportItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExports = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string> = { cityCode };
      if (cursor) query.cursor = cursor;
      if (filterStatementId) query.statementId = filterStatementId;
      const res = await api.listExportAudit(query);
      if (res.ok) {
        setItems(res.items as ExportItem[]);
        setNextCursor(res.nextCursor);
      } else {
        setError("Failed to load exports");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [cityCode]);

  useEffect(() => { fetchExports(); }, [fetchExports]);

  return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack}>← Back to Console</button>
      <h1>Settlement Export Review</h1>
      <label>City: <input value={cityCode} onChange={(e) => setCityCode(e.target.value)} /></label>
      <button onClick={() => fetchExports()}>Refresh</button>
      {loading && <p>Loading exports...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {!loading && !error && items.length === 0 && <p>No export records</p>}
      {items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Export ID</th>
              <th>Statement</th>
              <th>Worker</th>
              <th>Format</th>
              <th>Content Hash</th>
              <th>Exported At</th>
              <th>Exported By</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.exportId}>
                <td>{item.exportId}</td>
                <td>
                  {onNavigateToDetail ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToDetail(item.statementId); }}
                      style={{ cursor: "pointer" }}>{item.statementId}</a>
                  ) : item.statementId}
                </td>
                <td>{item.workerId}</td>
                <td>{item.exportFormat}</td>
                <td>{item.contentHash?.slice(0, 12)}...</td>
                <td>{item.exportedAt}</td>
                <td>{item.exportedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {nextCursor && (
        <button onClick={() => fetchExports(nextCursor)}>Load More</button>
      )}
    </div>
  );
}
