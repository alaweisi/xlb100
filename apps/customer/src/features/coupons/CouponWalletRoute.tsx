import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  CouponGrant,
  CouponGrantStatus,
  MarketingDiscountDecision,
} from "@xlb/types";
import { issueMarketingDiscountDecisionRequestSchema } from "@xlb/validators";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import {
  CouponWalletActionController,
  type CouponDecisionActionResult,
  type CustomerCouponNavigation,
} from "./CouponWalletActionController.js";
import {
  CouponWalletCoordinator,
  type CouponWalletLoadResult,
} from "./CouponWalletCoordinator.js";
import { CustomerCouponWalletTemplate } from "./CustomerCouponWalletTemplate.js";
import {
  CUSTOMER_COUPON_GRANT_STATUSES,
  filterCouponGrants,
  mergeCouponGrants,
  type CustomerCouponNotice,
  type CustomerCouponStatusFilter,
  type CustomerCouponWalletRouteInput,
  type CustomerCouponWalletTemplateReadyData,
} from "./couponWalletTypes.js";
import "./coupon-wallet.css";

export const COUPON_WALLET_RETRY_EVENT = "xlb:customer-coupons-retry";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function storageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function changeRoute(path: string, replace = false): void {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerCouponNavigation():
Readonly<CustomerCouponNavigation> {
  return Object.freeze({
    back() {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      changeRoute("/", true);
    },
    showStatus(
      status: CustomerCouponStatusFilter,
      context: {
        readonly skuId: string;
        readonly quantity: number;
        readonly returnPath: "/order/create";
      } | null,
    ) {
      const query = new URLSearchParams();
      if (status !== "all") query.set("status", status);
      if (context !== null) {
        query.set("skuId", context.skuId);
        query.set("quantity", String(context.quantity));
        query.set("returnTo", context.returnPath);
      }
      const encoded = query.toString();
      changeRoute(encoded === "" ? "/coupons" : `/coupons?${encoded}`);
    },
    returnToCheckout(
      context: {
        readonly skuId: string;
        readonly quantity: number;
        readonly returnPath: "/order/create";
      },
      decision: MarketingDiscountDecision,
    ) {
      const query = new URLSearchParams({
        skuId: context.skuId,
        quantity: String(context.quantity),
        discountDecisionId: decision.discountDecisionId,
        discountDecisionRevision: String(decision.version),
        couponGrantId: decision.couponGrantId,
      });
      changeRoute(`${context.returnPath}?${query.toString()}`);
    },
  });
}

export function parseCouponWalletRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerCouponWalletRouteInput | null {
  if (route.pattern !== "/coupons" && route.pathname !== "/coupons") {
    return null;
  }
  const statusValue = route.query.status?.trim() ?? "all";
  if (
    statusValue !== "all" &&
    !CUSTOMER_COUPON_GRANT_STATUSES.includes(statusValue as CouponGrantStatus)
  ) {
    return null;
  }

  const skuId = route.query.skuId?.trim();
  const quantity = route.query.quantity?.trim();
  const returnPath = route.query.returnTo?.trim();
  const hasAnyContext = skuId !== undefined ||
    quantity !== undefined ||
    returnPath !== undefined;
  if (!hasAnyContext) {
    return Object.freeze({
      status: statusValue as CustomerCouponStatusFilter,
      checkoutContext: null,
      checkoutContextInvalid: false,
    });
  }
  const numericQuantity = quantity === undefined ? Number.NaN : Number(quantity);
  const requestProbe = issueMarketingDiscountDecisionRequestSchema.safeParse({
    skuId,
    quantity: numericQuantity,
    selectedCouponGrantId: "context-validation-probe",
    idempotencyKey: "customer-coupon-context-validation",
  });
  if (
    !requestProbe.success ||
    typeof skuId !== "string" ||
    !SAFE_ID.test(skuId) ||
    returnPath !== "/order/create"
  ) {
    return Object.freeze({
      status: statusValue as CustomerCouponStatusFilter,
      checkoutContext: null,
      checkoutContextInvalid: true,
    });
  }
  return Object.freeze({
    status: statusValue as CustomerCouponStatusFilter,
    checkoutContext: Object.freeze({
      skuId,
      quantity: numericQuantity,
      returnPath,
    }),
    checkoutContextInvalid: false,
  });
}

function createDefaultCoordinator(cityCode: CityCode): CouponWalletCoordinator {
  const client = createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    headers: () => {
      const token = storageValue("xlb.customer.token");
      return {
        "x-xlb-city-code": cityCode,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  });
  return new CouponWalletCoordinator(customerApi.forClient(client));
}

function recovery() {
  return Object.freeze({
    actionKey: COUPON_WALLET_RETRY_EVENT,
    labelKey: "重试",
  });
}

function boundaryState(
  result: Exclude<CouponWalletLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerCouponWalletTemplateReadyData> {
  switch (result.status) {
    case "unauthenticated":
      return {
        status: "error",
        errorCode: "customer_session_expired",
        retryable: false,
        recovery: null,
      };
    case "unavailable":
      return {
        status: "unavailable",
        capability: result.capability,
        reasonCode: result.reasonCode,
        recovery: result.reasonCode === "coupons_forbidden"
          ? null
          : recovery(),
      };
    case "error":
      return {
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
        recovery: result.retryable ? recovery() : null,
      };
  }
}

function decisionNotice(result: CouponDecisionActionResult):
CustomerCouponNotice {
  switch (result.status) {
    case "conflict":
      return Object.freeze({
        kind: "conflict",
        message: result.reasonCode === "request_in_flight"
          ? "服务端判定正在提交，请勿重复操作。"
          : "decision 与 grant 事实冲突，已刷新服务端券包。",
      });
    case "not_found":
      return Object.freeze({
        kind: "conflict",
        message: "无法确认该 grant 是否存在或可访问，已刷新服务端券包。",
      });
    case "unavailable":
      return Object.freeze({
        kind: "error",
        message: "正式 discount decision 能力或 Checkout Context 不可用。",
      });
    case "error":
      return Object.freeze({
        kind: "error",
        message: result.retryable
          ? "服务端判定尚未确认，请稍后重试。"
          : "decision 响应无法安全确认。",
      });
    case "unauthenticated":
      return Object.freeze({
        kind: "error",
        message: "会话已失效。",
      });
    case "decided":
      return Object.freeze({
        kind: result.decision.status === "issued" ||
            result.decision.status === "accepted"
          ? "success"
          : "info",
        message: `服务端 decision 状态：${result.decision.status}。`,
      });
  }
}

export interface CustomerCouponWalletPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly coordinator?: CouponWalletCoordinator;
  readonly navigation?: CustomerCouponNavigation;
  readonly onSessionExpired?: () => void;
}

export function CustomerCouponWalletPage({
  slice,
  route,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: CustomerCouponWalletPageProps) {
  const cityCode = providedCityCode === undefined
    ? storageValue("xlb.customer.cityCode") as CityCode | null
    : providedCityCode;
  const routeInput = useMemo(() => parseCouponWalletRoute(route), [route]);
  const coordinator = useMemo(
    () => providedCoordinator ?? (cityCode === null
      ? null
      : createDefaultCoordinator(cityCode)),
    [cityCode, providedCoordinator],
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerCouponNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => coordinator === null
      ? null
      : new CouponWalletActionController(coordinator, navigation),
    [coordinator, navigation],
  );
  const [loadResult, setLoadResult] =
    useState<CouponWalletLoadResult | null>(null);
  const [grants, setGrants] = useState<readonly CouponGrant[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [decidingGrantId, setDecidingGrantId] = useState<string | null>(null);
  const [notice, setNotice] = useState<CustomerCouponNotice | null>(null);
  const [decision, setDecision] =
    useState<{ grantId: string; decision: MarketingDiscountDecision } | null>(
      null,
    );
  const requestEpoch = useRef(0);

  const expireSession = useCallback(() => {
    onSessionExpired?.();
    window.dispatchEvent(new CustomEvent("xlb:customer-session-expired", {
      detail: Object.freeze({ returnUrl: route.pathname }),
    }));
  }, [onSessionExpired, route.pathname]);

  const load = useCallback(async (
    options: { readonly showLoading?: boolean } = {},
  ) => {
    if (cityCode === null || coordinator === null) {
      setLoadResult(Object.freeze({
        status: "unavailable",
        capability: "customer.coupons",
        reasonCode: "coupons_api_unavailable",
      }));
      return null;
    }
    const epoch = ++requestEpoch.current;
    if (options.showLoading ?? true) setLoadResult(null);
    else setRefreshing(true);
    const next = await coordinator.load(cityCode);
    if (epoch !== requestEpoch.current) return null;
    setRefreshing(false);
    setLoadResult(next);
    if (next.status === "ready") {
      setGrants(mergeCouponGrants([], next.grants));
    } else if (next.status === "unauthenticated") {
      expireSession();
    }
    return next;
  }, [cityCode, coordinator, expireSession]);

  useEffect(() => {
    if (routeInput === null) return;
    void load();
    const retry = () => void load();
    window.addEventListener(COUPON_WALLET_RETRY_EVENT, retry);
    return () => {
      requestEpoch.current += 1;
      window.removeEventListener(COUPON_WALLET_RETRY_EVENT, retry);
    };
  }, [load, routeInput]);

  const refreshAfterConflict = useCallback(async (
    finalNotice: CustomerCouponNotice,
  ) => {
    await load({ showLoading: false });
    setDecision(null);
    setNotice(finalNotice);
  }, [load]);

  const actions = useMemo(() => Object.freeze({
    onBack() {
      controller?.back();
    },
    onRefresh() {
      if (refreshing || decidingGrantId !== null) return;
      setDecision(null);
      setNotice(null);
      void load({ showLoading: false });
    },
    onSelectStatus(status: CustomerCouponStatusFilter) {
      if (refreshing || decidingGrantId !== null) return;
      controller?.showStatus(status, routeInput?.checkoutContext ?? null);
    },
    onRequestDecision(grant: CouponGrant) {
      if (
        controller === null ||
        decidingGrantId !== null ||
        refreshing
      ) return;
      setDecidingGrantId(grant.couponGrantId);
      setDecision(null);
      setNotice(null);
      void (async () => {
        const result = await controller.requestDecision(
          grant,
          routeInput?.checkoutContext ?? null,
        );
        setDecidingGrantId(null);
        if (result.status === "unauthenticated") {
          expireSession();
          return;
        }
        if (result.status === "conflict" || result.status === "not_found") {
          await refreshAfterConflict(decisionNotice(result));
          return;
        }
        setNotice(decisionNotice(result));
        if (result.status === "decided") {
          setDecision(Object.freeze({
            grantId: grant.couponGrantId,
            decision: result.decision,
          }));
          if (
            result.decision.status === "expired" ||
            result.decision.status === "rejected"
          ) {
            await load({ showLoading: false });
          }
        }
      })();
    },
    onReturnToCheckout() {
      if (
        controller === null ||
        routeInput?.checkoutContext === null ||
        routeInput?.checkoutContext === undefined ||
        decision === null ||
        decision.decision.status !== "issued"
      ) return;
      controller.returnToCheckout(
        routeInput.checkoutContext,
        decision.decision,
      );
    },
    onDismissNotice() {
      setNotice(null);
    },
  }), [
    controller,
    decidingGrantId,
    decision,
    expireSession,
    load,
    refreshAfterConflict,
    refreshing,
    routeInput,
  ]);

  let state: CustomerSliceState<CustomerCouponWalletTemplateReadyData>;
  if (routeInput === null) {
    state = {
      status: "error",
      errorCode: "invalid_coupon_wallet_route",
      retryable: false,
      recovery: null,
    };
  } else if (loadResult === null) {
    state = {
      status: "loading",
      requestKey: null,
      previousActorDataVisible: false,
    };
  } else if (loadResult.status !== "ready") {
    state = boundaryState(loadResult);
  } else {
    state = {
      status: "ready",
      data: {
        viewModel: {
          grants: filterCouponGrants(grants, routeInput.status),
          status: routeInput.status,
          refreshing,
          decidingGrantId,
          notice,
          decision,
          checkoutContext: routeInput.checkoutContext,
          checkoutContextInvalid: routeInput.checkoutContextInvalid,
          cursorCapability: "unavailable",
          projectionCapability: "limited",
        },
        actions,
      },
    };
  }

  return (
    <CustomerCouponWalletTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerCouponWalletPage;
