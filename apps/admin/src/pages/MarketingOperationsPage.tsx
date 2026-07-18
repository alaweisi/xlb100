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
import { businessLabel, cityLabel, formatDateTime, statusLabel, useOnlineStatus } from "../operationsPresentation";
import "./marketing-operations.css";

type Tab = "campaigns" | "rules" | "definitions" | "grants";
type AdminMarketingRole = "admin" | "operator" | "auditor";

const TAB_CAMPAIGNS: Tab = "campaigns";
const TAB_RULES: Tab = "rules";
const TAB_DEFINITIONS: Tab = "definitions";
const TAB_GRANTS: Tab = "grants";
const MARKETING_TABS: Tab[] = [TAB_CAMPAIGNS, TAB_RULES, TAB_DEFINITIONS, TAB_GRANTS];
const STATE_LOADING = "loading";
const STATE_SUCCESS = "success";
const isDraft = (status: string) => status === "draft";
const isReviewed = (status: string) => status === "reviewed";
const isActive = (status: string) => status === "active";
const canStartCampaign = (status: string) => status === "scheduled" || status === "paused";
const canEndCampaign = (status: string) => status === "active" || status === "paused";
const canRevokeGrant = (status: string) => ["granted", "available", "released"].includes(status);

function tabName(tab: Tab): string {
  if (tab === TAB_CAMPAIGNS) return "活动";
  if (tab === TAB_RULES) return "规则修订";
  if (tab === TAB_DEFINITIONS) return "券定义";
  return "发放";
}

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
  const online = useOnlineStatus();
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
          const revisionResponses = await Promise.allSettled(
            schedulableCampaigns.map((campaign) => api.listRuleRevisions(campaign.marketingCampaignId)),
          );
          setRuleRevisions(
            revisionResponses.flatMap((response) => response.status === "fulfilled" ? response.value.ruleRevisions : [])
              .filter((revision) => revision.status === "published"),
          );
          if (revisionResponses.some((response) => response.status === "rejected")) setError("部分活动的已发布规则暂不可用；活动列表仍为服务端最新结果。");
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
    if (!online) { setError("当前网络不可用，状态变更已停用"); return; }
    if (!reason.trim()) { setError("执行状态变更前必须填写审计原因"); return; }
    setBusyId(id); setError("");
    try { await command(); await load(); }
    catch (cause) { setError(marketingErrorMessage(cause)); }
    finally { setBusyId(null); }
  }, [load, online, reason]);

  const tabLabel = useMemo(() => tabName(tab), [tab]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online) return;
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
    if (!online) return;
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
    if (!online) return;
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
    if (!online) return;
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
        <h1 id="marketing-operations-title">营销活动与优惠券</h1>
        <p className="marketing-operations__muted">城市：{cityLabel(initialCityCode)} · 角色：{businessLabel(role)} · 金额单位：人民币分 · {online ? "在线" : "离线"}</p>
      </header>
      <div className="marketing-operations__tabs" role="tablist" aria-label="营销运营工作台">
        {MARKETING_TABS.map((value) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>
            {tabName(value)}
          </button>
        ))}
      </div>
      <div className="marketing-operations__toolbar">
        <strong>{tabLabel}</strong>
        <button type="button" onClick={() => void load()} disabled={!online || state === STATE_LOADING}>刷新</button>
        {canAdminMutate && <label>审计原因 <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></label>}
      </div>
      {error && <p role="alert" className="marketing-operations__error">{error}</p>}
      {!online && <p role="alert" className="marketing-operations__error">当前网络不可用，营销写入已停用。恢复网络并刷新后再继续。</p>}
      {state === STATE_LOADING && <p role="status">正在读取营销数据…</p>}

      {tab === TAB_CAMPAIGNS && <section className="marketing-operations__panel" aria-label="活动管理">
        {canOperate && <form onSubmit={createCampaign} className="marketing-operations__actions">
          <input name="name" required maxLength={120} placeholder="活动名称" aria-label="活动名称" />
          <label>开始 <input name="startAt" type="datetime-local" required /></label>
          <label>结束 <input name="endAt" type="datetime-local" required /></label>
          <button type="submit" disabled={!online || busyId !== null}>创建草稿</button>
        </form>}
        {state === STATE_SUCCESS && campaigns.length === 0 && <p>当前城市没有活动记录</p>}
        <ul className="marketing-operations__list">
          {campaigns.map((item) => <li className="marketing-operations__row" key={item.marketingCampaignId}>
            <strong>{item.name}</strong><span>{statusLabel(item.status)} · 版本 {item.version}</span><span>{item.marketingCampaignId}</span>
            {canAdminMutate && <div className="marketing-operations__actions">
              {isDraft(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.reviewCampaign(item.marketingCampaignId, { expectedVersion: item.version, reason }))}>审核</button>}
              {isReviewed(item.status) && <><select aria-label={`${item.name} 已发布规则修订`} value={scheduleRevision[item.marketingCampaignId] ?? ""} onChange={(event) => setScheduleRevision((current) => ({ ...current, [item.marketingCampaignId]: event.target.value }))}><option value="">选择已发布规则</option>{ruleRevisions.filter((revision) => revision.marketingCampaignId === item.marketingCampaignId && revision.status === "published").map((revision) => <option key={revision.ruleRevisionId} value={revision.ruleRevisionId}>{revision.ruleRevisionId}</option>)}</select><button type="button" disabled={!online || busyId !== null || !scheduleRevision[item.marketingCampaignId]} onClick={() => void run(item.marketingCampaignId, () => api.scheduleCampaign(item.marketingCampaignId, { ruleRevisionId: scheduleRevision[item.marketingCampaignId], expectedVersion: item.version, reason }))}>排期</button></>}
              {canStartCampaign(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.changeCampaignStatus(item.marketingCampaignId, { status: "active", expectedVersion: item.version, reason }))}>启用</button>}
              {isActive(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.changeCampaignStatus(item.marketingCampaignId, { status: "paused", expectedVersion: item.version, reason }))}>暂停</button>}
              {canEndCampaign(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.marketingCampaignId, () => api.changeCampaignStatus(item.marketingCampaignId, { status: "ended", expectedVersion: item.version, reason }))}>结束</button>}
            </div>}
          </li>)}
        </ul>
      </section>}

      {tab === TAB_RULES && <section className="marketing-operations__panel" aria-label="规则修订管理">
        <div className="marketing-operations__actions">
          <label>活动标识 <input value={ruleCampaignInput} onChange={(event) => setRuleCampaignInput(event.target.value)} /></label>
          <button type="button" onClick={() => setRuleCampaignId(ruleCampaignInput.trim())} disabled={!online || !ruleCampaignInput.trim() || state === STATE_LOADING}>读取规则</button>
        </div>
        {canOperate && <form onSubmit={createRuleRevision} className="marketing-operations__actions">
          <input name="campaignId" required placeholder="活动标识" aria-label="规则所属活动标识" />
          <input name="skuIds" required placeholder="服务项目标识，逗号分隔" aria-label="规则适用服务项目" />
          <button type="submit" disabled={!online || busyId !== null}>创建规则草稿</button>
        </form>}
        {state === STATE_SUCCESS && ruleRevisions.length === 0 && <p>{ruleCampaignId ? "该活动没有规则修订" : "输入活动标识后读取规则修订"}</p>}
        <ul className="marketing-operations__list">{ruleRevisions.map((item) => <li className="marketing-operations__row" key={item.ruleRevisionId}>
          <strong>{item.ruleRevisionId}</strong><span>{statusLabel(item.status)} · 修订 {item.revision}</span><span>服务项目：{item.allowedSkuIds.join("、")}</span>
          {canAdminMutate && <div className="marketing-operations__actions">
            {isDraft(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.ruleRevisionId, () => api.reviewRuleRevision(item.ruleRevisionId, { expectedVersion: item.version, reason }))}>审核规则</button>}
            {isReviewed(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.ruleRevisionId, () => api.publishRuleRevision(item.ruleRevisionId, { expectedVersion: item.version, reason }))}>发布规则</button>}
          </div>}
        </li>)}</ul>
      </section>}

      {tab === TAB_DEFINITIONS && <section className="marketing-operations__panel" aria-label="券定义管理">
        {canOperate && <form onSubmit={createDefinition} className="marketing-operations__actions">
          <input name="campaignId" required placeholder="活动标识" aria-label="活动标识" />
          <input name="ruleRevisionId" required placeholder="规则修订标识" aria-label="规则修订标识" />
          <input name="name" required maxLength={120} placeholder="券名称" aria-label="券名称" />
          <input name="skuIds" required placeholder="服务项目标识，逗号分隔" aria-label="适用服务项目" />
          <input name="faceValueMinor" required type="number" min="1" step="1" placeholder="面值（分）" aria-label="面值（分）" />
          <input name="minSpendMinor" required type="number" min="2" step="1" placeholder="门槛（分）" aria-label="门槛（分）" />
          <input name="issuanceCap" required type="number" min="1" step="1" placeholder="发放上限" aria-label="发放上限" />
          <input name="compensationCap" required type="number" min="1" step="1" placeholder="补偿发放上限" aria-label="补偿发放上限" />
          <label>生效 <input name="validFrom" type="datetime-local" required /></label>
          <label>失效 <input name="validUntil" type="datetime-local" required /></label>
          <button type="submit" disabled={!online || busyId !== null}>创建券定义</button>
        </form>}
        {state === STATE_SUCCESS && definitions.length === 0 && <p>当前城市没有券定义</p>}
        <ul className="marketing-operations__list">{definitions.map((item) => <li className="marketing-operations__row" key={item.couponDefinitionId}>
          <strong>{item.name}</strong><span className="marketing-operations__money">{formatMarketingMoney(item.faceValueMinor, item.currency)}</span><span>{statusLabel(item.status)} · 常规 {item.issuedCount}/{item.issuanceCap} · 补偿 {item.compensationIssuedCount}/{item.compensationCap} · 版本 {item.version}</span>
          {canAdminMutate && <div className="marketing-operations__actions">
            {isDraft(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.couponDefinitionId, () => api.changeCouponDefinitionStatus(item.couponDefinitionId, { status: "active", expectedVersion: item.version, reason }))}>启用</button>}
            {isActive(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.couponDefinitionId, () => api.changeCouponDefinitionStatus(item.couponDefinitionId, { status: "suspended", expectedVersion: item.version, reason }))}>暂停</button>}
            {!(["expired", "retired"] as string[]).includes(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.couponDefinitionId, () => api.changeCouponDefinitionStatus(item.couponDefinitionId, { status: "retired", expectedVersion: item.version, reason }))}>退役</button>}
          </div>}
        </li>)}</ul>
      </section>}

      {tab === TAB_GRANTS && <section className="marketing-operations__panel" aria-label="优惠券发放">
        {canAdminMutate && <form onSubmit={grantCoupon} className="marketing-operations__actions">
          <input name="couponDefinitionId" required placeholder="券定义标识" aria-label="券定义标识" />
          <input name="customerId" required placeholder="客户标识" aria-label="客户标识" />
          <input name="issuanceRef" required placeholder="发放依据标识" aria-label="发放依据标识" />
          <label>失效 <input name="expiresAt" type="datetime-local" required /></label>
          <input name="reason" required maxLength={500} placeholder="发放原因" aria-label="发放原因" />
          <button type="submit" disabled={!online || busyId !== null}>发放</button>
        </form>}
        {state === STATE_SUCCESS && grants.length === 0 && <p>本次会话尚未发放优惠券；当前契约未开放后台发放列表接口。</p>}
        <ul className="marketing-operations__list">{grants.map((item) => <li className="marketing-operations__row" key={item.couponGrantId}>
          <strong>{item.couponGrantId}</strong><span>{statusLabel(item.status)} · 客户 {item.customerId} · 版本 {item.version}</span><span>到期：{formatDateTime(item.expiresAt)}</span>
          {canAdminMutate && canRevokeGrant(item.status) && <button type="button" disabled={!online || busyId !== null} onClick={() => void run(item.couponGrantId, () => api.revokeCouponGrant(item.couponGrantId, { expectedVersion: item.version, reason }))}>撤销</button>}
        </li>)}</ul>
      </section>}
    </main>
  );
}
