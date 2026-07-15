import { useCallback, useEffect, useState } from "react";
import type { SupportQualityDashboard } from "@xlb/types";
import { Button, Card, FormField, Input, StatusTag } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";

const key = () => `quality-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function SupportQualityPage({ initialCityCode }: { initialCityCode?: string }) {
  const [dashboard, setDashboard] = useState<SupportQualityDashboard | null>(null);
  const [version, setVersion] = useState("");
  const [target, setTarget] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setDashboard((await api.getSupportQualityDashboard()).dashboard);
  }, [initialCityCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function rubric() {
    const response = await api.createSupportQualityRubric({
      name: `Support quality ${Date.now()}`,
      criteria: [
        { key: "accuracy", weight: 60, maxScore: 5 },
        { key: "empathy", weight: 40, maxScore: 5 },
      ],
    });
    setVersion(response.rubric.rubricVersionId);
    setNotice("Rubric version published");
  }

  async function review() {
    const response = await api.createSupportQualityReview({
      targetType: "ticket",
      targetId: target,
      rubricVersionId: version,
      criterionScores: { accuracy: 5, empathy: 5 },
      idempotencyKey: key(),
    });
    setNotice(`Review submitted · ${response.review.overallScore}`);
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="Support quality dashboard"
        actions={<StatusTag tone="primary">city: {initialCityCode || "active"}</StatusTag>}
      >
        <Button onClick={() => void load()}>Refresh</Button>
        {dashboard ? (
          <p>
            CSAT responses: {dashboard.response_count} · Average: {dashboard.average_score} · Reviews:{" "}
            {dashboard.review_count} · Review score: {dashboard.average_review_score}
          </p>
        ) : null}
      </Card>
      <Card title="Rubric version">
        <Button variant="primary" onClick={() => void rubric()}>Create and publish rubric version</Button>
        <p>{version || "No rubric version selected"}</p>
      </Card>
      <Card title="Quality review">
        <FormField label="Closed ticket ID">
          <Input value={target} onChange={(event) => setTarget(event.target.value)} />
        </FormField>
        <FormField label="Rubric version">
          <Input value={version} onChange={(event) => setVersion(event.target.value)} />
        </FormField>
        <Button variant="primary" disabled={!target || !version} onClick={() => void review()}>
          Submit review
        </Button>
      </Card>
      {notice ? <p>{notice}</p> : null}
    </div>
  );
}
