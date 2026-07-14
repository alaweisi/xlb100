import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  ChangeCouponDefinitionStatusRequest,
  ChangeMarketingCampaignStatusRequest,
  CouponDefinition,
  CouponDefinitionListResponse,
  CouponDefinitionResponse,
  CouponGrant,
  CouponGrantResponse,
  CreateCouponDefinitionRequest,
  CreateMarketingCampaignRequest,
  CreateMarketingRuleRevisionRequest,
  GrantCouponRequest,
  MarketingCampaign,
  MarketingCampaignListResponse,
  MarketingCampaignResponse,
  MarketingRuleRevision,
  MarketingRuleRevisionListResponse,
  MarketingRuleRevisionResponse,
  PublishMarketingRuleRevisionRequest,
  ReviewMarketingCampaignRequest,
  ReviewMarketingRuleRevisionRequest,
  RevokeCouponGrantRequest,
  ScheduleMarketingCampaignRequest,
} from "@xlb/types";
import {
  formatMarketingMoney,
  marketingErrorMessage,
  sortCouponDefinitions,
  sortCouponGrants,
  sortMarketingCampaigns,
} from "../adapters/marketingAdapter";
import "./marketing-operations.css";

type Tab = "campaigns" | "rules" | "definitions" | "grants";
type AdminMarketingRole = "admin" | "operator" | "auditor";

export interface MarketingOperationsApi {
  listCampaigns(): Promise<MarketingCampaignListResponse>;
  createCampaign(body: CreateMarketingCampaignRequest): Promise<MarketingCampaignResponse>;
  reviewCampaign(id: string, body: ReviewMarketingCampaignRequest): Promise<MarketingCampaignResponse>;
  scheduleCampaign(id: string, body: ScheduleMarketingCampaignRequest): Promise<MarketingCampaignResponse>;
  changeCampaignStatus(id: string, body: ChangeMarketingCampaignStatusRequest): Promise<MarketingCampaignResponse>;
  listRuleRevisions(campaignId: string): Promise<MarketingRuleRevisionListResponse>;
  createRuleRevision(campaignId: string, body: CreateMarketingRuleRevisionRequest): Promise<MarketingRuleRevisionResponse>;
  reviewRuleRevision(id: string, body: ReviewMarketingRuleRevisionRequest): Promise<MarketingRuleRevisionResponse>;
  publishRuleRevision(id: string, body: PublishMarketingRuleRevisionRequest): Promise<MarketingRuleRevisionResponse>;
  listCouponDefinitions(): Promise<CouponDefinitionListResponse>;
  createCouponDefinition(body: CreateCouponDefinitionRequest): Promise<CouponDefinitionResponse>;
  changeCouponDefinitionStatus(id: string, body: ChangeCouponDefinitionStatusRequest): Promise<CouponDefinitionResponse>;
  grantCoupon(body: GrantCouponRequest): Promise<CouponGrantResponse>;
  revokeCouponGrant(id: string, body: RevokeCouponGrantRequest): Promise<CouponGrantResponse>;
}

export interface MarketingOperationsPageProps {
  api: MarketingOperationsApi;
  initialCityCode: string;
  role?: AdminMarketingRole;
}

function commandKey(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function toUtc(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) throw new Error("请输入有效时间");
  return timestamp.toISOString();
}

export function MarketingOperationsPage({ api, initialCityCode, role = "auditor" }: MarketingOperationsPageProps) {
  const [tab, setTab] = useState<Tab>("campaigns");
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [definitions, setDefinitions] = useState<CouponDefinition[]>([]);
  const [ruleRevisions, setRuleRevisions] = useState<MarketingRuleRevision[]>([]);
  const [grants, setGrants] = useState<CouponGrant[]>([]);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scheduleRevision, setScheduleRevision] = useState<Record<string, string>>({});
  const [ruleCampaignId, setRuleCampaignId] = useState("");
  const [ruleCampaignInput, setRuleCampaignInput] = useState("");

  const canOperate = role === "admin" || role === "operator";
  const canAdminMutate = role === "admin";

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      if (tab === "campaigns") {
        const loadedCampaigns = sortMarketingCampaigns((await api.listCampaigns()).campaigns);
        setCampaigns(loadedCampaigns);
        if (canAdminMutate) {
          const schedulableCampaigns = loadedCampaigns.filter((campaign) => campaign.status === "reviewed");
          const revisionResponses = await Promise.all(
            schedulableCampaigns.map((campaign) => api.listRuleRevisions(campaign.marketingCampaignId)),
          );
          setRuleRevisions(
            revisionResponses.flatMap((response) => response.ruleRevisions)
              .filter((revision) => revision.status === "published"),
          );
        }
      }
      if (tab === "rules") {
        if (!ruleCampaignId.trim()) setRuleRevisions([]);
        else setRuleRevisions((await api.listRuleRevisions(ruleCampaignId.trim())).ruleRevisions);
      }
      if (tab === "definitions") setDefinitions(sortCouponDefinitions((await api.listCouponDefinitions()).couponDefinitions));
      if (tab === "grants") setGrants((current) => sortCouponGrants(current));
      setState("success");
    } catch (cause) {
      setError(marketingErrorMessage(cause));
      setState("error");
    }
  }, [api, canAdminMutate, ruleCampaignId, tab]);

  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (id: string, command: () => Promise<unknown>) => {
    if (!reason.trim()) { setError("执行状态变更前必须填写审计原因"); return; }
    setBusyId(id); setError("");
    try { await command(); await load(); }
    catch (cause) { setError(marketingErrorMessage(cause)); }
    finally { setBusyId(null); }
  }, [load, reason]);

  const tabLabel = useMemo(() => tab === "campaigns" ? "活动" : tab === "rules" ? "规则修订" : tab === "definitions" ? "券定义" : "发放", [tab]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusyId("new-campaign"); setError("");
    try {
      await api.createCampaign({
        name: String(data.get("name") ?? "").trim(),
        startAt: toUtc(String(data.get("startAt") ?? "")),
        endAt: toUtc(String(data.get("endAt") ?? "")),
        idempotencyKey: commandKey("marketing-campaign"),
      });
      event.currentTarget.reset(); await load();
    } catch (cause) { setError(marketingErrorMessage(cause)); }
    finally { setBusyId(null); }
  }

  async function createDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusyId("new-definition"); setError("");
    try {
      await api.createCouponDefinition({
        marketingCampaignId: String(data.get("campaignId") ?? "").trim(),
        ruleRevisionId: String(data.get("ruleRevisionId") ?? "").trim(),
        name: String(data.get("name") ?? "").trim(),
        allowedSkuIds: String(data.get("skuIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
        currency: "CNY",
        faceValueMinor: Number(data.get("faceValueMinor")),
        minSpendMinor: Number(data.get("minSpendMinor")),
        issuanceCap: Number(data.get("issuanceCap")),
        compensationCap: Number(data.get("compensationCap")),
        validFrom: toUtc(String(data.get("validFrom") ?? "")),
        validUntil: toUtc(String(data.get("validUntil") ?? "")),
        idempotencyKey: commandKey("coupon-definition"),
      });
      event.currentTarget.reset(); await load();
    } catch (cause) { setError(marketingErrorMessage(cause)); }
    finally { setBusyId(null); }
  }

  async function createRuleRevision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const campaignId = String(data.get("campaignId") ?? "").trim();
    setBusyId("new-rule-revision"); setError("");
    try {
      const response = await api.createRuleRevision(campaignId, {
        allowedSkuIds: String(data.get("skuIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
        idempotencyKey: commandKey("marketing-rule"),
      });
      setRuleCampaignId(campaignId);
      setRuleCampaignInput(campaignId);
      setRuleRevisions((current) => [response.ruleRevision, ...current.filter((item) => item.ruleRevisionId !== response.ruleRevision.ruleRevisionId)]);
      setState("success");
    } catch (cause) { setError(marketingErrorMessage(cause)); }
    finally { setBusyId(null); }
  }

  async function grantCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusyId("new-grant"); setError("");
    try {
      const response = await api.grantCoupon({
        couponDefinitionId: String(data.get("couponDefinitionId") ?? "").trim(),
        customerId: String(data.get("customerId") ?? "").trim(),
        issuanceReason: "admin_manual",
        issuanceRef: String(data.get("issuanceRef") ?? "").trim(),
        expiresAt: toUtc(String(data.get("expiresAt") ?? "")),
        reason: String(data.get("reason") ?? "").trim(),
        idempotencyKey: commandKey("coupon-grant"),
      });
      setGrants((current) => sortCouponGrants([
        response.couponGrant,
        ...current.filter((item) => item.couponGrantId !== response.couponGrant.couponGrantId),
      ]));
      event.currentTarget.reset(); setState("success");
    } catch (cause) { setError(marketingErrorMessage(cause)); }
    finally { setBusyId(null); }
  }

  return (
    <main className="marketing-operations" aria-labelledby="marketing-operations-title">
      <header>
        <h1 id="marketing-operations-title">Marketing / Coupon</h1>
        <p className="marketing-operations__muted">城市：{initialCityCode} · 角色：{role} · 金额单位：人民币分</p>
      </header>
      <div className="marketing-operations__tabs" role="tablist" aria-label="Marketing operations">
        {(["campaigns", "rules", "definitions", "grants"] as Tab[]).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
            {value === "campaigns" ? "活动" : value === "rules" ? "规则修订" : value === "definitions" ? "券定义" : "发放"}
          </button>
        ))}
      </div>
      <div className="marketing-operations__toolbar">
        <strong>{tabLabel}</strong>
        <button type="button" onClick={() => void load()} disabled={state === "loading"}>刷新</button>
        {canAdminMutate && <label>审计原因 <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>}
      </div>
      {error && <p role="alert" className="marketing-operations__error">{error}</p>}
      {state === "loading" && <p role="status">正在读取 Marketing 数据…</p>}

      {tab === "campaigns" && <section className="marketing-operations__panel" aria-label="活动管理">
        {canOperate && <form onSubmit={createCampaign} className="marketing-operations__actions">
          <input name="name" required maxLength={120} placeholder="活动名称" aria-label="活动名称" />
          <label>开始 <input name="startAt" type="datetime-local" required /></label>
          <label>结束 <input name="endAt" type="datetime-local" required /></label>
          <button type="submit" disabled={busyId !== null}>创建草稿</button>
        </form>}
        {state === "success" && campaigns.length === 0 && <p>当前城市没有活动记录</p>}
        <ul className="marketing-operations__list">
          {campaigns.map((item) => <li className="marketing-operations__row" key={item.marketingCampaignId}>
            <strong>{item.name}</strong><span>{item.status} · v{item.version}</span><span>{item.marketingCampaignId}</span>
            {canAdminMutate && <div className="marketing-operations__actions">
              {item.status === "draft" && <button type="button" disabled={busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.reviewCampaign(item.marketingCampaignId, { expectedVersion: item.version, reason }))}>审核</button>}
              {item.status === "reviewed" && <><select aria-label={`${item.name} 已发布规则修订`} value={scheduleRevision[item.marketingCampaignId] ?? ""} onChange={(event) => setScheduleRevision((current) => ({ ...current, [item.marketingCampaignId]: event.target.value }))}><option value="">选择已发布规则</option>{ruleRevisions.filter((revision) => revision.marketingCampaignId === item.marketingCampaignId && revision.status === "published").map((revision) => <option key={revision.ruleRevisionId} value={revision.ruleRevisionId}>{revision.ruleRevisionId}</option>)}</select><button type="button" disabled={busyId !== null || !scheduleRevision[item.marketingCampaignId]} onClick={() => void run(item.marketingCampaignId, () => api.scheduleCampaign(item.marketingCampaignId, { ruleRevisionId: scheduleRevision[item.marketingCampaignId], expectedVersion: item.version, reason }))}>排期</button></>}
              {(item.status === "scheduled" || item.status === "paused") && <button type="button" disabled={busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.changeCampaignStatus(item.marketingCampaignId, { status: "active", expectedVersion: item.version, reason }))}>启用</button>}
              {item.status === "active" && <button type="button" disabled={busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.changeCampaignStatus(item.marketingCampaignId, { status: "paused", expectedVersion: item.version, reason }))}>暂停</button>}
              {(item.status === "active" || item.status === "paused") && <button type="button" disabled={busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.changeCampaignStatus(item.marketingCampaignId, { status: "ended", expectedVersion: item.version, reason }))}>结束</button>}
            </div>}
          </li>)}
        </ul>
      </section>}

      {tab === "rules" && <section className="marketing-operations__panel" aria-label="规则修订管理">
        <div className="marketing-operations__actions">
          <label>活动标识 <input value={ruleCampaignInput} onChange={(event) => setRuleCampaignInput(event.target.value)} /></label>
          <button type="button" onClick={() => setRuleCampaignId(ruleCampaignInput.trim())} disabled={!ruleCampaignInput.trim() || state === "loading"}>读取规则</button>
        </div>
        {canOperate && <form onSubmit={createRuleRevision} className="marketing-operations__actions">
          <input name="campaignId" required placeholder="活动标识" aria-label="规则所属活动标识" />
          <input name="skuIds" required placeholder="SKU 标识，逗号分隔" aria-label="规则适用 SKU" />
          <button type="submit" disabled={busyId !== null}>创建规则草稿</button>
        </form>}
        {state === "success" && ruleRevisions.length === 0 && <p>{ruleCampaignId ? "该活动没有规则修订" : "输入活动标识后读取规则修订"}</p>}
        <ul className="marketing-operations__list">{ruleRevisions.map((item) => <li className="marketing-operations__row" key={item.ruleRevisionId}>
          <strong>{item.ruleRevisionId}</strong><span>{item.status} · revision {item.revision}</span><span>SKU：{item.allowedSkuIds.join(", ")}</span>
          {canAdminMutate && <div className="marketing-operations__actions">
            {item.status === "draft" && <button type="button" disabled={busyId !== null} onClick={() => void run(item.ruleRevisionId, () => api.reviewRuleRevision(item.ruleRevisionId, { expectedVersion: item.version, reason }))}>审核规则</button>}
            {item.status === "reviewed" && <button type="button" disabled={busyId !== null} onClick={() => void run(item.ruleRevisionId, () => api.publishRuleRevision(item.ruleRevisionId, { expectedVersion: item.version, reason }))}>发布规则</button>}
          </div>}
        </li>)}</ul>
      </section>}

      {tab === "definitions" && <section className="marketing-operations__panel" aria-label="券定义管理">
        {canOperate && <form onSubmit={createDefinition} className="marketing-operations__actions">
          <input name="campaignId" required placeholder="活动标识" aria-label="活动标识" />
          <input name="ruleRevisionId" required placeholder="规则修订标识" aria-label="规则修订标识" />
          <input name="name" required maxLength={120} placeholder="券名称" aria-label="券名称" />
          <input name="skuIds" required placeholder="SKU 标识，逗号分隔" aria-label="适用 SKU" />
          <input name="faceValueMinor" required type="number" min="1" step="1" placeholder="面值（分）" aria-label="面值（分）" />
          <input name="minSpendMinor" required type="number" min="2" step="1" placeholder="门槛（分）" aria-label="门槛（分）" />
          <input name="issuanceCap" required type="number" min="1" step="1" placeholder="发放上限" aria-label="发放上限" />
          <input name="compensationCap" required type="number" min="1" step="1" placeholder="补偿发放上限" aria-label="补偿发放上限" />
          <label>生效 <input name="validFrom" type="datetime-local" required /></label>
          <label>失效 <input name="validUntil" type="datetime-local" required /></label>
          <button type="submit" disabled={busyId !== null}>创建券定义</button>
        </form>}
        {state === "success" && definitions.length === 0 && <p>当前城市没有券定义</p>}
        <ul className="marketing-operations__list">{definitions.map((item) => <li className="marketing-operations__row" key={item.couponDefinitionId}>
          <strong>{item.name}</strong><span className="marketing-operations__money">{formatMarketingMoney(item.faceValueMinor, item.currency)}</span><span>{item.status} · 常规 {item.issuedCount}/{item.issuanceCap} · 补偿 {item.compensationIssuedCount}/{item.compensationCap} · v{item.version}</span>
          {canAdminMutate && <div className="marketing-operations__actions">
            {item.status === "draft" && <button type="button" disabled={busyId !== null} onClick={() => void run(item.couponDefinitionId, () => api.changeCouponDefinitionStatus(item.couponDefinitionId, { status: "active", expectedVersion: item.version, reason }))}>启用</button>}
            {item.status === "active" && <button type="button" disabled={busyId !== null} onClick={() => void run(item.couponDefinitionId, () => api.changeCouponDefinitionStatus(item.couponDefinitionId, { status: "suspended", expectedVersion: item.version, reason }))}>暂停</button>}
            {!(["expired", "retired"] as string[]).includes(item.status) && <button type="button" disabled={busyId !== null} onClick={() => void run(item.couponDefinitionId, () => api.changeCouponDefinitionStatus(item.couponDefinitionId, { status: "retired", expectedVersion: item.version, reason }))}>退役</button>}
          </div>}
        </li>)}</ul>
      </section>}

      {tab === "grants" && <section className="marketing-operations__panel" aria-label="优惠券发放">
        {canAdminMutate && <form onSubmit={grantCoupon} className="marketing-operations__actions">
          <input name="couponDefinitionId" required placeholder="券定义标识" aria-label="券定义标识" />
          <input name="customerId" required placeholder="客户标识" aria-label="客户标识" />
          <input name="issuanceRef" required placeholder="发放依据标识" aria-label="发放依据标识" />
          <label>失效 <input name="expiresAt" type="datetime-local" required /></label>
          <input name="reason" required maxLength={500} placeholder="发放原因" aria-label="发放原因" />
          <button type="submit" disabled={busyId !== null}>发放</button>
        </form>}
        {state === "success" && grants.length === 0 && <p>本次会话尚未发放优惠券；当前契约未开放 Admin 发放列表接口。</p>}
        <ul className="marketing-operations__list">{grants.map((item) => <li className="marketing-operations__row" key={item.couponGrantId}>
          <strong>{item.couponGrantId}</strong><span>{item.status} · customer {item.customerId} · v{item.version}</span><span>到期：{item.expiresAt}</span>
          {canAdminMutate && ["granted", "available", "released"].includes(item.status) && <button type="button" disabled={busyId !== null} onClick={() => void run(item.couponGrantId, () => api.revokeCouponGrant(item.couponGrantId, { expectedVersion: item.version, reason }))}>撤销</button>}
        </li>)}</ul>
      </section>}
    </main>
  );
}
