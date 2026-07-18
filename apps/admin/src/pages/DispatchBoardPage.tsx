import { useCallback, useEffect, useMemo, useState } from "react";
import type { DispatchBoardRow } from "@xlb/api-client";
import { ApiErrorPanel, Button, Card, EmptyState, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import {
  cityLabel,
  formatDateTime,
  presentFailure,
  reasonLabel,
  statusLabel,
  statusTone,
  useOnlineStatus,
  type OperationsFailure,
} from "../operationsPresentation";
import "./operations-workbench.css";

const DISPATCH_STATUSES = [
  "pending",
  "queued",
  "offering",
  "accepted",
  "reassigning",
  "no_match",
  "manual_review",
  "timeout",
  "failed",
  "completed",
  "cancelled",
] as const;

type StatusFilter = "all" | (typeof DISPATCH_STATUSES)[number];

interface DispatchTaskView {
  dispatchTaskId: string;
  orderId: string;
  skuId: string;
  status: string;
  attemptCount: number;
  lastReason: string | null;
  candidates: NonNullable<DispatchBoardRow["offer"]>[];
}

function groupRows(rows: DispatchBoardRow[]): DispatchTaskView[] {
  const grouped = new Map<string, DispatchTaskView>();
  for (const row of rows) {
    const current = grouped.get(row.dispatchTaskId) ?? {
      dispatchTaskId: row.dispatchTaskId,
      orderId: row.orderId,
      skuId: row.skuId,
      status: row.status,
      attemptCount: row.attemptCount,
      lastReason: row.lastReason,
      candidates: [],
    };
    if (row.offer && !current.candidates.some((candidate) => candidate.offerId === row.offer?.offerId)) {
      current.candidates.push(row.offer);
    }
    grouped.set(row.dispatchTaskId, current);
  }
  return [...grouped.values()].map((task) => ({
    ...task,
    candidates: task.candidates.sort((left, right) => (left.rankScore ?? Number.MAX_SAFE_INTEGER) - (right.rankScore ?? Number.MAX_SAFE_INTEGER)),
  }));
}

export function DispatchBoardPage({ initialCityCode }: { initialCityCode?: string }) {
  const cityCode = initialCityCode || "hangzhou";
  const online = useOnlineStatus();
  const [rows, setRows] = useState<DispatchBoardRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<OperationsFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasks = useMemo(() => groupRows(rows), [rows]);
  const filteredTasks = filter === "all" ? tasks : tasks.filter((task) => task.status === filter);
  const selected = filteredTasks.find((task) => task.dispatchTaskId === selectedTaskId) ?? filteredTasks[0] ?? null;
  const incompleteCandidateCount = rows.filter((row) => row.offer && (row.offer.distanceKm == null || row.offer.etaMinutes == null || row.offer.rankScore == null)).length;

  const load = useCallback(async () => {
    setBusy("load");
    setFailure(null);
    setNotice(null);
    try {
      const response = await api.listDispatchBoard();
      setRows(response.rows);
      setSelectedTaskId((current) => current && response.rows.some((row) => row.dispatchTaskId === current) ? current : response.rows[0]?.dispatchTaskId ?? null);
    } catch (error) {
      const nextFailure = presentFailure(error, "派单看板");
      if (nextFailure.kind === "forbidden") {
        setRows([]);
        setSelectedTaskId(null);
      }
      setFailure(nextFailure);
    } finally {
      setLoaded(true);
      setBusy(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runAction(key: string, action: () => Promise<{ processed: number }>, successText: (processed: number) => string) {
    setBusy(key);
    setFailure(null);
    setNotice(null);
    try {
      const result = await action();
      setNotice(successText(result.processed));
      const response = await api.listDispatchBoard();
      setRows(response.rows);
    } catch (error) {
      setFailure(presentFailure(error, "派单"));
    } finally {
      setBusy(null);
    }
  }

  const statusCount = (status: string) => tasks.filter((task) => task.status === status).length;

  return (
    <div className="operations-workbench">
      <Card
        title="城市派单工作台"
        actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone={online ? "success" : "danger"}>{online ? "服务已连接" : "当前离线"}</StatusTag></>}
      >
        <div className="operations-toolbar">
          <div className="operations-toolbar__copy">
            <p>仅展示当前城市范围内的真实任务与候选邀约；精确坐标不会进入后台页面。</p>
          </div>
          <div className="operations-toolbar__actions">
            <Button onClick={() => void load()} disabled={busy !== null}>{busy === "load" ? "刷新中…" : "刷新看板"}</Button>
            <Button variant="primary" onClick={() => void runAction("match-all", () => api.runDispatchMatch(), (count) => `匹配扫描已完成，服务端处理 ${count} 个任务。`)} disabled={busy !== null || !online}>匹配待处理任务</Button>
            <Button onClick={() => void runAction("timeout", () => api.runDispatchTimeout(), (count) => `超时扫描已完成，服务端处理 ${count} 个任务。`)} disabled={busy !== null || !online}>执行超时扫描</Button>
          </div>
        </div>
      </Card>

      {!online && <div className="operations-alert operations-alert--offline" role="status">网络已断开。页面保留上次成功读取的数据供核对，但所有写操作已停用，旧数据不会标记为最新。</div>}
      {notice && <div className="operations-alert" role="status">{notice}</div>}
      {failure && <ApiErrorPanel title={failure.title} detail={failure.detail} action={<Button onClick={() => void load()}>重新读取</Button>} />}
      {loaded && incompleteCandidateCount > 0 && <div className="operations-alert" role="status">部分结果：有 {incompleteCandidateCount} 条候选记录缺少距离、预计到达时间或排序分值；页面不推算缺失数据。</div>}

      {!loaded && busy === "load" ? <LoadingState title="正在读取派单任务" description="正在按当前城市权限读取任务、候选邀约与派单原因。" /> : (
        <>
          <Card title="状态队列" actions={<StatusTag tone="primary">共 {tasks.length} 个任务</StatusTag>}>
            <div className="operations-status-strip" aria-label="派单状态筛选">
              <button className="operations-status-chip" type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}><strong>{tasks.length}</strong><span>全部状态</span></button>
              {DISPATCH_STATUSES.map((status) => <button className="operations-status-chip" type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}><strong>{statusCount(status)}</strong><span>{statusLabel(status)}</span></button>)}
            </div>
          </Card>

          <div className="dispatch-layout">
            <Card title="任务队列" actions={<StatusTag tone="muted">当前筛选 {filteredTasks.length} 个</StatusTag>}>
              {filteredTasks.length === 0 ? <EmptyState title="当前筛选下没有任务" description="可切换状态筛选，或刷新读取服务端最新结果。" /> : (
                <Table rows={filteredTasks} getRowKey={(task) => task.dispatchTaskId} columns={[
                  { key: "task", title: "派单任务", render: (task) => <button type="button" className="operations-row-button" onClick={() => setSelectedTaskId(task.dispatchTaskId)}>{task.dispatchTaskId}</button> },
                  { key: "order", title: "订单", render: (task) => task.orderId },
                  { key: "sku", title: "服务项目", render: (task) => task.skuId },
                  { key: "status", title: "状态", render: (task) => <StatusTag tone={statusTone(task.status)}>{statusLabel(task.status)}</StatusTag> },
                  { key: "attempt", title: "匹配轮次", render: (task) => `${task.attemptCount} 次` },
                  { key: "candidates", title: "候选", render: (task) => `${task.candidates.length} 人` },
                  { key: "reason", title: "最近原因", render: (task) => reasonLabel(task.lastReason) },
                ]} />
              )}
            </Card>

            <div className="dispatch-detail-stack">
              <Card title="候选与原因">
                {!selected ? <EmptyState title="请选择派单任务" description="选择左侧任务后查看候选排序和服务端原因。" /> : (
                  <div className="operations-section-stack">
                    <section className="operations-panel">
                      <h3>{selected.dispatchTaskId}</h3>
                      <dl className="operations-definition-grid">
                        <div><dt>当前状态</dt><dd><StatusTag tone={statusTone(selected.status)}>{statusLabel(selected.status)}</StatusTag></dd></div>
                        <div><dt>匹配轮次</dt><dd>{selected.attemptCount} 次</dd></div>
                        <div><dt>关联订单</dt><dd>{selected.orderId}</dd></div>
                        <div><dt>服务项目</dt><dd>{selected.skuId}</dd></div>
                      </dl>
                      <div className="operations-alert">{reasonLabel(selected.lastReason)}</div>
                      <Button disabled={busy !== null || !online || !["pending", "queued", "reassigning", "no_match", "manual_review", "timeout", "failed"].includes(selected.status)} onClick={() => void runAction(`match:${selected.dispatchTaskId}`, () => api.runDispatchMatch(selected.dispatchTaskId), (count) => `任务 ${selected.dispatchTaskId} 已完成重试，服务端处理 ${count} 个任务。`)}>{busy === `match:${selected.dispatchTaskId}` ? "重试中…" : "重新匹配该任务"}</Button>
                    </section>

                    <section className="operations-panel">
                      <h3>候选排序</h3>
                      {selected.candidates.length === 0 ? <EmptyState title="服务端未返回候选" description="页面不会生成候选或推测距离；请结合最近原因决定是否重试或转人工。" /> : (
                        <Table rows={selected.candidates} getRowKey={(candidate) => candidate.offerId} columns={[
                          { key: "rank", title: "排序分值", render: (candidate) => candidate.rankScore == null ? "未返回" : candidate.rankScore.toFixed(2) },
                          { key: "worker", title: "师傅", render: (candidate) => candidate.workerId },
                          { key: "status", title: "邀约状态", render: (candidate) => <StatusTag tone={statusTone(candidate.status)}>{statusLabel(candidate.status)}</StatusTag> },
                          { key: "route", title: "路程 / 到达", render: (candidate) => candidate.distanceKm == null || candidate.etaMinutes == null ? "数据不完整" : `${candidate.distanceKm.toFixed(1)} 公里 / ${candidate.etaMinutes} 分钟` },
                          { key: "fresh", title: "位置", render: (candidate) => <StatusTag tone={statusTone(candidate.locationFreshness)}>{candidate.locationFreshness ? statusLabel(candidate.locationFreshness) : "未返回"}</StatusTag> },
                          { key: "expires", title: "邀约截止", render: (candidate) => formatDateTime(candidate.expiresAt) },
                        ]} />
                      )}
                      <p>排序分值、距离和预计到达时间均来自服务端；页面不展示精确坐标，也不把本地地理能力描述为外部供应商成功。</p>
                    </section>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
