import { lazy, useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode } from "@xlb/types";
import { Button, FormField, IdentityGate, Input, StatusTag } from "@xlb/ui";
import type { CustomerOrderCreatePageProps } from "../pages/CustomerOrderCreatePage";
import type { CustomerOrdersPageProps } from "../pages/CustomerOrdersPage";
import type { CustomerCouponsPageProps } from "../pages/CustomerCouponsPage";
import type { CustomerSupportApi } from "../pages/CustomerSupportPage";
import {
  appendOrderId,
  clearCustomerSession,
  createCustomerApiClient,
  CustomerLoadable,
  detectCustomerRoute,
  loginCustomerWithCode,
  readCustomerCityCode,
  readOrderIds,
  readStoredSession,
  requestCustomerLoginCode,
  type CustomerSession,
  writeCustomerCityCode,
} from "../pages/customerPageShell";
import { isUnauthorizedCustomerError, toCustomerError } from "../adapters/customerError";

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
  const [loginPhone, setLoginPhone] = useState("13800000001");
  const [loginCode, setLoginCode] = useState("");
  const [authBusy, setAuthBusy] = useState<"code" | "login" | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const currentRoute = useMemo(() => detectCustomerRoute(), []);

  const targetName = currentRoute === "home" ? "首页" : currentRoute === "services" ? "服务选择" : currentRoute === "createOrder" ? "确认订单" : currentRoute === "orders" ? "订单" : currentRoute === "aftersale" ? "售后服务" : currentRoute === "support" ? "客服工单" : currentRoute === "notifications" ? "消息中心" : currentRoute === "coupons" ? "优惠券" : "我的";

  const handleRequestLoginCode = useCallback(async () => {
    setAuthBusy("code");
    setAuthError(null);
    setAuthNotice(null);
    try {
      const result = await requestCustomerLoginCode(loginPhone.trim());
      setAuthNotice(`验证码已发送，${result.ttlSeconds} 秒内有效。`);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "验证码发送失败，请稍后重试");
    } finally {
      setAuthBusy(null);
    }
  }, [loginPhone]);

  const handleCustomerLogin = useCallback(async () => {
    setAuthBusy("login");
    setAuthError(null);
    try {
      const next = await loginCustomerWithCode(loginPhone.trim(), loginCode.trim());
      setSession(next);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "登录失败，请核对验证码后重试");
    } finally {
      setAuthBusy(null);
    }
  }, [loginCode, loginPhone]);

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
      if (isUnauthorizedCustomerError(error)) {
        clearCustomerSession();
        setSession(null);
        setAuthError("登录状态已失效，请重新验证手机号。");
        return;
      }
      setCatalogState({
        status: "error",
        error: toCustomerError(error, "服务目录加载失败").description,
      });
    }
  }, [api, cityCode, session?.token]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleRetryCatalog = useCallback(() => {
    void loadCatalog();
  }, [loadCatalog]);

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
    listAddresses: () => api.listAddresses(),
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

  const isRequestingLoginCode = authBusy === "code";
  const isLoggingIn = authBusy === "login";

  if (!session) {
    return (
      <IdentityGate
        aria-busy={authBusy !== null}
        visualRole="customer"
        title="顾客身份验证"
        description="使用手机号验证码登录；验证完成后会回到刚才准备打开的服务画面。"
        recoveryTarget={`验证完成后返回：${targetName}`}
        status={<StatusTag tone="primary">需要登录</StatusTag>}
        form={<>
          <FormField label="手机号"><Input value={loginPhone} onChange={(event) => setLoginPhone(event.target.value)} /></FormField>
          <FormField label="短信验证码"><Input value={loginCode} onChange={(event) => setLoginCode(event.target.value)} /></FormField>
          {authNotice ? <p style={{ fontSize: 13, margin: 0 }}>{authNotice}</p> : null}
        </>}
        actions={<>
          <Button onClick={handleRequestLoginCode} disabled={authBusy !== null || !loginPhone.trim()}>{isRequestingLoginCode ? "正在发送" : "获取验证码"}</Button>
          <Button variant="primary" onClick={handleCustomerLogin} disabled={authBusy !== null || !loginPhone.trim() || !loginCode.trim()}>{isLoggingIn ? "正在登录" : "登录并继续"}</Button>
        </>}
        error={authError}
      />
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
