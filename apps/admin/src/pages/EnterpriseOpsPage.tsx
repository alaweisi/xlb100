import { useCallback, useEffect, useState } from "react";
import type { BusinessAgreementPrice, BusinessApiCredential, BusinessClient, BusinessWebhookDelivery, BusinessWebhookEventType, BusinessWebhookSubscription, EnterpriseBillSnapshot } from "@xlb/types";
import { BUSINESS_WEBHOOK_EVENT_TYPES } from "@xlb/types";
import { ApiErrorPanel, Button, Card, EmptyState, FormField, Input, ScopeBadge, Select, StatusTag, Table } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import { businessLabel, cityLabel, formatCurrency, formatDateTime, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";

const eventLabels: Record<BusinessWebhookEventType, string> = {
  "order.created": "订单已创建", "order.paid": "订单已支付", "fulfillment.started": "服务已开始", "fulfillment.completed": "服务已完成",
  "fulfillment.evidence.created": "履约凭证已创建", "fulfillment.customer_confirmation.confirmed": "客户已确认履约",
  "fulfillment.customer_confirmation.disputed": "客户对履约有异议", "aftersale.complaint.submitted": "售后投诉已提交", "aftersale.complaint.resolved": "售后投诉已解决",
};

const isActive = (status: string) => status === "active";

export function EnterpriseOpsPage({ initialCityCode }: { initialCityCode?: string }) {
  const online = useOnlineStatus();
  const [cityCode, setCityCode] = useState(initialCityCode || "hangzhou");
  const [clients, setClients] = useState<BusinessClient[]>([]);
  const [selected, setSelected] = useState("");
  const [credentials, setCredentials] = useState<BusinessApiCredential[]>([]);
  const [agreements, setAgreements] = useState<BusinessAgreementPrice[]>([]);
  const [subscriptions, setSubscriptions] = useState<BusinessWebhookSubscription[]>([]);
  const [deliveries, setDeliveries] = useState<BusinessWebhookDelivery[]>([]);
  const [bills, setBills] = useState<EnterpriseBillSnapshot[]>([]);
  const [clientCode, setClientCode] = useState("");
  const [clientName, setClientName] = useState("");
  const [billingMode, setBillingMode] = useState<"single" | "monthly">("single");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [credentialName, setCredentialName] = useState("");
  const [skuId, setSkuId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [revealed, setRevealed] = useState<{ apiKey?: string; signingSecret?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [partial, setPartial] = useState<string | null>(null);
  const now = new Date();
  const [periodStart, setPeriodStart] = useState(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10));

  const fail = (cause: unknown, subject: string) => { const failure = presentFailure(cause, subject); setError({ title: failure.title, detail: failure.detail }); return failure; };
  const loadClients = useCallback(async () => {
    setBusy("clients"); setError(null); setNotice(null);
    try {
      window.history.replaceState({}, "", `#/enterprise?cityCode=${encodeURIComponent(cityCode)}`);
      const result = await api.enterprise.listClients();
      const scoped = result.clients.filter(item => item.cityCode === cityCode);
      setClients(scoped);
      if (!scoped.some(item => item.businessClientId === selected)) setSelected(scoped[0]?.businessClientId ?? "");
    } catch (cause) { const failure = fail(cause, "企业客户列表"); if (failure.kind === "forbidden") { setClients([]); setSelected(""); } }
    finally { setBusy(null); }
  }, [cityCode, selected]);

  const loadDetail = useCallback(async () => {
    if (!selected) { setCredentials([]); setAgreements([]); setSubscriptions([]); setDeliveries([]); setBills([]); return; }
    setBusy("detail"); setError(null); setPartial(null);
    const results = await Promise.allSettled([api.enterprise.listCredentials(selected), api.enterprise.listAgreementPrices(selected), api.enterprise.listWebhookSubscriptions(selected), api.enterprise.listWebhookDeliveries(selected), api.enterprise.listBills(selected)]);
    const missing: string[] = [];
    const [credentialResult, agreementResult, subscriptionResult, deliveryResult, billResult] = results;
    if (credentialResult.status === "fulfilled") setCredentials(credentialResult.value.credentials); else { setCredentials([]); missing.push("接入凭据"); }
    if (agreementResult.status === "fulfilled") setAgreements(agreementResult.value.agreementPrices); else { setAgreements([]); missing.push("协议价格"); }
    if (subscriptionResult.status === "fulfilled") setSubscriptions(subscriptionResult.value.subscriptions); else { setSubscriptions([]); missing.push("事件订阅"); }
    if (deliveryResult.status === "fulfilled") setDeliveries(deliveryResult.value.deliveries); else { setDeliveries([]); missing.push("推送记录"); }
    if (billResult.status === "fulfilled") setBills(billResult.value.bills); else { setBills([]); missing.push("账单快照"); }
    if (missing.length) { const first = results.find(result => result.status === "rejected"); if (first?.status === "rejected") fail(first.reason, missing[0]); setPartial(`${missing.join("、")}暂不可用，其余企业数据仍可查看。`); }
    setBusy(null);
  }, [selected]);

  useEffect(() => { void loadClients(); }, [loadClients]);
  useEffect(() => { void loadDetail(); }, [loadDetail]);

  async function act(name: string, subject: string, fn: () => Promise<void>) {
    if (!online) return;
    setBusy(name); setError(null); setNotice(null);
    try { await fn(); setNotice(`${subject}已由服务端确认完成。`); }
    catch (cause) { fail(cause, subject); }
    finally { setBusy(null); }
  }

  const selectedClient = clients.find(item => item.businessClientId === selected);
  const callbackValid = /^https:\/\//i.test(callbackUrl.trim());
  return <div style={{ display: "grid", gap: 16 }}>
    <Card title="企业客户运营" actions={<><ScopeBadge scope={`城市：${cityLabel(cityCode)}`} /><StatusTag tone={online ? "success" : "danger"}>{online ? "在线" : "离线"}</StatusTag><StatusTag tone="warning">不执行收付款</StatusTag></>}>
      <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><FormField label="城市"><Select value={cityCode} onChange={event => setCityCode(event.target.value)}><option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option></Select></FormField><Button onClick={() => void loadClients()} disabled={!online || busy !== null}>刷新</Button><StatusTag tone="primary">凭据按企业与城市隔离</StatusTag></div>
    </Card>
    {!online && <ApiErrorPanel title="当前网络不可用" detail="企业运营写入已停用。恢复网络并刷新服务端状态后再继续。" />}
    {error && <ApiErrorPanel title={error.title} detail={error.detail} />}{notice && <p role="status">{notice}</p>}{partial && <p role="status">{partial}</p>}
    <Card title="录入企业客户" actions={<StatusTag tone="warning">提交后真实写入</StatusTag>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}><FormField label="客户代码"><Input value={clientCode} onChange={event => setClientCode(event.target.value)} /></FormField><FormField label="法定或展示名称"><Input value={clientName} onChange={event => setClientName(event.target.value)} /></FormField><FormField label="计费模式"><Select value={billingMode} onChange={event => setBillingMode(event.target.value as "single" | "monthly")}><option value="single">逐单结算</option><option value="monthly">月结</option></Select></FormField><FormField label="主要联系人"><Input value={contactName} onChange={event => setContactName(event.target.value)} /></FormField><FormField label="联系电话"><Input value={contactPhone} onChange={event => setContactPhone(event.target.value)} /></FormField></div>
      <div style={{ marginTop: 10 }}><Button variant="primary" disabled={!online || busy !== null || !clientCode.trim() || !clientName.trim() || !contactName.trim() || !contactPhone.trim()} onClick={() => void act("create-client", "创建企业客户", async () => { const result = await api.enterprise.createClient({ clientCode: clientCode.trim(), name: clientName.trim(), billingMode, contactName: contactName.trim(), contactPhone: contactPhone.trim() }); setSelected(result.client.businessClientId); setClientCode(""); setClientName(""); setContactName(""); setContactPhone(""); await loadClients(); })}>创建企业客户</Button></div>
    </Card>
    <Card title="企业客户名录" actions={<StatusTag tone="primary">{clients.length} 家</StatusTag>}>{clients.length === 0 ? <EmptyState title="当前城市没有企业客户" /> : <Table rows={clients} getRowKey={row => row.businessClientId} columns={[{ key: "code", title: "客户代码", render: row => row.clientCode }, { key: "name", title: "名称", render: row => row.name }, { key: "billing", title: "计费", render: row => businessLabel(row.billingMode) }, { key: "status", title: "状态", render: row => <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> }, { key: "open", title: "操作", render: row => <Button onClick={() => setSelected(row.businessClientId)}>管理</Button> }]} />}</Card>
    {selectedClient && <>
      <Card title={`接入凭据 · ${selectedClient.clientCode}`} actions={<StatusTag tone="warning">密钥仅显示一次</StatusTag>}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}><FormField label="凭据名称"><Input value={credentialName} onChange={event => setCredentialName(event.target.value)} /></FormField><Button variant="primary" disabled={!online || busy !== null || !credentialName.trim()} onClick={() => void act("credential", "签发接入凭据", async () => { const result = await api.enterprise.createCredential(selected, { name: credentialName.trim(), scopes: ["enterprise:orders:read", "enterprise:orders:write", "enterprise:webhooks:read", "enterprise:webhooks:write"] }); setRevealed(value => ({ ...value, apiKey: result.apiKey })); setCredentialName(""); await loadDetail(); })}>签发接入密钥</Button><Button disabled={!online || busy !== null} onClick={() => void act("client-status", isActive(selectedClient.status) ? "暂停企业客户" : "启用企业客户", async () => { await api.enterprise.updateClientStatus(selected, isActive(selectedClient.status) ? "suspended" : "active"); await loadClients(); })}>{isActive(selectedClient.status) ? "暂停客户" : "启用客户"}</Button>{revealed.apiKey && <code style={{ overflowWrap: "anywhere" }}>{revealed.apiKey}</code>}</div>
        {credentials.length > 0 && <Table rows={credentials} getRowKey={row => row.credentialId} columns={[{ key: "name", title: "名称", render: row => row.name }, { key: "prefix", title: "密钥前缀", render: row => row.keyPrefix }, { key: "scopes", title: "权限范围", render: row => `${row.scopes.length} 项` }, { key: "status", title: "状态", render: row => statusLabel(row.status) }, { key: "revoke", title: "操作", render: row => <Button disabled={!online || row.status !== "active" || busy !== null} onClick={() => void act(row.credentialId, "撤销接入凭据", async () => { await api.enterprise.revokeCredential(selected, row.credentialId); await loadDetail(); })}>撤销</Button> }]} />}
      </Card>
      <Card title="协议价格"><div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><FormField label="服务项目标识"><Input value={skuId} onChange={event => setSkuId(event.target.value)} /></FormField><FormField label="单价（人民币元）"><Input type="number" min="0.01" step="0.01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} /></FormField><Button variant="primary" disabled={!online || busy !== null || !skuId.trim() || Number(unitPrice) <= 0} onClick={() => void act("price", "保存协议价格", async () => { await api.enterprise.upsertAgreementPrice(selected, { skuId: skuId.trim(), unitPrice: Number(unitPrice), effectiveFrom: new Date().toISOString() }); await loadDetail(); })}>保存协议价格</Button></div>{agreements.length > 0 && <Table rows={agreements} getRowKey={row => row.agreementPriceId} columns={[{ key: "sku", title: "服务项目", render: row => row.skuId }, { key: "price", title: "单价", render: row => formatCurrency(row.unitPrice, row.currency) }, { key: "status", title: "状态", render: row => statusLabel(row.status) }, { key: "effective", title: "生效时间", render: row => formatDateTime(row.effectiveFrom) }]} />}</Card>
      <Card title="事件推送订阅" actions={<StatusTag tone="primary">签名校验</StatusTag>}><div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><FormField label="安全回调地址" description="只接受加密网络地址。"><Input value={callbackUrl} onChange={event => setCallbackUrl(event.target.value)} style={{ minWidth: 300 }} /></FormField><Button variant="primary" disabled={!online || busy !== null || !callbackValid} onClick={() => void act("subscription", "创建事件订阅", async () => { const result = await api.enterprise.createWebhookSubscription(selected, { callbackUrl: callbackUrl.trim(), eventTypes: [...BUSINESS_WEBHOOK_EVENT_TYPES] }); setRevealed(value => ({ ...value, signingSecret: result.signingSecret })); setCallbackUrl(""); await loadDetail(); })}>创建订阅</Button><Button disabled={!online || busy !== null} onClick={() => void act("run", "执行待处理推送", async () => { await api.enterprise.runWebhooks(); await loadDetail(); })}>执行待处理推送</Button></div>{callbackUrl && !callbackValid && <p role="alert">回调地址必须使用加密网络协议。</p>}{revealed.signingSecret && <p><strong>签名密钥：</strong> <code>{revealed.signingSecret}</code></p>}{subscriptions.length > 0 && <Table rows={subscriptions} getRowKey={row => row.subscriptionId} columns={[{ key: "url", title: "回调地址", render: row => row.callbackUrl }, { key: "events", title: "事件范围", render: row => `${row.eventTypes.length} 类` }, { key: "secret", title: "密钥尾号", render: row => `••••${row.signingSecretLast4}` }, { key: "status", title: "状态", render: row => statusLabel(row.status) }, { key: "toggle", title: "操作", render: row => <Button disabled={!online || busy !== null} onClick={() => void act(row.subscriptionId, isActive(row.status) ? "暂停事件订阅" : "启用事件订阅", async () => { await api.enterprise.updateWebhookSubscriptionStatus(selected, row.subscriptionId, isActive(row.status) ? "paused" : "active"); await loadDetail(); })}>{isActive(row.status) ? "暂停" : "启用"}</Button> }]} />}</Card>
      <Card title="推送记录" actions={<StatusTag tone="primary">可重试且幂等</StatusTag>}>{deliveries.length === 0 ? <EmptyState title="当前没有推送记录" /> : <Table rows={deliveries} getRowKey={row => row.deliveryId} columns={[{ key: "event", title: "事件", render: row => eventLabels[row.eventType] }, { key: "status", title: "状态", render: row => <StatusTag tone={statusTone(row.status)}>{statusLabel(row.status)}</StatusTag> }, { key: "attempt", title: "尝试次数", render: row => `${row.attemptCount}/${row.maxAttempts}` }, { key: "provider", title: "外部执行", render: row => row.providerEnvelope ? (row.providerEnvelope.externalProviderExecuted ? "已执行" : "未执行") : "尚未尝试" }, { key: "retry", title: "操作", render: row => <Button disabled={!online || !["retry_wait", "dead_letter"].includes(row.status) || busy !== null} onClick={() => void act(row.deliveryId, "重试事件推送", async () => { await api.enterprise.retryWebhookDelivery(selected, row.deliveryId); await api.enterprise.runWebhooks(); await loadDetail(); })}>重试</Button> }]} />}</Card>
      <Card title="月结账单快照" actions={<StatusTag tone="warning">仅生成账单，不执行收款</StatusTag>}><div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}><FormField label="周期开始"><Input type="date" value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></FormField><FormField label="周期结束"><Input type="date" value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></FormField><Button variant="primary" disabled={!online || busy !== null || selectedClient.billingMode !== "monthly" || !periodStart || !periodEnd || periodStart >= periodEnd} onClick={() => void act("bill", "创建月结账单快照", async () => { await api.enterprise.createBill(selected, { periodStart: new Date(`${periodStart}T00:00:00Z`).toISOString(), periodEnd: new Date(`${periodEnd}T00:00:00Z`).toISOString() }); await loadDetail(); })}>创建快照</Button></div>{bills.length > 0 && <Table rows={bills} getRowKey={row => row.billId} columns={[{ key: "period", title: "周期", render: row => `${row.periodStart.slice(0, 10)} 至 ${row.periodEnd.slice(0, 10)}` }, { key: "orders", title: "订单数", render: row => row.orderCount }, { key: "total", title: "总额", render: row => formatCurrency(row.totalAmount, row.currency) }, { key: "status", title: "状态", render: row => statusLabel(row.status) }, { key: "issue", title: "操作", render: row => <Button disabled={!online || row.status !== "draft" || busy !== null} onClick={() => void act(row.billId, "签发账单", async () => { await api.enterprise.issueBill(selected, row.billId); await loadDetail(); })}>签发</Button> }]} />}</Card>
    </>}
  </div>;
}
