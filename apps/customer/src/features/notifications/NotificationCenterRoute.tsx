import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  NotificationInboxItem,
  NotificationInboxView,
} from "@xlb/types";
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
  NotificationCenterActionController,
  type CustomerNotificationNavigation,
} from "./NotificationCenterActionController.js";
import {
  NotificationCenterCoordinator,
  type NotificationMutationResult,
  type NotificationPageLoadResult,
  type NotificationUnreadCountResult,
} from "./NotificationCenterCoordinator.js";
import { CustomerNotificationTemplate } from "./CustomerNotificationTemplate.js";
import {
  mergeNotificationItems,
  type CustomerNotificationTemplateReadyData,
  type NotificationCenterNotice,
  type NotificationCenterRouteInput,
  type NotificationOperation,
  type NotificationOperationKind,
} from "./notificationCenterTypes.js";
import "./notification-center.css";

export const NOTIFICATION_CENTER_RETRY_EVENT =
  "xlb:customer-notifications-retry";

const SAFE_CURSOR = /^[A-Za-z0-9_-]{1,512}$/u;

function storageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function changeBrowserRoute(path: string, replace = false): void {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerNotificationNavigation():
Readonly<CustomerNotificationNavigation> {
  return Object.freeze({
    back() {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      changeBrowserRoute("/", true);
    },
    showView(view: NotificationInboxView) {
      changeBrowserRoute(
        view === "inbox" ? "/notifications" : "/notifications?view=archive",
      );
    },
    openRoute(
      route: `/orders/${string}` | `/support/tickets/${string}`,
    ) {
      changeBrowserRoute(route);
    },
  });
}

function createDefaultCoordinator(cityCode: CityCode):
NotificationCenterCoordinator {
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
  return new NotificationCenterCoordinator(customerApi.forClient(client));
}

export function parseNotificationCenterRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): NotificationCenterRouteInput | null {
  if (
    route.pattern !== "/notifications" &&
    route.pathname !== "/notifications"
  ) {
    return null;
  }
  const viewValue = route.query.view?.trim();
  if (
    viewValue !== undefined &&
    viewValue !== "inbox" &&
    viewValue !== "archive"
  ) {
    return null;
  }
  const cursorValue = route.query.cursor?.trim();
  if (cursorValue !== undefined && !SAFE_CURSOR.test(cursorValue)) {
    return null;
  }
  return Object.freeze({
    view: viewValue ?? "inbox",
    cursor: cursorValue ?? null,
  });
}

function recovery() {
  return Object.freeze({
    actionKey: NOTIFICATION_CENTER_RETRY_EVENT,
    labelKey: "重试",
  });
}

function boundaryState(
  result: Exclude<NotificationPageLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerNotificationTemplateReadyData> {
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
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: result.reasonCode,
        recovery: result.reasonCode === "notifications_forbidden"
          ? null
          : recovery(),
      });
  }
}

function successNotice(kind: NotificationOperationKind): NotificationCenterNotice {
  const message = kind === "marking-read"
    ? "服务端已确认已读状态，并已刷新通知与未读数。"
    : kind === "archiving"
      ? "服务端已确认归档，并已刷新通知与未读数。"
      : "服务端已确认恢复，并已刷新通知与未读数。";
  return Object.freeze({ kind: "success", message });
}

export interface NotificationCenterPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly coordinator?: NotificationCenterCoordinator;
  readonly navigation?: CustomerNotificationNavigation;
  readonly onSessionExpired?: () => void;
}

export function NotificationCenterPage({
  slice,
  route,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: NotificationCenterPageProps) {
  const cityCode = providedCityCode === undefined
    ? storageValue("xlb.customer.cityCode") as CityCode | null
    : providedCityCode;
  const routeInput = useMemo(() => parseNotificationCenterRoute(route), [route]);
  const coordinator = useMemo(
    () => providedCoordinator ?? (cityCode === null
      ? null
      : createDefaultCoordinator(cityCode)),
    [cityCode, providedCoordinator],
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerNotificationNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => coordinator === null
      ? null
      : new NotificationCenterActionController(coordinator, navigation),
    [coordinator, navigation],
  );

  const [view, setView] = useState<NotificationInboxView>(
    routeInput?.view ?? "inbox",
  );
  const [loadResult, setLoadResult] =
    useState<NotificationPageLoadResult | null>(null);
  const [items, setItems] = useState<readonly NotificationInboxItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [unreadCountUnavailable, setUnreadCountUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [operation, setOperation] = useState<NotificationOperation | null>(null);
  const [notice, setNotice] = useState<NotificationCenterNotice | null>(null);
  const requestEpoch = useRef(0);
  const activeView = useRef(view);

  const expireSession = useCallback(() => {
    onSessionExpired?.();
    window.dispatchEvent(new CustomEvent("xlb:customer-session-expired", {
      detail: Object.freeze({ returnUrl: route.pathname }),
    }));
  }, [onSessionExpired, route.pathname]);

  const applyUnreadResult = useCallback((
    result: NotificationUnreadCountResult,
  ) => {
    if (result.status === "ready") {
      setUnreadCount(result.unreadCount);
      setUnreadCountUnavailable(false);
      return;
    }
    setUnreadCount(null);
    setUnreadCountUnavailable(true);
    if (result.status === "unauthenticated") expireSession();
  }, [expireSession]);

  const refresh = useCallback(async (
    targetView: NotificationInboxView,
    options: {
      readonly showLoading?: boolean;
      readonly cursor?: string | null;
      readonly finalNotice?: NotificationCenterNotice | null;
    } = {},
  ) => {
    if (cityCode === null || coordinator === null) {
      setLoadResult(Object.freeze({
        status: "unavailable",
        capability: "customer.notifications",
        reasonCode: "notifications_api_unavailable",
      }));
      return null;
    }

    const epoch = ++requestEpoch.current;
    activeView.current = targetView;
    setView(targetView);
    setLoadingMore(false);
    if (options.showLoading ?? true) {
      setLoadResult(null);
    } else {
      setRefreshing(true);
    }

    const [page, count] = await Promise.all([
      coordinator.loadPage(targetView, options.cursor ?? null),
      coordinator.loadUnreadCount(),
    ]);
    if (epoch !== requestEpoch.current || activeView.current !== targetView) {
      return null;
    }

    setRefreshing(false);
    setLoadResult(page);
    applyUnreadResult(count);
    if (page.status === "ready") {
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setNotice(options.finalNotice ?? null);
    } else {
      setItems([]);
      setNextCursor(null);
      if (page.status === "unauthenticated") expireSession();
    }
    return page;
  }, [applyUnreadResult, cityCode, coordinator, expireSession]);

  useEffect(() => {
    if (routeInput === null) return;
    void refresh(routeInput.view, {
      showLoading: true,
      cursor: routeInput.cursor,
    });
    const retry = () => {
      void refresh(activeView.current, { showLoading: true });
    };
    window.addEventListener(NOTIFICATION_CENTER_RETRY_EVENT, retry);
    return () => {
      requestEpoch.current += 1;
      window.removeEventListener(NOTIFICATION_CENTER_RETRY_EVENT, retry);
    };
  }, [refresh, routeInput]);

  const scope = useMemo(() => Object.freeze({
    rowVersions: new Map(
      items.map((item) => [item.notificationId, item.rowVersion] as const),
    ),
  }), [items]);

  const loadMore = useCallback(async () => {
    if (
      coordinator === null ||
      nextCursor === null ||
      loadingMore ||
      operation !== null ||
      refreshing
    ) return;
    const epoch = requestEpoch.current;
    const targetView = activeView.current;
    setLoadingMore(true);
    const result = await coordinator.loadPage(targetView, nextCursor);
    if (epoch !== requestEpoch.current || activeView.current !== targetView) {
      return;
    }
    setLoadingMore(false);
    if (result.status === "ready") {
      setItems((current) => mergeNotificationItems(current, result.items));
      setNextCursor(result.nextCursor);
      setNotice(null);
      return;
    }
    if (result.status === "unauthenticated") {
      expireSession();
      setLoadResult(result);
      return;
    }
    setNotice(Object.freeze({
      kind: "error",
      message: result.status === "unavailable"
        ? "通知分页能力暂不可用，已保留当前服务端列表。"
        : "更多通知加载失败，当前列表未被覆盖。",
    }));
  }, [
    coordinator,
    expireSession,
    loadingMore,
    nextCursor,
    operation,
    refreshing,
  ]);

  const settleMutation = useCallback(async (
    result: NotificationMutationResult,
    completedOperation: NotificationOperation,
  ) => {
    if (result.status === "success") {
      await refresh(activeView.current, {
        showLoading: false,
        finalNotice: successNotice(completedOperation.kind),
      });
      return;
    }
    if (result.status === "conflict" || result.status === "not_found") {
      await refresh(activeView.current, {
        showLoading: false,
        finalNotice: Object.freeze({
          kind: "conflict",
          message: "通知已在其他请求中变化，已刷新服务端最新状态。",
        }),
      });
      return;
    }
    if (result.status === "unauthenticated") {
      expireSession();
      setLoadResult(result);
      return;
    }
    if (result.status === "unavailable") {
      setLoadResult(Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: "notifications_api_unavailable",
      }));
      return;
    }
    setNotice(Object.freeze({
      kind: "error",
      message: result.retryable
        ? "操作结果尚未确认，请刷新后再试。"
        : "服务端未接受本次通知操作，请刷新后重试。",
    }));
  }, [expireSession, refresh]);

  const runMutation = useCallback(async (
    item: NotificationInboxItem,
    kind: NotificationOperationKind,
    task: () => Promise<NotificationMutationResult>,
  ) => {
    if (operation !== null || refreshing || loadingMore) return;
    const pending = Object.freeze({
      notificationId: item.notificationId,
      kind,
    });
    setOperation(pending);
    setNotice(null);
    ++requestEpoch.current;
    const result = await task();
    setOperation(null);
    await settleMutation(result, pending);
  }, [loadingMore, operation, refreshing, settleMutation]);

  const actions = useMemo(() => Object.freeze({
    onBack() {
      controller?.back();
    },
    onSelectView(nextView: NotificationInboxView) {
      if (
        nextView === activeView.current ||
        operation !== null ||
        refreshing ||
        loadingMore
      ) return;
      controller?.showView(nextView);
    },
    onRefresh() {
      if (operation !== null || loadingMore || refreshing) return;
      void refresh(activeView.current, { showLoading: false });
    },
    onLoadMore() {
      void loadMore();
    },
    onMarkRead(item: NotificationInboxItem) {
      if (item.readAt !== null || controller === null) return;
      void runMutation(item, "marking-read", () =>
        controller.markRead(item, scope));
    },
    onSetArchived(item: NotificationInboxItem, archived: boolean) {
      if (controller === null) return;
      void runMutation(item, archived ? "archiving" : "restoring", () =>
        controller.setArchived(item, archived, scope));
    },
    onOpenReference(item: NotificationInboxItem) {
      if (controller === null) return;
      const result = controller.openReference(item);
      if (result.status === "rejected") {
        setNotice(Object.freeze({
          kind: "safe",
          message: "该通知的业务引用不在安全白名单中，已拒绝跳转。",
        }));
      }
    },
    onDismissNotice() {
      setNotice(null);
    },
  }), [
    controller,
    loadMore,
    loadingMore,
    operation,
    refresh,
    refreshing,
    runMutation,
    scope,
  ]);

  let state: CustomerSliceState<CustomerNotificationTemplateReadyData>;
  if (routeInput === null) {
    state = {
      status: "error",
      errorCode: "invalid_notification_route",
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
          view,
          items,
          nextCursor,
          unreadCount,
          unreadCountUnavailable,
          refreshing,
          loadingMore,
          operation,
          notice,
        },
        actions,
      },
    };
  }

  return (
    <CustomerNotificationTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = NotificationCenterPage;
