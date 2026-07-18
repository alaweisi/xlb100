import { useCallback, useEffect, useState } from "react";
import type { SupportQualityDashboard } from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, LoadingState, ScopeBadge, StatusTag } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import { cityLabel, presentFailure, useOnlineStatus, type OperationsFailure } from "../operationsPresentation";
import "./operations-workbench.css";

const key = () => `quality-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function SupportQualityPage({ initialCityCode }: { initialCityCode?: string }) {
  const online = useOnlineStatus();
  const [dashboard, setDashboard] = useState<SupportQualityDashboard | null>(null);
  const [version, setVersion] = useState("");
  const [target, setTarget] = useState("");
  const [rubricName, setRubricName] = useState("");
  const [accuracyWeight, setAccuracyWeight] = useState("");
  const [empathyWeight, setEmpathyWeight] = useState("");
  const [accuracyScore, setAccuracyScore] = useState("");
  const [empathyScore, setEmpathyScore] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<OperationsFailure | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setFailure(null);
    try { setDashboard((await api.getSupportQualityDashboard()).dashboard); }
    catch (error) { const next = presentFailure(error, "客服质量看板"); if (next.kind === "forbidden") setDashboard(null); setFailure(next); }
    finally { setLoading(false); }
  }, [initialCityCode]);

  useEffect(() => { void load(); }, [load]);

  async function rubric() {
    setBusy("rubric"); setFailure(null); setNotice("");
    try {
      const response = await api.createSupportQualityRubric({
        name: rubricName.trim(),
        criteria: [
          { key: "accuracy", weight: Number(accuracyWeight), maxScore: 5 },
          { key: "empathy", weight: Number(empathyWeight), maxScore: 5 },
        ],
      });
      setVersion(response.rubric.rubricVersionId);
      setNotice("质检量表版本已由服务端创建并发布。");
    } catch (error) { setFailure(presentFailure(error, "发布质检量表")); }
    finally { setBusy(null); }
  }

  async function review() {
    setBusy("review"); setFailure(null); setNotice("");
    try {
      const response = await api.createSupportQualityReview({
        targetType: "ticket",
        targetId: target.trim(),
        rubricVersionId: version.trim(),
        criterionScores: { accuracy: Number(accuracyScore), empathy: Number(empathyScore) },
        idempotencyKey: key(),
      });
      setNotice(`质检结果已提交，服务端综合得分为 ${response.review.overallScore}。`);
      await load();
    } catch (error) { setFailure(presentFailure(error, "提交质检结果")); }
    finally { setBusy(null); }
  }

  const weightsValid = Number(accuracyWeight) > 0 && Number(empathyWeight) > 0 && Number(accuracyWeight) + Number(empathyWeight) === 100;
  const scoresValid = [accuracyScore, empathyScore].every((value) => Number(value) >= 0 && Number(value) <= 5 && value !== "");

  const isPublishingRubric = busy === "rubric";
  const isSubmittingReview = busy === "review";

  return <div className="operations-workbench">
    <Card title="客服质量管理" actions={<><ScopeBadge scope={`城市：${cityLabel(initialCityCode)}`} /><StatusTag tone={online ? "success" : "danger"}>{online ? "服务已连接" : "当前离线"}</StatusTag></>}><Button onClick={() => void load()} disabled={loading}>{loading ? "刷新中…" : "刷新质量数据"}</Button></Card>
    {!online && <div className="operations-alert operations-alert--offline" role="status">网络已断开，无法发布量表或提交质检结果。</div>}
    {failure && <ApiErrorPanel title={failure.title} detail={failure.detail} action={<Button onClick={() => void load()}>刷新最新数据</Button>} />}
    {notice && <div className="operations-alert" role="status">{notice}</div>}
    {loading && !dashboard && <LoadingState title="正在读取客服质量数据" />}
    <div className="operations-kpi-grid">
      <div className="operations-kpi"><span>满意度回复数</span><strong>{dashboard ? dashboard.response_count : "—"}</strong></div>
      <div className="operations-kpi"><span>平均满意度</span><strong>{dashboard ? dashboard.average_score : "—"}</strong></div>
      <div className="operations-kpi"><span>质检数量</span><strong>{dashboard ? dashboard.review_count : "—"}</strong></div>
      <div className="operations-kpi"><span>平均质检分</span><strong>{dashboard ? dashboard.average_review_score : "—"}</strong></div>
    </div>
    {!loading && !dashboard && !failure && <EmptyState title="暂无客服质量汇总" />}
    <div className="dispatch-layout">
      <Card title="发布质检量表版本"><div className="operations-section-stack"><FormField label="量表名称"><Input value={rubricName} onChange={(event) => setRubricName(event.target.value)} /></FormField><div className="operations-form-grid"><FormField label="准确性权重（%）"><Input type="number" min="1" max="99" value={accuracyWeight} onChange={(event) => setAccuracyWeight(event.target.value)} /></FormField><FormField label="沟通同理心权重（%）"><Input type="number" min="1" max="99" value={empathyWeight} onChange={(event) => setEmpathyWeight(event.target.value)} /></FormField></div>{accuracyWeight && empathyWeight && !weightsValid ? <div className="operations-alert operations-alert--danger">两项权重合计必须为 100%。</div> : null}<Button variant="primary" disabled={!online || busy !== null || !rubricName.trim() || !weightsValid} onClick={() => void rubric()}>{isPublishingRubric ? "发布中…" : "创建并发布量表版本"}</Button><p className="operations-muted">当前量表版本：{version || "尚未选择"}</p></div></Card>
      <Card title="提交工单质检"><div className="operations-section-stack"><FormField label="已关闭工单编号"><Input value={target} onChange={(event) => setTarget(event.target.value)} /></FormField><FormField label="量表版本"><Input value={version} onChange={(event) => setVersion(event.target.value)} /></FormField><div className="operations-form-grid"><FormField label="准确性评分（0—5）"><Input type="number" min="0" max="5" value={accuracyScore} onChange={(event) => setAccuracyScore(event.target.value)} /></FormField><FormField label="沟通同理心评分（0—5）"><Input type="number" min="0" max="5" value={empathyScore} onChange={(event) => setEmpathyScore(event.target.value)} /></FormField></div><Button variant="primary" disabled={!online || busy !== null || !target.trim() || !version.trim() || !scoresValid} onClick={() => void review()}>{isSubmittingReview ? "提交中…" : "提交质检结果"}</Button></div></Card>
    </div>
  </div>;
}
