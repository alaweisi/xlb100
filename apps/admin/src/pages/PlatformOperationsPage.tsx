import { useCallback, useEffect, useState } from "react";
import type { AdminOrderSummary, AdminSkuOperationsRow, WorkerCertification } from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, Input, LoadingState, ScopeBadge, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import {
  cityLabel,
  formatCurrency,
  formatDateTime,
  presentFailure,
  statusLabel,
  statusTone,
  useOnlineStatus,
  type OperationsFailure,
} from "../operationsPresentation";
import "./operations-workbench.css";

type SectionKey = "orders" | "catalog" | "certifications";

interface SectionError {
  section: SectionKey;
  failure: OperationsFailure;
}

const SECTION_NAMES: Record<SectionKey, string> = {
  orders: "城市订单池",
  catalog: "服务目录",
  certifications: "师傅认证",
};

export function PlatformOperationsPage({ initialCityCode }: { initialCityCode?: string }) {
  const cityCode = initialCityCode || "hangzhou";
  const online = useOnlineStatus();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [skus, setSkus] = useState<AdminSkuOperationsRow[]>([]);
  const [certifications, setCertifications] = useState<WorkerCertification[]>([]);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<SectionError[]>([]);
  const [actionFailure, setActionFailure] = useState<OperationsFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy("load");
    setSectionErrors([]);
    setActionFailure(null);
    try {
      const [orderResult, skuResult, certificationResult] = await Promise.allSettled([
        api.listOperationsOrders(),
        api.listOperationsSkus(),
        api.listWorkerCertifications(),
      ]);
      const failures: SectionError[] = [];
      if (orderResult.status === "fulfilled") setOrders(orderResult.value.orders);
      else {
        const failure = presentFailure(orderResult.reason, "城市订单池");
        if (failure.kind === "forbidden") setOrders([]);
        failures.push({ section: "orders", failure });
      }
      if (skuResult.status === "fulfilled") setSkus(skuResult.value.skus);
      else {
        const failure = presentFailure(skuResult.reason, "服务目录");
        if (failure.kind === "forbidden") setSkus([]);
        failures.push({ section: "catalog", failure });
      }
      if (certificationResult.status === "fulfilled") setCertifications(certificationResult.value.certifications);
      else {
        const failure = presentFailure(certificationResult.reason, "师傅认证");
        if (failure.kind === "forbidden") setCertifications([]);
        failures.push({ section: "certifications", failure });
      }
      setSectionErrors(failures);
    } finally {
      setLoaded(true);
      setBusy(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runAction(key: string, subject: string, action: () => Promise<unknown>, successMessage: string) {
    setBusy(key);
    setActionFailure(null);
    setNotice(null);
    try {
      await action();
      await load();
      setNotice(successMessage);
    } catch (error) {
      setActionFailure(presentFailure(error, subject));
    } finally {
      setBusy(null);
    }
  }

  const pendingCertificationCount = certifications.filter((item) => item.status === "pending").length;
  const enabledSkuCount = skus.filter((item) => item.isEnabled).length;

  return (
    <div className="operations-workbench">
      <Card title="平台运营联动工作台" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone={online ? "success" : "danger"}>{online ? "服务已连接" : "当前离线"}</StatusTag></>}>
        <div className="operations-toolbar">
          <div className="operations-toolbar__copy"><p>订单、正式服务目录与师傅认证均读取现有城市级接口；目录开关与认证审核会写入真实业务记录。</p></div>
          <div className="operations-toolbar__actions"><Button onClick={() => void load()} disabled={busy !== null}>{busy === "load" ? "刷新中…" : "刷新全部"}</Button></div>
        </div>
      </Card>

      {!online && <div className="operations-alert operations-alert--offline" role="status">网络已断开。页面仅保留上次成功读取的结果，目录与认证写操作已停用。</div>}
      {notice && <div className="operations-alert" role="status">{notice}</div>}
      {actionFailure && <ApiErrorPanel title={actionFailure.title} detail={actionFailure.detail} action={<Button onClick={() => void load()}>刷新最新数据</Button>} />}
      {sectionErrors.length > 0 && (
        <div className="operations-alert" role="status">
          部分结果：{sectionErrors.map(({ section, failure }) => `${SECTION_NAMES[section]}（${failure.title}）`).join("、")} 未能更新；其余分区仍展示本次真实返回结果。
        </div>
      )}

      {!loaded && busy === "load" ? <LoadingState title="正在读取平台运营数据" description="正在分别读取城市订单、正式服务目录和师傅认证申请。" /> : (
        <>
          <div className="operations-kpi-grid" aria-label="平台运营实时汇总">
            <div className="operations-kpi"><span>城市订单</span><strong>{sectionErrors.some((item) => item.section === "orders") ? "读取失败" : `${orders.length} 单`}</strong></div>
            <div className="operations-kpi"><span>已启用服务</span><strong>{sectionErrors.some((item) => item.section === "catalog") ? "读取失败" : `${enabledSkuCount} 项`}</strong></div>
            <div className="operations-kpi"><span>目录服务总数</span><strong>{sectionErrors.some((item) => item.section === "catalog") ? "读取失败" : `${skus.length} 项`}</strong></div>
            <div className="operations-kpi"><span>待审核认证</span><strong>{sectionErrors.some((item) => item.section === "certifications") ? "读取失败" : `${pendingCertificationCount} 条`}</strong></div>
          </div>

          <Card title="城市订单池" actions={<StatusTag tone="primary">{orders.length} 单</StatusTag>}>
            {sectionErrors.some((item) => item.section === "orders") && orders.length === 0 ? <EmptyState title="订单数据未能读取" description="当前没有可安全展示的订单结果，请修复权限或网络后重试。" /> : orders.length === 0 ? <EmptyState title="当前城市暂无订单" description="该结果来自城市级订单接口，页面未填充演示订单。" /> : (
              <Table rows={orders} getRowKey={(row) => row.orderId} columns={[
                { key: "order", title: "订单", render: (row) => row.orderId },
                { key: "customer", title: "客户", render: (row) => row.customerId },
                { key: "sku", title: "服务", render: (row) => <div><strong>{row.skuName}</strong><br /><small>{row.skuId}</small></div> },
                { key: "status", title: "订单状态", render: (row) => <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> },
                { key: "amount", title: "订单金额", render: (row) => formatCurrency(row.totalAmount) },
                { key: "scheduled", title: "预约时间", render: (row) => formatDateTime(row.scheduledAt) },
                { key: "trace", title: "联动", render: (row) => <Button onClick={() => { window.location.hash = `#/order-trace?cityCode=${encodeURIComponent(cityCode)}&orderId=${encodeURIComponent(row.orderId)}`; }}>查看全链路</Button> },
              ]} />
            )}
          </Card>

          <Card title="正式服务目录" actions={<><StatusTag tone="primary">{skus.length} 项</StatusTag><StatusTag tone="warning">城市级受控写入</StatusTag></>}>
            {sectionErrors.some((item) => item.section === "catalog") && skus.length === 0 ? <EmptyState title="目录数据未能读取" description="页面不会创建临时类目或猜测服务配置。" /> : skus.length === 0 ? <EmptyState title="当前城市暂无正式服务" description="请以正式服务目录数据源为准，页面不会生成演示类目。" /> : (
              <Table rows={skus} getRowKey={(row) => row.skuId} columns={[
                { key: "category", title: "类目", render: (row) => row.categoryName },
                { key: "sku", title: "服务 SKU", render: (row) => <div><strong>{row.skuName}</strong><br /><small>{row.skuId}</small></div> },
                { key: "price", title: "基础价格", render: (row) => row.basePrice == null ? "未配置" : `${formatCurrency(row.basePrice)} / ${row.unit}` },
                { key: "standard", title: "服务标准", render: (row) => `${row.warrantyDays ?? 0} 天质保 · ${row.supportsEnterprise ? "支持企业客户" : "面向个人客户"}` },
                { key: "status", title: "目录状态", render: (row) => <StatusTag tone={row.isEnabled ? "success" : "muted"}>{row.isEnabled ? "已启用" : "已停用"}</StatusTag> },
                { key: "control", title: "受控操作", render: (row) => <Button disabled={busy !== null || !online} onClick={() => void runAction(`sku:${row.skuId}`, "服务目录", () => api.setOperationsSkuEnabled(row.skuId, !row.isEnabled), `服务 ${row.skuName} 已${row.isEnabled ? "停用" : "启用"}。`)}>{busy === `sku:${row.skuId}` ? "提交中…" : row.isEnabled ? "停用服务" : "启用服务"}</Button> },
              ]} />
            )}
          </Card>

          <Card title="师傅认证审核" actions={<StatusTag tone={pendingCertificationCount > 0 ? "warning" : "success"}>待审核 {pendingCertificationCount} 条</StatusTag>}>
            {sectionErrors.some((item) => item.section === "certifications") && certifications.length === 0 ? <EmptyState title="认证数据未能读取" description="当前没有可安全处理的申请，写操作已保持关闭。" /> : certifications.length === 0 ? <EmptyState title="当前城市暂无认证申请" description="认证申请列表来自现有师傅认证接口。" /> : (
              <Table rows={certifications} getRowKey={(row) => row.certificationId} columns={[
                { key: "worker", title: "师傅", render: (row) => <div><strong>{row.workerId}</strong><br /><small>{row.certificationId}</small></div> },
                { key: "cert", title: "认证项目", render: (row) => <div><strong>{row.certName}</strong><br /><small>{row.certType}</small></div> },
                { key: "submitted", title: "提交时间", render: (row) => formatDateTime(row.submittedAt) },
                { key: "status", title: "审核状态", render: (row) => <div><StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag>{row.rejectReason ? <><br /><small>驳回原因：{row.rejectReason}</small></> : null}</div> },
                { key: "review", title: "审核操作", render: (row) => row.status !== "pending" ? <span className="operations-muted">该申请已完成审核</span> : <div className="operations-reject-control"><Input aria-label={`驳回原因 ${row.certificationId}`} value={rejectReasons[row.certificationId] ?? ""} onChange={(event) => setRejectReasons((current) => ({ ...current, [row.certificationId]: event.target.value }))} placeholder="驳回时必须填写具体原因" /><div className="operations-inline-actions"><Button disabled={busy !== null || !online} onClick={() => void runAction(`approve:${row.certificationId}`, "认证审核", () => api.approveWorkerCertification(row.certificationId), `师傅 ${row.workerId} 的认证申请已通过。`)}>{busy === `approve:${row.certificationId}` ? "提交中…" : "通过"}</Button><Button disabled={busy !== null || !online || !(rejectReasons[row.certificationId] ?? "").trim()} onClick={() => void runAction(`reject:${row.certificationId}`, "认证审核", () => api.rejectWorkerCertification(row.certificationId, (rejectReasons[row.certificationId] ?? "").trim()), `师傅 ${row.workerId} 的认证申请已驳回。`)}>{busy === `reject:${row.certificationId}` ? "提交中…" : "驳回"}</Button></div></div> },
              ]} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
