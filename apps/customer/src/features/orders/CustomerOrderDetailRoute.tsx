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
  CustomerOrderDetailActionController,
  isSafeCustomerOrderDetailId,
  type CustomerOrderDetailActionResult,
  type CustomerOrderDetailNavigation,
} from "./CustomerOrderDetailActionController.js";
import {
  CustomerOrderDetailCoordinator,
  type CustomerOrderDetailLoadResult,
} from "./CustomerOrderDetailCoordinator.js";
import { CustomerOrderDetailTemplate } from "./CustomerOrderDetailTemplate.js";
import {
  deriveCustomerOrderDetailAvailability,
  latestCustomerOrderDetailAggregate,
  type CustomerOrderDetailAction,
  type CustomerOrderDetailNotice,
  type CustomerOrderDetailRouteInput,
  type CustomerOrderDetailScope,
  type CustomerOrderDetailSubmission,
  type CustomerOrderDetailTemplateReadyData,
} from "./CustomerOrderDetailTypes.js";
import "./customer-order-detail.css";

export const CUSTOMER_ORDER_DETAIL_RETRY_EVENT =
  "xlb:customer-order-detail-retry";

function changeBrowserRoute(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerOrderDetailNavigation():
Readonly<CustomerOrderDetailNavigation> {
  return Object.freeze({
    backToOrders() {
      changeBrowserRoute("/orders");
    },
    openRoute(route: Parameters<CustomerOrderDetailNavigation["openRoute"]>[0]) {
      changeBrowserRoute(route);
    },
    focusEvidence() {
      const target = document.getElementById("customer-order-evidence");
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
      target?.focus({ preventScroll: true });
    },
  });
}

function defaultCoordinator(
  shell: CustomerAppShellCoordinator,
): CustomerOrderDetailCoordinator {
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
  return new CustomerOrderDetailCoordinator(customerApi.forClient(client));
}

export function parseCustomerOrderDetailRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerOrderDetailRouteInput | null {
  const orderId = route.params.orderId?.trim() ?? "";
  if (
    route.pattern !== "/orders/:orderId" ||
    route.pathname !== `/orders/${orderId}` ||
    Object.keys(route.params).length !== 1 ||
    Object.keys(route.query).length !== 0 ||
    !isSafeCustomerOrderDetailId(orderId)
  ) {
    return null;
  }
  return Object.freeze({ orderId });
}

function recovery() {
  return Object.freeze({
    actionKey: CUSTOMER_ORDER_DETAIL_RETRY_EVENT,
    labelKey: "重新读取",
  });
}

function boundaryState(
  result: Exclude<CustomerOrderDetailLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerOrderDetailTemplateReadyData> {
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
        recovery: result.reasonCode === "order_scope_unavailable"
          ? null
          : recovery(),
      });
  }
}

function readyShellScope(
  state: CustomerAppShellState,
): CustomerOrderDetailScope | null {
  return state.status === "ready" &&
      state.session !== null &&
      state.cityCode !== null
    ? Object.freeze({
        actorId: state.session.actor.userId,
        cityCode: state.cityCode,
      })
    : null;
}

function submissionFor(
  action: CustomerOrderDetailAction,
): CustomerOrderDetailSubmission | null {
  if (action === "confirm-service") return "confirming-service";
  if (
    action === "confirm-fulfillment" ||
    action === "dispute-fulfillment"
  ) {
    return "deciding-confirmation";
  }
  return null;
}

function rejectedNotice(
  result: Extract<
    CustomerOrderDetailActionResult,
    { readonly status: "rejected" }
  >,
): CustomerOrderDetailNotice {
  const messages = {
    action_unavailable: "刷新后的服务端事实不再允许此操作。",
    invalid_order_id: "订单标识无效，已拒绝操作。",
    invalid_complaint: "异议必须绑定刷新后仍属于本人同订单的正式投诉。",
    confirmation_note_required: "履约异议说明至少需要 2 个字。",
    payment_reference_unavailable:
      "当前没有可读取的正式 paymentOrderId，本页不会创建支付单或猜测支付路由。",
  };
  return Object.freeze({
    kind: "safe",
    message: messages[result.reasonCode],
  });
}

export interface CustomerOrderDetailPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly shell?: CustomerAppShellCoordinator;
  readonly scope?: CustomerOrderDetailScope;
  readonly coordinator?: CustomerOrderDetailCoordinator;
  readonly navigation?: CustomerOrderDetailNavigation;
  readonly onSessionExpired?: () => void;
}

export function CustomerOrderDetailPage({
  slice,
  route,
  shell: providedShell,
  scope: providedScope,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: CustomerOrderDetailPageProps) {
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
    () => providedNavigation ?? createBrowserCustomerOrderDetailNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => new CustomerOrderDetailActionController(navigation),
    [navigation],
  );
  const routeInput = useMemo(
    () => parseCustomerOrderDetailRoute(route),
    [route],
  );

  const [loadResult, setLoadResult] =
    useState<CustomerOrderDetailLoadResult | null>(null);
  const [selectedComplaintId, setSelectedComplaintId] =
    useState<string | null>(null);
  const [confirmationNote, setConfirmationNote] = useState("");
  const [submission, setSubmission] =
    useState<CustomerOrderDetailSubmission | null>(null);
  const [notice, setNotice] = useState<CustomerOrderDetailNotice | null>(null);
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

  const acceptLoad = useCallback(async (
    result: CustomerOrderDetailLoadResult,
  ) => {
    setLoadResult((current) => {
      if (
        current?.status === "ready" &&
        result.status === "ready"
      ) {
        return Object.freeze({
          status: "ready",
          aggregate: latestCustomerOrderDetailAggregate(
            current.aggregate,
            result.aggregate,
          ),
        });
      }
      return result;
    });
    if (result.status === "ready") {
      const complaints = result.aggregate.complaints;
      setSelectedComplaintId((current) =>
        complaints.status === "ready" &&
          complaints.data.some((item) => item.complaintId === current)
          ? current
          : null
      );
    }
    if (result.status === "unauthenticated") await expireSession();
  }, [expireSession]);

  const load = useCallback(async (showLoading: boolean) => {
    const sequence = ++requestSequence.current;
    setNotice(null);
    setSubmission(null);
    if (showLoading) {
      setLoadResult(null);
      setSelectedComplaintId(null);
      setConfirmationNote("");
    }
    if (routeInput === null) return;
    const scope = await resolveScope();
    if (sequence !== requestSequence.current) return;
    if (scope === null || coordinator === null) {
      await acceptLoad(Object.freeze({
        status: "unavailable",
        capability: "customer.order-detail",
        reasonCode: "order_scope_unavailable",
      }));
      return;
    }
    const scopeKey = [
      scope.actorId,
      scope.cityCode,
      route.pathname,
      routeInput.orderId,
    ].join(":");
    activeScopeKey.current = scopeKey;
    const result = await coordinator.loadAggregate(scope, routeInput.orderId);
    if (
      sequence !== requestSequence.current ||
      activeScopeKey.current !== scopeKey
    ) {
      return;
    }
    await acceptLoad(result);
  }, [
    acceptLoad,
    coordinator,
    resolveScope,
    route.pathname,
    routeInput,
  ]);

  useEffect(() => {
    if (routeInput === null) return;
    void load(true);
    const retry = () => void load(true);
    window.addEventListener(CUSTOMER_ORDER_DETAIL_RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(CUSTOMER_ORDER_DETAIL_RETRY_EVENT, retry);
    };
  }, [load, routeInput]);

  const runAction = useCallback(async (
    action: CustomerOrderDetailAction,
  ) => {
    if (
      routeInput === null ||
      coordinator === null ||
      submission !== null
    ) return;
    const scope = await resolveScope();
    if (scope === null) {
      setNotice(Object.freeze({
        kind: "safe",
        message: "当前身份或城市作用域不可用，已拒绝操作。",
      }));
      return;
    }
    const scopeKey = [
      scope.actorId,
      scope.cityCode,
      route.pathname,
      routeInput.orderId,
    ].join(":");
    const sequence = requestSequence.current;
    const nextSubmission = submissionFor(action);
    setSubmission(nextSubmission);
    setNotice(null);
    const result = await controller.execute(
      action,
      scope,
      routeInput.orderId,
      coordinator,
      {
        complaintId: selectedComplaintId,
        note: confirmationNote,
      },
    );
    if (
      sequence !== requestSequence.current ||
      activeScopeKey.current !== scopeKey
    ) {
      return;
    }
    setSubmission(null);
    if (result.status === "duplicate") return;
    if (result.status === "rejected") {
      if (result.load !== null) await acceptLoad(result.load);
      setNotice(rejectedNotice(result));
      return;
    }
    if (result.status === "refresh-failed") {
      await acceptLoad(result.load);
      return;
    }
    if (result.status === "focused" || result.status === "navigated") {
      await acceptLoad(result.load);
      return;
    }

    if (!("mutation" in result)) return;
    const mutation = result.mutation;
    if (mutation.status === "confirmed") {
      await acceptLoad(mutation.load);
      setConfirmationNote("");
      setNotice(Object.freeze({
        kind: "success",
        message: mutation.idempotent
          ? "服务端确认这是重复决定，已读取权威事实。"
          : "服务端已确认操作，并已重新读取订单详情。",
      }));
      return;
    }
    if (mutation.status === "conflict") {
      await acceptLoad(mutation.load);
      setNotice(Object.freeze({
        kind: "conflict",
        message: "服务端事实已变化；页面未在本地改状态，已权威刷新。",
      }));
      return;
    }
    if (mutation.status === "unauthenticated") {
      await expireSession();
      setLoadResult(Object.freeze({ status: "unauthenticated" }));
      return;
    }
    setNotice(Object.freeze({
      kind: mutation.status === "unavailable" ? "safe" : "error",
      message: mutation.status === "unavailable"
        ? "操作目标无法安全访问；不会透露其是否存在或属于他人。"
        : mutation.retryable
          ? "操作未获服务端确认，可刷新后重试。"
          : "操作响应无法安全确认；页面没有修改本地业务状态。",
    }));
  }, [
    acceptLoad,
    confirmationNote,
    controller,
    coordinator,
    expireSession,
    resolveScope,
    route.pathname,
    routeInput,
    selectedComplaintId,
    submission,
  ]);

  let state: CustomerSliceState<CustomerOrderDetailTemplateReadyData>;
  if (routeInput === null) {
    state = Object.freeze({
      status: "error",
      errorCode: "invalid_order_detail_route",
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
    const aggregate = loadResult.aggregate;
    state = Object.freeze({
      status: "ready",
      data: Object.freeze({
        viewModel: Object.freeze({
          aggregate,
          availability: deriveCustomerOrderDetailAvailability(aggregate),
          selectedComplaintId,
          confirmationNote,
          submission,
          notice,
        }),
        actions: Object.freeze({
          onBack() {
            controller.backToOrders();
          },
          onRefresh() {
            if (submission === null) void load(false);
          },
          onAction(action: CustomerOrderDetailAction) {
            void runAction(action);
          },
          onSelectComplaint(complaintId: string) {
            if (submission !== null) return;
            const complaints = aggregate.complaints;
            if (
              complaints.status === "ready" &&
              complaints.data.some((item) => item.complaintId === complaintId)
            ) {
              setSelectedComplaintId(complaintId);
            }
          },
          onChangeConfirmationNote(note: string) {
            if (submission === null) setConfirmationNote(note.slice(0, 500));
          },
          onDismissNotice() {
            setNotice(null);
          },
        }),
      }),
    });
  }

  return (
    <CustomerOrderDetailTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerOrderDetailPage;
