import { useState, useEffect, useCallback } from "react";
import { settlementApi, createApiClient } from "@xlb/api-client";
import { API_BASE } from "../apiBase";
import { Button, Card, EmptyState, ErrorState, FormField, Input, LoadingState, StatusTag, Table } from "@xlb/ui";

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
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="Settlement Export Review"
        actions={
          <>
            <StatusTag tone="primary">city_scope: {cityCode}</StatusTag>
            <StatusTag tone={loading ? "warning" : "success"}>{loading ? "loading" : "ready"}</StatusTag>
          </>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={onBack}>← Back to Console</Button>
            <Button onClick={() => fetchExports()} variant="primary">Refresh</Button>
          </div>
          <FormField label="City" description="Export audit remains filtered by city scope.">
            <Input value={cityCode} onChange={(e) => setCityCode(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {loading && <LoadingState title="Loading exports..." description="Reading export audit records." />}
      {error && <ErrorState title="Error" description={error} action={<Button onClick={() => fetchExports()}>Retry</Button>} />}
      {!loading && !error && items.length === 0 && <EmptyState title="No export records" description="The API returned an empty export audit list for this filter." />}

      {items.length > 0 && (
        <Card title="Export Audit Records" actions={<StatusTag tone="muted">{items.length} rows</StatusTag>}>
          <Table
            rows={items}
            getRowKey={(item) => item.exportId}
            columns={[
              { key: "exportId", title: "Export ID", render: (item) => item.exportId },
              {
                key: "statement",
                title: "Statement",
                render: (item) =>
                  onNavigateToDetail ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); onNavigateToDetail(item.statementId); }} style={{ color: "#2563eb" }}>
                      {item.statementId}
                    </a>
                  ) : item.statementId,
              },
              { key: "worker", title: "Worker", render: (item) => item.workerId },
              { key: "format", title: "Format", render: (item) => <StatusTag tone="primary">{item.exportFormat}</StatusTag> },
              { key: "hash", title: "Content Hash", render: (item) => `${item.contentHash?.slice(0, 12)}...` },
              { key: "exportedAt", title: "Exported At", render: (item) => item.exportedAt },
              { key: "exportedBy", title: "Exported By", render: (item) => item.exportedBy },
            ]}
          />
          {nextCursor && <div style={{ marginTop: 12 }}><Button onClick={() => fetchExports(nextCursor)}>Load More</Button></div>}
        </Card>
      )}
    </div>
  );
}
