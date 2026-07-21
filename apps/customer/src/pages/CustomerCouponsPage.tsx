import { useCallback, useEffect, useMemo, useState } from "react";
import type { CouponGrant, CouponGrantListResponse } from "@xlb/types";
import { sortCustomerCouponGrants, toCustomerCouponGrantViewModel } from "../adapters/marketingAdapter";
import { CustomerRouteShell } from "./customerPageShell";
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
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const response = await api.listCouponGrants(view === "available" ? { status: "available" } : undefined);
      setItems(sortCustomerCouponGrants(response.couponGrants));
      setState("success");
    } catch {
      setError("优惠券暂时无法加载，请稍后重试");
      setState("error");
    }
  }, [api, view]);

  useEffect(() => { void load(); }, [load]);

  const viewModels = useMemo(() => {
    const now = new Date();
    return items.map((item) => toCustomerCouponGrantViewModel(item, now));
  }, [items]);

  return (
    <CustomerRouteShell currentRoute="coupons">
      <main className="customer-coupons customer-coupons-surface" aria-labelledby="customer-coupons-title">
      <header className="customer-coupons__header">
        <div>
          <h1 id="customer-coupons-title">我的优惠券</h1>
          <p className="customer-coupons__muted">优惠金额以提交订单前的服务端报价为准，页面不进行本地折扣计算。</p>
        </div>
      </header>

      <div className="customer-coupons__toolbar" role="tablist" aria-label="优惠券范围">
        <button type="button" role="tab" aria-selected={view === "available"} onClick={() => setView("available")}>可使用</button>
        <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")}>全部</button>
      </div>

      {state === "loading" && <p role="status">正在读取优惠券…</p>}
      {state === "error" && (
        <section role="alert" className="customer-coupons__error">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>重试</button>
        </section>
      )}
      {state === "success" && viewModels.length === 0 && (
        <p role="status">{view === "available" ? "当前没有可使用的优惠券" : "当前没有优惠券记录"}</p>
      )}
      {state === "success" && viewModels.length > 0 && (
        <ul className="customer-coupons__list" aria-label="优惠券列表">
          {viewModels.map((item) => (
            <li key={item.couponGrantId} className="customer-coupons__card">
              <div className="customer-coupons__card-header">
                <strong>{item.statusLabel}</strong>
                <span>{item.issuanceReasonLabel}</span>
              </div>
              <div className="customer-coupons__facts">
                <span>券标识：{item.couponGrantId}</span>
                <span>有效期至：{item.expiresAtLabel}</span>
              </div>
              {item.canSelectForQuote && onSelectForQuote && (
                <button type="button" onClick={() => onSelectForQuote(item.couponGrantId)}>用于下单报价</button>
              )}
            </li>
          ))}
        </ul>
      )}
      </main>
    </CustomerRouteShell>
  );
}
