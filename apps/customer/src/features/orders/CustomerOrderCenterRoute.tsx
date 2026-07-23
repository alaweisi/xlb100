import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CustomerOrderListFilter,
  KnownCityCode,
} from "@xlb/types";
import { customerOrderListQuerySchema } from "@xlb/validators";
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
  getCustomerBrowserEntryRuntime,
} from "../shell/browserEntryRuntime.js";
import type {
  CustomerAppShellCoordinator,
  CustomerAppShellState,
} from "../shell/CustomerAppShellCoordinator.js";
import {
  CustomerOrderCenterActionController,
  type CustomerOrderCenterNavigation,
} from "./CustomerOrderCenterActionController.js";
import {
  CustomerOrderCenterCoordinator,
  type CustomerOrderCenterPageLoadResult,
} from "./CustomerOrderCenterCoordinator.js";
import { CustomerOrderCenterTemplate } from "./CustomerOrderCenterTemplate.js";
import {
  mergeCustomerOrderSummaries,
  type CustomerOrderCenterNotice,
  type CustomerOrderCenterRouteInput,
  type CustomerOrderCenterTemplateReadyData,
} from "./CustomerOrderCenterTypes.js";
import "./customer-order-center.css";

export const CUSTOMER_ORDER_CENTER_RETRY_EVENT =
  "xlb:customer-orders-retry";

export interface CustomerOrderCenterScope {
  readonly actorId: string;
  readonly cityCode: KnownCityCode;
}

function changeBrowserRoute(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerOrderCenterNavigation():
Readonly<CustomerOrderCenterNavigation> {
  return Object.freeze({
    showFilter(filter: CustomerOrderListFilter) {
      changeBrowserRoute(filter === "all"
        ? "/orders"
        : `/orders?filter=${filter}`);
    },
    openRoute(route: `/orders/${string}`) {
      changeBrowserRoute(route);
    },
  });
}

function defaultCoordinator(
  shell: CustomerAppShellCoordinator,
): CustomerOrderCenterCoordinator {
  const client = createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    headers: () => {
      const snapshot = shell.snapshot();
      const cityCode = snapshot.status === "ready"
        ? snapshot.cityCode
        : null;
      const token = shell.accessToken();
      return {
        ...(cityCode ? { "x-xlb-city-code": cityCode } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  });
  return new CustomerOrderCenterCoordinator(customerApi.forClient(client));
}

export function parseCustomerOrderCenterRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerOrderCenterRouteInput | null {
  if (
    route.pattern !== "/orders" ||
    route.pathname !== "/orders" ||
    Object.keys(route.params).length !== 0 ||
    Object.keys(route.query).some((key) => key !== "filter" && key !== "cursor")
  ) {
    return null;
  }
  const filter = route.query.filter?.trim() || "all";
  const cursor = route.query.cursor?.trim();
  const parsed = customerOrderListQuerySchema.safeParse({
    filter,
    ...(cursor === undefined || cursor.length === 0 ? {} : { cursor }),
  });
  if (!parsed.success) return null;
  return Object.freeze({
    filter: parsed.data.filter ?? "all",
    cursor: parsed.data.cursor ?? null,
  });
}

function recovery() {
  return Object.freeze({
    actionKey: CUSTOMER_ORDER_CENTER_RETRY_EVENT,
    labelKey: "重新读取",
  });
}

function boundaryState(
  result: Exclude<CustomerOrderCenterPageLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerOrderCenterTemplateReadyData> {
  switch (result.status) {
    case "error":
      return Object.freeze({
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
        recovery: result.retryable ? recovery() : null,
      });
    case "unauthenticated":
      return Object.freeze({
        status: "error",
        errorCode: "customer_session_expired",
        retryable: false,
        recovery: null,
      });
    case "conflict":
      return Object.freeze({
        status: "conflict",
        conflictCode: result.reasonCode,
        refreshRequired: true,
        recovery: recovery(),
      });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: result.reasonCode,
        recovery: result.reasonCode === "orders_scope_unavailable"
          ? null
          : recovery(),
      });
  }
}

function readyShellScope(state: CustomerAppShellState):
CustomerOrderCenterScope | null {
  return state.status === "ready" &&
      state.session !== null &&
      state.cityCode !== null
    ? Object.freeze({
        actorId: state.session.actor.userId,
        cityCode: state.cityCode,
      })
    : null;
}

export interface CustomerOrderCenterPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly shell?: CustomerAppShellCoordinator;
  readonly scope?: CustomerOrderCenterScope;
  readonly coordinator?: CustomerOrderCenterCoordinator;
  readonly navigation?: CustomerOrderCenterNavigation;
  readonly onSessionExpired?: () => void;
}

export function CustomerOrderCenterPage({
  slice,
  route,
  shell: providedShell,
  scope: providedScope,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: CustomerOrderCenterPageProps) {
  const runtime = useMemo(
    () => providedShell === undefined && providedScope === undefined
      ? getCustomerBrowserEntryRuntime()
      : null,
    [providedScope, providedShell],
  );
  const shell = providedShell ?? runtime?.shell ?? null;
  const coordinator = useMemo(
    () => providedCoordinator ??
      (shell === null ? null : defaultCoordinator(shell)),
    [providedCoordinator, shell],
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerOrderCenterNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => new CustomerOrderCenterActionController(navigation),
    [navigation],
  );
  const routeInput = useMemo(
    () => parseCustomerOrderCenterRoute(route),
    [route],
  );

  const [loadResult, setLoadResult] =
    useState<CustomerOrderCenterPageLoadResult | null>(null);
  const [items, setItems] = useState<
    CustomerOrderCenterTemplateReadyData["viewModel"]["items"]
  >([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<CustomerOrderCenterNotice | null>(null);
  const requestSequence = useRef(0);
  const activeScopeKey = useRef<string | null>(null);
  const pageRequestInFlight = useRef(false);
  const currentItems = useRef(items);
  currentItems.current = items;

  const expireSession = useCallback(async () => {
    if (shell !== null) await shell.expireSession();
    onSessionExpired?.();
    window.dispatchEvent(new CustomEvent("xlb:customer-session-expired", {
      detail: Object.freeze({ returnUrl: route.pathname }),
    }));
  }, [onSessionExpired, route.pathname, shell]);

  const resolveScope = useCallback(async () => {
    if (providedScope !== undefined) return providedScope;
    if (shell === null) return null;
    let state = shell.snapshot();
    if (state.status !== "ready") state = await shell.restore();
    return readyShellScope(state);
  }, [providedScope, shell]);

  const load = useCallback(async (
    input: CustomerOrderCenterRouteInput,
    showLoading: boolean,
  ) => {
    const sequence = ++requestSequence.current;
    pageRequestInFlight.current = false;
    setLoadingMore(false);
    setNotice(null);
    if (showLoading) {
      setLoadResult(null);
      setItems([]);
      setNextCursor(null);
      setRefreshing(false);
    } else {
      setRefreshing(true);
    }

    const scope = await resolveScope();
    if (sequence !== requestSequence.current) return;
    if (scope === null || coordinator === null) {
      setRefreshing(false);
      setLoadResult(Object.freeze({
        status: "unavailable",
        capability: "customer.orders",
        reasonCode: "orders_scope_unavailable",
      }));
      return;
    }
    const scopeKey = [
      scope.actorId,
      scope.cityCode,
      route.pathname,
      input.filter,
      input.cursor ?? "",
    ].join(":");
    activeScopeKey.current = scopeKey;
    const result = await coordinator.loadPage(
      scope.cityCode,
      input.filter,
      input.cursor,
    );
    if (
      sequence !== requestSequence.current ||
      activeScopeKey.current !== scopeKey
    ) {
      return;
    }
    setRefreshing(false);
    setLoadResult(result);
    if (result.status === "ready") {
      setItems(result.items);
      setNextCursor(result.nextCursor);
      return;
    }
    setItems([]);
    setNextCursor(null);
    if (result.status === "unauthenticated") await expireSession();
  }, [coordinator, expireSession, resolveScope, route.pathname]);

  useEffect(() => {
    if (routeInput === null) return;
    void load(routeInput, true);
    const retry = () => void load(routeInput, true);
    window.addEventListener(CUSTOMER_ORDER_CENTER_RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(CUSTOMER_ORDER_CENTER_RETRY_EVENT, retry);
    };
  }, [load, routeInput]);

  const loadMore = useCallback(async () => {
    if (
      routeInput === null ||
      coordinator === null ||
      nextCursor === null ||
      loadingMore ||
      refreshing ||
      pageRequestInFlight.current
    ) return;
    pageRequestInFlight.current = true;
    setLoadingMore(true);
    const scope = await resolveScope();
    if (scope === null) {
      pageRequestInFlight.current = false;
      setLoadingMore(false);
      return;
    }
    const sequence = requestSequence.current;
    const scopeKey = activeScopeKey.current;
    setNotice(null);
    const result = await coordinator.loadPage(
      scope.cityCode,
      routeInput.filter,
      nextCursor,
    );
    if (
      sequence !== requestSequence.current ||
      activeScopeKey.current !== scopeKey
    ) {
      return;
    }
    pageRequestInFlight.current = false;
    setLoadingMore(false);
    if (result.status === "ready") {
      setItems((current) => mergeCustomerOrderSummaries(
        current,
        result.items,
      ));
      setNextCursor(result.nextCursor);
      return;
    }
    setLoadResult(result);
    setItems([]);
    setNextCursor(null);
    if (result.status === "unauthenticated") await expireSession();
  }, [
    coordinator,
    expireSession,
    loadingMore,
    nextCursor,
    refreshing,
    resolveScope,
    routeInput,
  ]);

  let state: CustomerSliceState<CustomerOrderCenterTemplateReadyData>;
  if (routeInput === null) {
    state = Object.freeze({
      status: "error",
      errorCode: "invalid_order_center_route",
      retryable: false,
      recovery: null,
    });
  } else if (loadResult === null) {
    state = Object.freeze({
      status: "loading",
      requestKey: null,
      previousActorDataVisible: false,
    });
  } else if (loadResult.status !== "ready") {
    state = boundaryState(loadResult);
  } else {
    const actions = Object.freeze({
      onSelectFilter(filter: CustomerOrderListFilter) {
        if (
          filter === routeInput.filter ||
          refreshing ||
          loadingMore
        ) return;
        controller.showFilter(filter);
      },
      onRefresh() {
        if (refreshing || loadingMore) return;
        void load(routeInput, false);
      },
      onLoadMore() {
        void loadMore();
      },
      onOpenOrder(orderId: string) {
        const result = controller.openOrder(orderId, currentItems.current);
        if (result.status === "rejected") {
          setNotice(Object.freeze({
            kind: "safe",
            message: "该订单标识无法安全打开，已拒绝跳转。",
          }));
        }
      },
      onDismissNotice() {
        setNotice(null);
      },
    });
    state = Object.freeze({
      status: "ready",
      data: Object.freeze({
        viewModel: Object.freeze({
          filter: routeInput.filter,
          items,
          nextCursor,
          refreshing,
          loadingMore,
          notice,
        }),
        actions,
      }),
    });
  }

  return (
    <CustomerOrderCenterTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerOrderCenterPage;
