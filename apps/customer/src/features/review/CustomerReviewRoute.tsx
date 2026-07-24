import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  CustomerOrderReviewView,
  KnownCityCode,
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
  getCustomerBrowserEntryRuntime,
} from "../shell/browserEntryRuntime.js";
import type {
  CustomerAppShellCoordinator,
  CustomerAppShellState,
} from "../shell/CustomerAppShellCoordinator.js";
import {
  CustomerReviewActionController,
  type CustomerReviewActionResult,
  type CustomerReviewNavigation,
} from "./CustomerReviewActionController.js";
import {
  CustomerReviewCoordinator,
  type CustomerReviewLoadResult,
} from "./CustomerReviewCoordinator.js";
import { CustomerReviewTemplate } from "./CustomerReviewTemplate.js";
import type {
  CustomerReviewDraft,
  CustomerReviewFieldErrors,
  CustomerReviewNotice,
  CustomerReviewOperation,
  CustomerReviewRouteInput,
  CustomerReviewTemplateReadyData,
} from "./reviewTypes.js";
import "./customer-review.css";

export const CUSTOMER_REVIEW_RETRY_EVENT = "xlb:customer-review-retry";

const SAFE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

function changeBrowserRoute(path: string, replace = false): void {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerReviewNavigation():
Readonly<CustomerReviewNavigation> {
  return Object.freeze({
    back() {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      changeBrowserRoute("/orders", true);
    },
    login() {
      changeBrowserRoute("/auth/login", true);
    },
    openAppeal(reviewId: string, orderId: string) {
      const query = new URLSearchParams({ orderId });
      changeBrowserRoute(
        `/reviews/${encodeURIComponent(reviewId)}/appeal?${query.toString()}`,
      );
    },
  });
}

export function parseCustomerReviewRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerReviewRouteInput | null {
  if (
    route.pattern === "/orders/:orderId/review" ||
    /^\/orders\/[^/]+\/review$/u.test(route.pathname)
  ) {
    const orderId = route.params.orderId?.trim();
    if (orderId === undefined || !SAFE_ENTITY_ID.test(orderId)) return null;
    return Object.freeze({
      kind: "order",
      orderId,
      reviewId: null,
    });
  }

  if (
    route.pattern === "/reviews/:reviewId/appeal" ||
    /^\/reviews\/[^/]+\/appeal$/u.test(route.pathname)
  ) {
    const reviewId = route.params.reviewId?.trim();
    if (reviewId === undefined || !SAFE_ENTITY_ID.test(reviewId)) return null;
    const orderIdValue = route.query.orderId?.trim();
    if (
      orderIdValue !== undefined &&
      !SAFE_ENTITY_ID.test(orderIdValue)
    ) return null;
    return Object.freeze({
      kind: "appeal",
      orderId: orderIdValue ?? null,
      reviewId,
    });
  }

  return null;
}

function defaultCoordinator(
  shell: CustomerAppShellCoordinator,
  cityCode: CityCode,
): CustomerReviewCoordinator {
  const client = createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    headers: () => {
      const token = shell.accessToken();
      return {
        "x-xlb-city-code": cityCode,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  });
  return new CustomerReviewCoordinator(customerApi.forClient(client));
}

function readyShellCity(state: CustomerAppShellState): KnownCityCode | null {
  return state.status === "ready" &&
      state.session !== null &&
      state.cityCode !== null
    ? state.cityCode
    : null;
}

function recovery() {
  return Object.freeze({
    actionKey: CUSTOMER_REVIEW_RETRY_EVENT,
    labelKey: "重新读取",
  });
}

function boundaryState(
  result: Exclude<CustomerReviewLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerReviewTemplateReadyData> {
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
    case "safe_not_found":
      return Object.freeze({
        status: "unavailable",
        capability: "customer.review",
        reasonCode: "review_not_accessible",
        recovery: null,
      });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: "review_api_unavailable",
        recovery: recovery(),
      });
  }
}

const EMPTY_DRAFT: CustomerReviewDraft = Object.freeze({
  rating: null,
  comment: "",
  appealReason: "",
});

export interface CustomerReviewPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly shell?: CustomerAppShellCoordinator;
  readonly cityCode?: CityCode | null;
  readonly coordinator?: CustomerReviewCoordinator;
  readonly navigation?: CustomerReviewNavigation;
  readonly onSessionExpired?: () => void;
}

export function CustomerReviewPage({
  slice,
  route,
  shell: providedShell,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: CustomerReviewPageProps) {
  const runtime = useMemo(
    () => providedShell === undefined
      ? getCustomerBrowserEntryRuntime()
      : null,
    [providedShell],
  );
  const shell = providedShell ?? runtime!.shell;
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerReviewNavigation(),
    [providedNavigation],
  );
  const routeInput = useMemo(() => parseCustomerReviewRoute(route), [route]);

  const [loadResult, setLoadResult] =
    useState<CustomerReviewLoadResult | null>(null);
  const [review, setReview] = useState<CustomerOrderReviewView | null>(null);
  const [activeCoordinator, setActiveCoordinator] =
    useState<CustomerReviewCoordinator | null>(providedCoordinator ?? null);
  const [draft, setDraft] = useState<CustomerReviewDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<CustomerReviewFieldErrors>({});
  const [operation, setOperation] =
    useState<CustomerReviewOperation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<CustomerReviewNotice | null>(null);
  const requestSequence = useRef(0);

  const expireSession = useCallback(async () => {
    onSessionExpired?.();
    if (onSessionExpired === undefined) {
      await shell.expireSession();
      navigation.login();
    }
  }, [navigation, onSessionExpired, shell]);

  const load = useCallback(async (
    showLoading = true,
  ): Promise<CustomerReviewLoadResult | null> => {
    if (routeInput === null) return null;
    if (routeInput.kind === "appeal" && routeInput.orderId === null) {
      const unavailable = Object.freeze({
        status: "unavailable" as const,
        capability: "customer.review" as const,
      });
      setReview(null);
      setLoadResult(unavailable);
      setRefreshing(false);
      return unavailable;
    }

    const request = ++requestSequence.current;
    if (showLoading) {
      setLoadResult(null);
      setReview(null);
    } else {
      setRefreshing(true);
    }
    setNotice(null);

    let cityCode = providedCityCode;
    if (cityCode === undefined) {
      let shellState = shell.snapshot();
      if (shellState.status !== "ready") shellState = await shell.restore();
      if (request !== requestSequence.current) return null;
      cityCode = readyShellCity(shellState);
    }
    if (cityCode === null) {
      setRefreshing(false);
      await expireSession();
      return null;
    }

    const coordinator = providedCoordinator ??
      defaultCoordinator(shell, cityCode);
    setActiveCoordinator(coordinator);
    const orderId = routeInput.orderId;
    if (orderId === null) return null;
    let result = await coordinator.load(orderId);
    if (request !== requestSequence.current) return null;

    if (
      result.status === "ready" &&
      routeInput.kind === "appeal" &&
      (result.review === null ||
        result.review.review.reviewId !== routeInput.reviewId)
    ) {
      result = Object.freeze({ status: "safe_not_found" });
    }

    setRefreshing(false);
    setLoadResult(result);
    if (result.status === "ready") {
      setReview(result.review);
    } else {
      setReview(null);
      if (result.status === "unauthenticated") await expireSession();
    }
    return result;
  }, [
    expireSession,
    providedCityCode,
    providedCoordinator,
    routeInput,
    shell,
  ]);

  useEffect(() => {
    void load(true);
    const retry = () => void load(true);
    window.addEventListener(CUSTOMER_REVIEW_RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(CUSTOMER_REVIEW_RETRY_EVENT, retry);
    };
  }, [load]);

  const controller = useMemo(
    () => activeCoordinator === null
      ? null
      : new CustomerReviewActionController(activeCoordinator, navigation),
    [activeCoordinator, navigation],
  );

  const authoritativeRefresh = useCallback(async (
    finalNotice: CustomerReviewNotice,
  ) => {
    const result = await load(false);
    if (result?.status === "ready") setNotice(finalNotice);
  }, [load]);

  const settleMutation = useCallback(async (
    result: CustomerReviewActionResult,
    completedOperation: CustomerReviewOperation,
  ) => {
    if (result.status === "success") {
      if (completedOperation === "creating-review") {
        setDraft(EMPTY_DRAFT);
      } else if (completedOperation === "appealing") {
        setDraft((current) => Object.freeze({
          ...current,
          appealReason: "",
        }));
      }
      await authoritativeRefresh(Object.freeze({
        kind: "success",
        message: completedOperation === "creating-review"
          ? "评价已由服务端确认，并已刷新审核可见性。"
          : completedOperation === "appealing"
            ? "申诉已由服务端确认，并已刷新申诉状态。"
            : "撤回已由服务端确认，并已刷新申诉状态。",
      }));
      return;
    }

    if (result.status === "unauthenticated") {
      setLoadResult(result);
      await expireSession();
      return;
    }
    if (result.status === "safe_not_found") {
      await authoritativeRefresh(Object.freeze({
        kind: "safe",
        message: "无法读取该评价，页面没有暴露资源归属信息。",
      }));
      return;
    }
    if (result.status === "unavailable") {
      setLoadResult(result);
      setReview(null);
      return;
    }
    if (result.status === "conflict") {
      if (result.reasonCode === "request_in_flight") {
        setNotice(Object.freeze({
          kind: "conflict",
          message: "已有评价操作正在提交，请等待服务端响应。",
        }));
        return;
      }
      await authoritativeRefresh(Object.freeze({
        kind: "conflict",
        message: "评价或申诉状态已变化，已刷新服务端最新事实。",
      }));
      return;
    }
    if (result.status === "validation_error") {
      if ("errors" in result) setErrors(result.errors);
      else {
        setNotice(Object.freeze({
          kind: "error",
          message: "服务端未接受本次输入，请检查后重试。",
        }));
      }
      return;
    }
    setNotice(Object.freeze({
      kind: "error",
      message: result.retryable
        ? "操作结果尚未确认，输入已保留，请刷新后再试。"
        : "服务端响应无法安全处理，请刷新后重试。",
    }));
  }, [authoritativeRefresh, expireSession]);

  const runMutation = useCallback(async (
    kind: CustomerReviewOperation,
    task: () => Promise<CustomerReviewActionResult>,
  ) => {
    if (operation !== null || refreshing) return;
    setOperation(kind);
    setErrors({});
    setNotice(null);
    requestSequence.current += 1;
    const result = await task();
    await settleMutation(result, kind);
    setOperation(null);
  }, [operation, refreshing, settleMutation]);

  const actions = useMemo(() => Object.freeze({
    onBack() {
      controller?.back();
    },
    onRefresh() {
      if (operation === null && !refreshing) void load(false);
    },
    onOpenAppeal() {
      if (controller !== null && review !== null) controller.openAppeal(review);
    },
    onRatingChange(rating: number) {
      if (operation !== null) return;
      setDraft((current) => Object.freeze({ ...current, rating }));
      setErrors((current) => Object.freeze({
        ...current,
        rating: undefined,
      }));
    },
    onCommentChange(comment: string) {
      if (operation !== null) return;
      setDraft((current) => Object.freeze({ ...current, comment }));
      setErrors((current) => Object.freeze({
        ...current,
        comment: undefined,
      }));
    },
    onAppealReasonChange(appealReason: string) {
      if (operation !== null) return;
      setDraft((current) => Object.freeze({ ...current, appealReason }));
      setErrors((current) => Object.freeze({
        ...current,
        appealReason: undefined,
      }));
    },
    onCreateReview() {
      if (
        controller === null ||
        routeInput?.kind !== "order" ||
        review !== null
      ) return;
      void runMutation("creating-review", () =>
        controller.createReview(
          routeInput.orderId,
          draft.rating,
          draft.comment,
        ));
    },
    onCreateAppeal() {
      if (
        controller === null ||
        routeInput?.kind !== "appeal" ||
        review === null
      ) return;
      void runMutation("appealing", () =>
        controller.createAppeal(
          routeInput.reviewId,
          review,
          draft.appealReason,
        ));
    },
    onWithdrawAppeal() {
      if (
        controller === null ||
        routeInput?.kind !== "appeal" ||
        review === null
      ) return;
      void runMutation("withdrawing", () =>
        controller.withdrawAppeal(routeInput.reviewId, review));
    },
    onDismissNotice() {
      setNotice(null);
    },
  }), [
    controller,
    draft,
    load,
    operation,
    refreshing,
    review,
    routeInput,
    runMutation,
  ]);

  let state: CustomerSliceState<CustomerReviewTemplateReadyData>;
  if (routeInput === null) {
    state = Object.freeze({
      status: "error",
      errorCode: "invalid_review_route",
      retryable: false,
      recovery: null,
    });
  } else if (
    routeInput.kind === "appeal" &&
    routeInput.orderId === null
  ) {
    state = Object.freeze({
      status: "unavailable",
      capability: "customer.review.by-id-read",
      reasonCode: "review_lookup_requires_order_id",
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
    state = Object.freeze({
      status: "ready",
      data: Object.freeze({
        viewModel: Object.freeze({
          routeInput,
          review,
          draft,
          errors,
          operation,
          refreshing,
          notice,
        }),
        actions,
      }),
    });
  }

  return (
    <CustomerReviewTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerReviewPage;
