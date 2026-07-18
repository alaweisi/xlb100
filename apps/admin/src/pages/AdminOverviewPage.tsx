import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ClipboardText,
  Headset,
  MapTrifold,
  ShieldCheck,
  Wallet,
} from "@phosphor-icons/react";
import { ApiErrorPanel, Button, LoadingState, MetricCard, StatusTag } from "@xlb/ui";
import { adminSettlementApi as api } from "../adminAuth";

interface OverviewSnapshot {
  totalStatements: number;
  reviewedStatements: number;
  approvedStatements: number;
  totalGaps: number;
}

interface Props {
  cityCode: string;
  role: string;
  onOpenOrderTrace: () => void;
  onOpenDispatch: () => void;
  onOpenSupport: () => void;
  onOpenSettlement: () => void;
}

function cityName(cityCode: string) {
  return cityCode === "hangzhou" ? "杭州" : cityCode === "shanghai" ? "上海" : "北京";
}

export function AdminOverviewPage({
  cityCode,
  role,
  onOpenOrderTrace,
  onOpenDispatch,
  onOpenSupport,
  onOpenSettlement,
}: Props) {
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, gaps] = await Promise.all([
        api.getReviewSummary({ cityCode }),
        api.scanReconciliationGaps({ cityCode }),
      ]);
      const overall = (summary as { overall?: Partial<OverviewSnapshot> }).overall ?? {};
      const gapSummary = (gaps as { summary?: { totalGaps?: number } }).summary ?? {};
      setSnapshot({
        totalStatements: Number(overall.totalStatements ?? 0),
        reviewedStatements: Number(overall.reviewedStatements ?? 0),
        approvedStatements: Number(overall.approvedStatements ?? 0),
        totalGaps: Number(gapSummary.totalGaps ?? 0),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "运营总览加载失败");
    } finally {
      setLoading(false);
    }
  }, [cityCode]);

  useEffect(() => { void load(); }, [load]);

  const pendingReview = useMemo(
    () => Math.max(0, (snapshot?.totalStatements ?? 0) - (snapshot?.reviewedStatements ?? 0)),
    [snapshot],
  );

  return (
    <div className="admin-overview">
      <section className="admin-overview-hero">
        <div>
          <span className="admin-overview-eyebrow">{cityName(cityCode)}城市工作台</span>
          <h1>运营总览</h1>
          <p>集中查看待处理业务、结算风险与城市服务状态。</p>
        </div>
        <div className="admin-overview-identity">
          <StatusTag tone="success">业务已接入</StatusTag>
          <span>当前账号已验证 · {role === "operator" ? "运营人员" : role === "auditor" ? "审计人员" : "管理员"}</span>
        </div>
      </section>

      {loading ? <LoadingState title="正在加载运营总览" description="正在读取当前城市的真实运营数据。" /> : null}
      {error ? <ApiErrorPanel title="运营总览加载失败" detail={error} action={<Button onClick={() => void load()}>重新加载</Button>} /> : null}

      {!loading && !error ? (
        <section aria-label="城市运营指标" className="admin-overview-metrics">
          <MetricCard productRole="admin" label="结算单" value={snapshot?.totalStatements ?? 0} hint="当前城市" tone="primary" />
          <MetricCard productRole="admin" label="待复核" value={pendingReview} hint="需要运营处理" tone={pendingReview ? "warning" : "muted"} />
          <MetricCard productRole="admin" label="已通过" value={snapshot?.approvedStatements ?? 0} hint="复核通过" tone="success" />
          <MetricCard productRole="admin" label="对账差异" value={snapshot?.totalGaps ?? 0} hint="需要核对" tone={snapshot?.totalGaps ? "warning" : "muted"} />
        </section>
      ) : null}

      <section className="admin-overview-section">
        <header><div><span>常用工作台</span><h2>从今天最重要的工作开始</h2></div></header>
        <div className="admin-workbench-grid">
          <button onClick={onOpenOrderTrace} type="button">
            <ClipboardText size={26} weight="regular" /><span><strong>订单追踪</strong><small>查询订单与完整证据链</small></span><ArrowRight size={18} weight="bold" />
          </button>
          <button onClick={onOpenDispatch} type="button">
            <MapTrifold size={26} weight="regular" /><span><strong>城市派单</strong><small>查看派单结果与异常原因</small></span><ArrowRight size={18} weight="bold" />
          </button>
          <button onClick={onOpenSupport} type="button">
            <Headset size={26} weight="regular" /><span><strong>客服工作台</strong><small>处理工单、会话与服务时限</small></span><ArrowRight size={18} weight="bold" />
          </button>
          <button onClick={onOpenSettlement} type="button">
            <Wallet size={26} weight="regular" /><span><strong>结算运营</strong><small>复核结算单与对账差异</small></span><ArrowRight size={18} weight="bold" />
          </button>
        </div>
      </section>

      <section className="admin-overview-boundary">
        <ShieldCheck size={24} weight="regular" />
        <div><strong>受控运营边界</strong><p>所有查询与操作均携带城市和后台身份；涉及资金、退款和外部执行的动作仍由对应业务审批链控制。</p></div>
      </section>
    </div>
  );
}
