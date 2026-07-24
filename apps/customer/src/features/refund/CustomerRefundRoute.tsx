import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
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
import { getCustomerBrowserEntryRuntime } from "../shell/browserEntryRuntime.js";
import type {
  CustomerAppShellCoordinator,
  CustomerAppShellState,
} from "../shell/CustomerAppShellCoordinator.js";
import {
  CustomerRefundActionController,
  refundEligibility,
  type CustomerRefundActionResult,
  type CustomerRefundNavigation,
} from "./CustomerRefundActionController.js";
import {
  CustomerRefundCoordinator,
  isSafeCustomerRefundOrderId,
  type CustomerRefundLoadResult,
} from "./CustomerRefundCoordinator.js";
import {
  CUSTOMER_REFUND_RETRY_EVENT,
  CustomerRefundTemplate,
} from "./CustomerRefundTemplate.js";
import type {
  CustomerRefundDataStatus,
  CustomerRefundFieldErrors,
  CustomerRefundResult,
  CustomerRefundRouteInput,
  CustomerRefundScope,
  CustomerRefundTemplateData,
  CustomerRefundTemplateState,
} from "./refundTypes.js";
import "./customer-refund.css";

function changeBrowserRoute(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerRefundNavigation():
Readonly<CustomerRefundNavigation> {
  return Object.freeze({
    backToOrder(orderId: string) {
      changeBrowserRoute(`/orders/${encodeURIComponent(orderId)}`);
    },
  });
}

export function parseCustomerRefundRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerRefundRouteInput | null {
  const orderId = route.params.orderId?.trim() ?? "";
  if (
    route.pattern !== "/orders/:orderId/refund" ||
    route.pathname !== `/orders/${orderId}/refund` ||
    Object.keys(route.params).length !== 1 ||
    Object.keys(route.query).length !== 0 ||
    !isSafeCustomerRefundOrderId(orderId)
  ) {
    return null;
  }
  return Object.freeze({ orderId });
}

function defaultCoordinator(
  shell: CustomerAppShellCoordinator,
): CustomerRefundCoordinator {
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
  return new CustomerRefundCoordinator(customerApi.forClient(client));
}

function readyShellScope(
  state: CustomerAppShellState,
): CustomerRefundScope | null {
  return state.status === "ready" &&
      state.session !== null &&
      state.cityCode !== null
    ? Object.freeze({
        actorId: state.session.actor.userId,
        cityCode: state.cityCode,
      })
    : null;
}

function boundaryStatus(
  result: Exclude<CustomerRefundLoadResult, { readonly status: "ready" }>,
): CustomerRefundTemplateState {
  switch (result.status) {
    case "unauthenticated":
    case "forbidden_or_not_found":
      return Object.freeze({ status: "forbidden_or_not_found" });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        reasonCode: "refund_api_unavailable",
        retryable: true,
      });
    case "error":
      return Object.freeze({
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
      });
  }
}

export interface CustomerRefundPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly shell?: CustomerAppShellCoordinator | null;
  readonly scope?: CustomerRefundScope | null;
  readonly coordinator?: CustomerRefundCoordinator;
  readonly navigation?: CustomerRefundNavigation;
  readonly onSessionExpired?: () => void;
}

export function CustomerRefundPage({
  slice,
  route,
  shell: providedShell,
  scope: providedScope,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: CustomerRefundPageProps) {
  const runtime = useMemo(
    () => providedShell === undefined
      ? getCustomerBrowserEntryRuntime()
      : null,
    [providedShell],
  );
  const shell = providedShell === undefined ? runtime!.shell : providedShell;
  const coordinator = useMemo(
    () => providedCoordinator ??
      (shell === null ? null : defaultCoordinator(shell)),
    [providedCoordinator, shell],
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerRefundNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => coordinator === null
      ? null
      : new CustomerRefundActionController(coordinator, navigation),
    [coordinator, navigation],
  );
  const routeInput = useMemo(
    () => parseCustomerRefundRoute(route),
    [route],
  );

  const [scope, setScope] = useState<CustomerRefundScope | null>(
    providedScope ?? null,
  );
  const [order, setOrder] = useState<
    Extract<CustomerRefundLoadResult, { readonly status: "ready" }>["order"] |
      null
  >(null);
  const [pageState, setPageState] = useState<CustomerRefundTemplateState>(
    Object.freeze({ status: "order-loading" }),
  );
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<CustomerRefundFieldErrors>({});
  const [result, setResult] = useState<CustomerRefundResult | null>(null);
  const [idempotent, setIdempotent] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeScopeKey = useRef<string | null>(null);

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

  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setOrder(null);
    setResult(null);
    setIdempotent(null);
    setNotice(null);
    setErrors({});
    setPageState(Object.freeze({ status: "order-loading" }));
    if (routeInput === null) {
      setPageState(Object.freeze({ status: "forbidden_or_not_found" }));
      return;
    }

    const nextScope = await resolveScope();
    if (sequence !== requestSequence.current) return;
    if (nextScope === null || coordinator === null) {
      setScope(null);
      setPageState(Object.freeze({
        status: "unavailable",
        reasonCode: "refund_scope_unavailable",
        retryable: true,
      }));
      return;
    }

    const scopeKey = [
      nextScope.actorId,
      nextScope.cityCode,
      route.pathname,
      routeInput.orderId,
    ].join(":");
    setScope(nextScope);
    activeScopeKey.current = scopeKey;
    const loadResult = await coordinator.loadOrder(
      nextScope,
      routeInput.orderId,
    );
    if (
      sequence !== requestSequence.current ||
      activeScopeKey.current !== scopeKey
    ) {
      return;
    }
    if (loadResult.status === "ready") {
      setOrder(loadResult.order);
      setPageState(Object.freeze({
        status: "eligibility-checking",
        data: null as never,
      }));
      return;
    }
    setPageState(boundaryStatus(loadResult));
    if (loadResult.status === "unauthenticated") await expireSession();
  }, [
    coordinator,
    expireSession,
    resolveScope,
    route.pathname,
    routeInput,
  ]);

  useEffect(() => {
    void load();
    const retry = () => void load();
    window.addEventListener(CUSTOMER_REFUND_RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(CUSTOMER_REFUND_RETRY_EVENT, retry);
    };
  }, [load]);

  const refreshConflictOrder = useCallback(async (
    activeScope: CustomerRefundScope,
    sequence: number,
  ) => {
    if (coordinator === null || routeInput === null) return;
    const refreshed = await coordinator.loadOrder(
      activeScope,
      routeInput.orderId,
    );
    if (sequence !== requestSequence.current) return;
    if (refreshed.status === "ready") {
      setOrder(refreshed.order);
      setNotice(
        "服务端拒绝了本次申请；已重新读取订单，但 Customer 没有退款查询 API。",
      );
      setPageState(Object.freeze({ status: "conflict", data: null as never }));
      return;
    }
    setOrder(null);
    setPageState(boundaryStatus(refreshed));
    if (refreshed.status === "unauthenticated") await expireSession();
  }, [coordinator, expireSession, routeInput]);

  const handleMutation = useCallback(async (
    mutation: CustomerRefundActionResult,
    activeScope: CustomerRefundScope,
    sequence: number,
  ) => {
    if (sequence !== requestSequence.current) return;
    if (mutation.status === "success") {
      setResult(mutation.refund);
      setIdempotent(mutation.idempotent);
      setNotice(null);
      setPageState(Object.freeze({
        status: "limited-result",
        data: null as never,
      }));
      return;
    }
    if (mutation.status === "validation_error") {
      setErrors("errors" in mutation
        ? mutation.errors
        : Object.freeze({
            reason: "服务端拒绝了当前原因，请检查后重试。",
          }));
      setPageState(Object.freeze({
        status: "validation_error",
        data: null as never,
      }));
      return;
    }
    if (mutation.status === "conflict") {
      if (
        "reasonCode" in mutation &&
        mutation.reasonCode === "request_in_flight"
      ) {
        setPageState(Object.freeze({
          status: "requesting",
          data: null as never,
        }));
        return;
      }
      await refreshConflictOrder(activeScope, sequence);
      return;
    }
    if (mutation.status === "unauthenticated") {
      setOrder(null);
      setPageState(Object.freeze({ status: "forbidden_or_not_found" }));
      await expireSession();
      return;
    }
    if (mutation.status === "forbidden_or_not_found") {
      setOrder(null);
      setPageState(Object.freeze({ status: "forbidden_or_not_found" }));
      return;
    }
    if (mutation.status === "unavailable") {
      setPageState(Object.freeze({
        status: "unavailable",
        reasonCode: "refund_request_unavailable",
        retryable: true,
      }));
      return;
    }
    setPageState(Object.freeze({
      status: "error",
      errorCode: mutation.errorCode,
      retryable: mutation.retryable,
    }));
  }, [expireSession, refreshConflictOrder]);

  const submit = useCallback(async () => {
    if (
      controller === null ||
      routeInput === null ||
      scope === null ||
      order === null ||
      pageState.status === "requesting" ||
      pageState.status === "limited-result"
    ) {
      return;
    }
    const sequence = ++requestSequence.current;
    setErrors({});
    setNotice(null);
    setPageState(Object.freeze({ status: "requesting", data: null as never }));
    const mutation = await controller.submit(scope, order, reason);
    await handleMutation(mutation, scope, sequence);
  }, [
    controller,
    handleMutation,
    order,
    pageState.status,
    reason,
    routeInput,
    scope,
  ]);

  const actions = useMemo(() => Object.freeze({
    onBack: () => {
      if (routeInput !== null) controller?.back(routeInput.orderId);
    },
    onRetry: () => void load(),
    onReasonChange: (nextReason: string) => {
      setReason(nextReason);
      setErrors({});
      if (order !== null && pageState.status === "validation_error") {
        setPageState(Object.freeze({
          status: "eligibility-checking",
          data: null as never,
        }));
      }
    },
    onSubmit: () => void submit(),
  }), [controller, load, order, pageState.status, routeInput, submit]);

  let templateState: CustomerRefundTemplateState;
  if (routeInput === null) {
    templateState = Object.freeze({ status: "forbidden_or_not_found" });
  } else if (
    order !== null &&
    scope !== null &&
    [
      "eligibility-checking",
      "requesting",
      "validation_error",
      "conflict",
      "limited-result",
    ].includes(pageState.status)
  ) {
    const data = Object.freeze({
      viewModel: Object.freeze({
        routeInput,
        scope,
        order,
        reason,
        errors,
        eligibility: refundEligibility(order),
        result,
        idempotent,
        notice,
      }),
      actions,
    }) satisfies CustomerRefundTemplateData;
    templateState = Object.freeze({
      status: pageState.status as CustomerRefundDataStatus,
      data,
    });
  } else if ("data" in pageState) {
    // Data states are never rendered without the already scope-checked order.
    templateState = Object.freeze({ status: "order-loading" });
  } else {
    templateState = pageState;
  }

  return (
    <CustomerRefundTemplate
      slice={slice}
      route={route}
      state={templateState as unknown as CustomerSliceState}
    />
  );
}

export const RouteComponent = CustomerRefundPage;
