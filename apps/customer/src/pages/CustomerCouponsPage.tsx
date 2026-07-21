import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  ClockCountdown,
  SealCheck,
  Tag,
  Ticket,
  XCircle,
} from "@phosphor-icons/react";
import type { CouponGrant, CouponGrantListResponse } from "@xlb/types";
import { Button, EmptyState, ErrorState, LoadingState, StateBadge, Tabs } from "@xlb/ui";
import { sortCustomerCouponGrants, toCustomerCouponGrantViewModel } from "../adapters/marketingAdapter";
import { describeCustomerAppError, type CustomerAppFailure } from "./customerPageShell";
import "./customer-coupons.css";

type CouponView = "available" | "all";

export interface CustomerCouponsPageApi {
  listCouponGrants(query?: { status?: "available" }): Promise<CouponGrantListResponse>;
}

export interface CustomerCouponsPageProps {
  api: CustomerCouponsPageApi;
  onSelectForQuote?: (couponGrantId: string) => void;
}

export function CustomerCouponsPage({ api, onSelectForQuote }: CustomerCouponsPageProps) {
  const [view, setView] = useState<CouponView>("available");
  const [items, setItems] = useState<CouponGrant[]>([]);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [failure, setFailure] = useState<CustomerAppFailure | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setFailure(null);
    try {
      const response = await api.listCouponGrants(view === "available" ? { status: "available" } : undefined);
      setItems(sortCustomerCouponGrants(response.couponGrants));
      setState("success");
    } catch (cause) {
      setFailure(describeCustomerAppError(cause));
      setState("error");
    }
  }, [api, view]);

  useEffect(() => { void load(); }, [load]);

  const viewModels = useMemo(() => {
    const now = new Date();
    return items.map((item) => toCustomerCouponGrantViewModel(item, now));
  }, [items]);
  const selectableCount = viewModels.filter((item) => item.canSelectForQuote).length;

  const selectForQuote = (couponGrantId: string) => {
    if (!onSelectForQuote || selectingId) return;
    setSelectingId(couponGrantId);
    onSelectForQuote(couponGrantId);
  };

  return (
    <main className="customer-coupons" aria-labelledby="customer-coupons-title">
      <header className="customer-coupons__header">
        <div className="customer-coupons__heading">
          <span className="customer-coupons__eyebrow"><Ticket aria-hidden="true" weight="fill" />喜乐帮权益</span>
          <h1 id="customer-coupons-title">我的优惠券</h1>
          <p>选择可用权益，进入下单页确认最终报价。</p>
        </div>
        <div className="customer-coupons__assurance">
          <SealCheck aria-hidden="true" weight="fill" />
          <span><strong>价格透明</strong>优惠结果以服务端报价为准</span>
        </div>
      </header>

      <section aria-label="优惠券筛选" className="customer-coupons__toolbar">
        <Tabs
          activeKey={view}
          aria-label="优惠券范围"
          items={[
            { key: "available", label: "可使用" },
            { key: "all", label: "全部记录" },
          ]}
          onChange={(key) => setView(key as CouponView)}
          productRole="customer"
        />
        {state === "success" && viewModels.length > 0 ? (
          <p
            aria-live="polite"
            className={`customer-coupons__summary${selectableCount === 0 ? " customer-coupons__summary--muted" : ""}`}
          >
            {selectableCount > 0
              ? <CheckCircle aria-hidden="true" weight="fill" />
              : <ClockCountdown aria-hidden="true" weight="fill" />}
            {selectableCount > 0 ? `${selectableCount} 张现在可用于报价` : "当前记录暂无可用优惠券"}
          </p>
        ) : null}
      </section>

      {state === "loading" && (
        <LoadingState
          className="customer-coupons__state"
          description="正在同步当前城市的优惠券状态。"
          productRole="customer"
          title="正在读取优惠券"
        />
      )}
      {state === "error" && failure && (
        <ErrorState
          action={<Button onClick={() => void load()} productRole="customer" variant="secondary">{failure.retryLabel}</Button>}
          className="customer-coupons__state"
          description={failure.description}
          productRole="customer"
          title={failure.title}
        />
      )}
      {state === "success" && viewModels.length === 0 && (
        <EmptyState
          action={(
            <a className="customer-coupons__service-link" href="/customer/services">
              浏览上门服务<ArrowRight aria-hidden="true" weight="bold" />
            </a>
          )}
          className="customer-coupons__state"
          description={view === "available" ? "新权益到账后会显示在这里。" : "当前账号还没有优惠券记录。"}
          productRole="customer"
          title={view === "available" ? "当前没有可使用的优惠券" : "当前没有优惠券记录"}
        />
      )}
      {state === "success" && viewModels.length > 0 && (
        <ul className="customer-coupons__list" aria-label="优惠券列表">
          {viewModels.map((item) => (
            <li
              aria-label={`优惠券 ${item.couponGrantId}`}
              className={`customer-coupons__card customer-coupons__card--${item.statusTone}`}
              data-coupon-stale={item.isStale ? "true" : undefined}
              data-coupon-status={item.status}
              key={item.couponGrantId}
            >
              <div aria-hidden="true" className="customer-coupons__ticket-icon">
                <Ticket weight="fill" />
              </div>
              <div className="customer-coupons__card-content">
                <div className="customer-coupons__card-header">
                  <span className="customer-coupons__reason"><Tag aria-hidden="true" weight="fill" />{item.issuanceReasonLabel}</span>
                  <StateBadge label={item.statusLabel} tone={item.statusTone} />
                </div>
                <h2>{item.availabilityLabel}</h2>
                <p className="customer-coupons__description">{item.statusDescription}</p>
                <dl className="customer-coupons__facts">
                  <div>
                    <dt><CalendarBlank aria-hidden="true" />有效期至</dt>
                    <dd>{item.expiresAtLabel}</dd>
                  </div>
                  <div>
                    <dt>券号</dt>
                    <dd className="customer-coupons__code">{item.couponGrantId}</dd>
                  </div>
                </dl>
                <footer className="customer-coupons__card-footer">
                  {item.canSelectForQuote && onSelectForQuote ? (
                    <Button
                      aria-label="用于下单报价"
                      disabled={selectingId !== null}
                      onClick={() => selectForQuote(item.couponGrantId)}
                      productRole="customer"
                      variant="primary"
                    >
                      {selectingId === item.couponGrantId ? (
                        <><ClockCountdown aria-hidden="true" />正在前往报价…</>
                      ) : (
                        <>用于下单报价<ArrowRight aria-hidden="true" weight="bold" /></>
                      )}
                    </Button>
                  ) : (
                    <p className="customer-coupons__unavailable">
                      <XCircle aria-hidden="true" weight="fill" />当前不可用于报价
                    </p>
                  )}
                  <span>更新于 {item.updatedAtLabel}</span>
                </footer>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
