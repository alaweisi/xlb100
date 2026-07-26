import { lazy, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import type { CustomerOrderCreatePageProps } from "../pages/CustomerOrderCreatePage";
import type { CustomerOrdersPageProps } from "../pages/CustomerOrdersPage";
import type { CustomerCouponsPageProps } from "../pages/CustomerCouponsPage";
import type { CustomerSupportApi } from "../pages/CustomerSupportPage";
import {
  appendOrderId,
  clearStoredCustomerSession,
  createCustomerApiClient,
  CustomerLoadable,
  detectCustomerRoute,
  isCustomerSessionUnauthorized,
  loginCustomer,
  readCustomerCityCode,
  readOrderIds,
  readStoredCustomerPhone,
  readStoredSession,
  requestCustomerCode,
  type CustomerSession,
  writeCustomerCityCode,
} from "../pages/customerPageShell";

const CustomerHomePage = lazy(() => import("../pages/CustomerHomePage").then((module) => ({ default: module.CustomerHomePage })));
const CustomerOrderCreatePage = lazy(() => import("../pages/CustomerOrderCreatePage").then((module) => ({ default: module.CustomerOrderCreatePage })));
const CustomerOrdersPage = lazy(() => import("../pages/CustomerOrdersPage").then((module) => ({ default: module.CustomerOrdersPage })));
const CustomerAftersalePage = lazy(() => import("../pages/CustomerAftersalePage").then((module) => ({ default: module.CustomerAftersalePage })));
const CustomerProfilePage = lazy(() => import("../pages/CustomerProfilePage").then((module) => ({ default: module.CustomerProfilePage })));
const CustomerServicesPage = lazy(() => import("../pages/CustomerServicesPage").then((module) => ({ default: module.CustomerServicesPage })));
const CustomerSupportPage = lazy(() => import("../pages/CustomerSupportPage").then((module) => ({ default: module.CustomerSupportPage })));
const CustomerNotificationsPage = lazy(() => import("../pages/CustomerNotificationsPage").then((module) => ({ default: module.CustomerNotificationsPage })));
const CustomerCouponsPage = lazy(() => import("../pages/CustomerCouponsPage").then((module) => ({ default: module.CustomerCouponsPage })));

export function App() {
  const initialCityCode = useMemo(() => readCustomerCityCode(), []);
  const [cityCode, setCityCode] = useState<CityCode>(initialCityCode);
  const [catalogState, setCatalogState] = useState<CustomerLoadable<CatalogSnapshot>>({ status: "loading" });
  const [orderIds, setOrderIds] = useState<string[]>(() => {
    const storedOrderIds = readOrderIds();
    const orderIdFromUrl =
      typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("orderId")?.trim() ?? "";
    return orderIdFromUrl
      ? [orderIdFromUrl, ...storedOrderIds.filter((orderId) => orderId !== orderIdFromUrl)]
      : storedOrderIds;
  });
  const [session, setSession] = useState<CustomerSession | null>(() => readStoredSession());
  const [authPhone, setAuthPhone] = useState(() => readStoredCustomerPhone());
  const [authCode, setAuthCode] = useState("");
  const [authStatus, setAuthStatus] = useState<"idle" | "requesting" | "codeSent" | "signingIn">("idle");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const currentRoute = useMemo(() => detectCustomerRoute(), []);

  const api = useMemo(
    () => createCustomerApiClient(cityCode, session?.token),
    [cityCode, session?.token],
  );
  const setCityAndPersist = useCallback((next: CityCode) => {
    writeCustomerCityCode(next);
    setCityCode(next);
  }, []);

  const loadCatalog = useCallback(async () => {
    if (!session?.token) {
      setCatalogState({ status: "loading" });
      return;
    }
    setCatalogState((previous) =>
      previous.status === "success" && previous.data?.cityCode === cityCode
        ? { status: "loading", data: previous.data }
        : { status: "loading" },
    );
    try {
      const result = await api.getCatalog();
      setCatalogState({ status: "success", data: result.catalog });
    } catch (error) {
      if (isCustomerSessionUnauthorized(error)) {
        clearStoredCustomerSession();
        setSession(null);
        setAuthStatus("idle");
        setAuthError("登录状态已过期，请重新验证手机号。");
        return;
      }
      setCatalogState({
        status: "error",
        error: error instanceof Error ? error.message : "Unable to load catalog",
      });
    }
  }, [api, cityCode, session?.token]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleRetryCatalog = useCallback(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleRequestCode = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const phone = authPhone.trim();
    if (!/^1[3-9]\d{9}$/u.test(phone)) {
      setAuthError("请输入正确的 11 位手机号码。");
      return;
    }
    setAuthStatus("requesting");
    setAuthError("");
    setAuthMessage("");
    try {
      const result = await requestCustomerCode(phone);
      if (result.stagingDemoCode) {
        setAuthCode(result.stagingDemoCode);
        setAuthMessage(`Staging 演示验证码：${result.stagingDemoCode}`);
      } else {
        setAuthMessage("验证码已发送，请输入短信中的 6 位验证码。");
      }
      setAuthStatus("codeSent");
    } catch (error) {
      setAuthStatus("idle");
      setAuthError(error instanceof Error ? error.message : "验证码发送失败，请稍后重试。");
    }
  }, [authPhone]);

  const handleLogin = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const phone = authPhone.trim();
    const code = authCode.trim();
    if (!/^1[3-9]\d{9}$/u.test(phone) || !/^\d{6}$/u.test(code)) {
      setAuthError("请输入正确的手机号和 6 位验证码。");
      return;
    }
    setAuthStatus("signingIn");
    setAuthError("");
    try {
      const nextSession = await loginCustomer(phone, code);
      setSession(nextSession);
      setAuthMessage("");
      setAuthStatus("idle");
    } catch (error) {
      setAuthStatus("codeSent");
      setAuthError(error instanceof Error ? error.message : "登录失败，请重新获取验证码。");
    }
  }, [authCode, authPhone]);

  const handleOrderCreated = useCallback(
    (orderId: string) => {
      setOrderIds(() => appendOrderId(orderId));
      setCityAndPersist(cityCode);
      const params = new URLSearchParams(window.location.search);
      params.set("orderId", orderId);
      window.history.replaceState({}, "", `/customer/orders?${params.toString()}`);
    },
    [cityCode, setCityAndPersist],
  );

  const orderCreateApi: CustomerOrderCreatePageProps["api"] = {
    getPriceQuote: (skuId) => api.getPriceQuote(skuId),
    createOrder: (payload) => api.createOrder(payload),
    getOrder: (orderId) => api.getOrder(orderId),
    listCouponGrants: (query) => api.listCouponGrants(query),
    issueDiscountDecision: (payload) => api.issueDiscountDecision(payload),
  };

  const ordersApi: CustomerOrdersPageProps["api"] = {
    getOrder: (orderId) => api.getOrder(orderId),
    confirmService: (orderId) => api.confirmService(orderId),
    createPaymentOrder: (payload) => api.createPaymentOrder(payload),
    createRefundRequest: (payload) => api.createRefundRequest(payload),
    createOrderReview: (payload) => api.createOrderReview(payload),
    getOrderReview: (orderId) => api.getOrderReview(orderId),
    createReviewAppeal: (reviewId, payload) => api.createReviewAppeal(reviewId, payload),
    withdrawReviewAppeal: (reviewId, payload) => api.withdrawReviewAppeal(reviewId, payload),
  };

  if (!session) {
    const requesting = authStatus === "requesting";
    const signingIn = authStatus === "signingIn";
    return (
      <main className="customer-auth-page">
        <section className="customer-auth-card" aria-labelledby="customer-auth-title">
          <div className="customer-auth-brand" aria-hidden="true">喜乐帮</div>
          <div className="customer-auth-copy">
            <p className="customer-auth-eyebrow">CUSTOMER ACCESS</p>
            <h1 id="customer-auth-title">手机号登录</h1>
            <p>验证手机号后进入喜乐帮用户端。</p>
          </div>

          <form className="customer-auth-form" onSubmit={handleRequestCode}>
            <label htmlFor="customer-auth-phone">手机号码</label>
            <input
              id="customer-auth-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              placeholder="请输入 11 位手机号码"
              value={authPhone}
              onChange={(event) => setAuthPhone(event.target.value.replace(/\D/gu, ""))}
              disabled={requesting || signingIn}
            />
            <button type="submit" disabled={requesting || signingIn}>
              {requesting ? "正在发送…" : authStatus === "codeSent" ? "重新获取验证码" : "获取验证码"}
            </button>
          </form>

          {authStatus === "codeSent" || signingIn ? (
            <form className="customer-auth-form customer-auth-code-form" onSubmit={handleLogin}>
              <label htmlFor="customer-auth-code">验证码</label>
              <input
                id="customer-auth-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6 位验证码"
                value={authCode}
                onChange={(event) => setAuthCode(event.target.value.replace(/\D/gu, ""))}
                disabled={signingIn}
              />
              <button className="customer-auth-primary" type="submit" disabled={signingIn}>
                {signingIn ? "正在登录…" : "登录用户端"}
              </button>
            </form>
          ) : null}

          {authMessage ? <p className="customer-auth-notice" role="status">{authMessage}</p> : null}
          {authError ? <p className="customer-auth-error" role="alert">{authError}</p> : null}
          <p className="customer-auth-security">验证码一次有效，请勿转发给他人。</p>
        </section>
      </main>
    );
  }

  if (currentRoute === "home") {
    return <CustomerHomePage cityCode={cityCode} catalogState={catalogState} onRetryCatalog={handleRetryCatalog} />;
  }

  if (currentRoute === "services") {
    return <CustomerServicesPage cityCode={cityCode} catalogState={catalogState} onRetryCatalog={handleRetryCatalog} />;
  }

  if (currentRoute === "createOrder") {
    return (
      <CustomerOrderCreatePage
        api={orderCreateApi}
        catalogState={catalogState}
        cityCode={cityCode}
        onOrderCreated={handleOrderCreated}
      />
    );
  }

  if (currentRoute === "orders") {
    return <CustomerOrdersPage api={ordersApi} cityCode={cityCode} orderIds={orderIds} />;
  }

  if (currentRoute === "aftersale") {
    return <CustomerAftersalePage api={api} orderIds={orderIds} />;
  }

  if (currentRoute === "support") {
    const supportApi: CustomerSupportApi = {
      createTicket: (input) => api.createSupportTicket(input),
      listTickets: (filters) => api.listSupportTickets(filters),
      getTicket: (ticketId) => api.getSupportTicket(ticketId),
      addComment: (ticketId, input) => api.addSupportTicketComment(ticketId, input),
      reopenTicket: (ticketId, input) => api.reopenSupportTicket(ticketId, input),
      submitCsat: (ticketId,input) => api.submitSupportTicketCsat(ticketId,input),
      createConversation: (input) => api.createSupportConversation(input),
      listConversations: () => api.listSupportConversations(),
      getConversation: (conversationId) => api.getSupportConversation(conversationId),
      sendConversationMessage: (conversationId, input) => api.sendSupportMessage(conversationId, input),
    };
    return <CustomerSupportPage api={supportApi} />;
  }

  if (currentRoute === "notifications") {
    return <CustomerNotificationsPage api={api} />;
  }

  if (currentRoute === "coupons") {
    const couponsApi: CustomerCouponsPageProps["api"] = {
      listCouponGrants: (query) => api.listCouponGrants(query),
    };
    return (
      <CustomerCouponsPage
        api={couponsApi}
        onSelectForQuote={(couponGrantId) => {
          window.location.assign(`/customer/order/create?couponGrantId=${encodeURIComponent(couponGrantId)}`);
        }}
      />
    );
  }

  return <CustomerProfilePage api={api} cityCode={cityCode} />;
}
