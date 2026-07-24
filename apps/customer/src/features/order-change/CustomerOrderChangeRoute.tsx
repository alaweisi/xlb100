import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  KnownCityCode,
  OrderReverseType,
  ScheduledTimeSlot,
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
  CustomerOrderChangeActionController,
  orderChangeEligibility,
  type CustomerOrderChangeActionResult,
  type CustomerOrderChangeNavigation,
} from "./OrderChangeActionController.js";
import {
  CustomerOrderChangeCoordinator,
  type CustomerOrderChangeLoadResult,
} from "./OrderChangeCoordinator.js";
import {
  CUSTOMER_ORDER_CHANGE_RETRY_EVENT,
  CustomerOrderChangeTemplate,
} from "./CustomerOrderChangeTemplate.js";
import type {
  CustomerOrderChangeAggregate,
  CustomerOrderChangeDraft,
  CustomerOrderChangeFieldErrors,
  CustomerOrderChangeNotice,
  CustomerOrderChangeRouteInput,
  CustomerOrderChangeTemplateData,
  CustomerOrderChangeTemplateState,
} from "./orderChangeTypes.js";
import "./order-change.css";

const SAFE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const REVERSE_TYPES = new Set<OrderReverseType>([
  "cancel",
  "reschedule",
  "reassign",
]);

type PageStatus = CustomerOrderChangeTemplateState["status"];

function changeBrowserRoute(path: string, replace = false): void {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerOrderChangeNavigation():
Readonly<CustomerOrderChangeNavigation> {
  return Object.freeze({
    back(orderId: string) {
      changeBrowserRoute(`/orders/${encodeURIComponent(orderId)}`);
    },
    login() {
      changeBrowserRoute("/auth/login", true);
    },
  });
}

export function parseCustomerOrderChangeRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerOrderChangeRouteInput | null {
  if (
    route.pattern !== "/orders/:orderId/change" &&
    !/^\/orders\/[^/]+\/change$/u.test(route.pathname)
  ) {
    return null;
  }
  const orderId = route.params.orderId?.trim();
  if (orderId === undefined || !SAFE_ENTITY_ID.test(orderId)) return null;
  const queryType = route.query.reverseType?.trim();
  if (
    queryType !== undefined &&
    !REVERSE_TYPES.has(queryType as OrderReverseType)
  ) {
    return null;
  }
  return Object.freeze({
    orderId,
    reverseType: queryType as OrderReverseType | undefined ?? null,
  });
}

function defaultDraft(
  reverseType: OrderReverseType | null,
): CustomerOrderChangeDraft {
  return Object.freeze({
    reverseType: reverseType ?? "cancel",
    reason: "",
    requestedScheduledAt: "",
    requestedTimeSlot: "morning",
  });
}

function defaultCoordinator(
  shell: CustomerAppShellCoordinator,
  cityCode: CityCode,
): CustomerOrderChangeCoordinator {
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
  return new CustomerOrderChangeCoordinator(customerApi.forClient(client));
}

function readyShellCity(state: CustomerAppShellState): KnownCityCode | null {
  return state.status === "ready" &&
      state.session !== null &&
      state.cityCode !== null
    ? state.cityCode
    : null;
}

function mapBoundary(
  result: Exclude<CustomerOrderChangeLoadResult, { readonly status: "ready" }>,
): PageStatus {
  switch (result.status) {
    case "forbidden_or_not_found":
      return "forbidden_or_not_found";
    case "unavailable":
      return "unavailable";
    case "unauthenticated":
      return "forbidden_or_not_found";
    case "error":
      return "error";
  }
}

export interface CustomerOrderChangePageProps
  extends CustomerFeatureRouteComponentProps {
  readonly shell?: CustomerAppShellCoordinator;
  readonly cityCode?: CityCode | null;
  readonly coordinator?: CustomerOrderChangeCoordinator;
  readonly navigation?: CustomerOrderChangeNavigation;
  readonly onSessionExpired?: () => void;
}

export function CustomerOrderChangePage({
  slice,
  route,
  shell: providedShell,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: CustomerOrderChangePageProps) {
  const runtime = useMemo(
    () => providedShell === undefined
      ? getCustomerBrowserEntryRuntime()
      : null,
    [providedShell],
  );
  const shell = providedShell ?? runtime!.shell;
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerOrderChangeNavigation(),
    [providedNavigation],
  );
  const routeInput = useMemo(
    () => parseCustomerOrderChangeRoute(route),
    [route],
  );
  const [aggregate, setAggregate] =
    useState<CustomerOrderChangeAggregate | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [draft, setDraft] = useState<CustomerOrderChangeDraft>(
    defaultDraft(routeInput?.reverseType ?? null),
  );
  const [errors, setErrors] = useState<CustomerOrderChangeFieldErrors>({});
  const [notice, setNotice] = useState<CustomerOrderChangeNotice>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCoordinator, setActiveCoordinator] =
    useState<CustomerOrderChangeCoordinator | null>(
      providedCoordinator ?? null,
    );
  const requestSequence = useRef(0);

  const expireSession = useCallback(async () => {
    onSessionExpired?.();
    if (onSessionExpired === undefined) {
      await shell.expireSession();
      navigation.login();
    }
  }, [navigation, onSessionExpired, shell]);

  const applyLoadResult = useCallback(async (
    result: CustomerOrderChangeLoadResult,
    nextNotice: CustomerOrderChangeNotice = null,
    conflict = false,
  ) => {
    setRefreshing(false);
    if (result.status === "ready") {
      setAggregate(result.aggregate);
      setNotice(nextNotice);
      setStatus(conflict
        ? "conflict"
        : result.aggregate.reverseRequests.length === 0
          ? "empty"
          : "ready");
      return;
    }
    setAggregate(null);
    setNotice(null);
    setStatus(mapBoundary(result));
    if (result.status === "unauthenticated") await expireSession();
  }, [expireSession]);

  const load = useCallback(async (
    showLoading = true,
  ): Promise<CustomerOrderChangeLoadResult | null> => {
    if (routeInput === null) {
      setStatus("forbidden_or_not_found");
      setAggregate(null);
      return null;
    }
    const request = ++requestSequence.current;
    if (showLoading) {
      setStatus("loading");
      setAggregate(null);
    } else {
      setRefreshing(true);
    }
    setNotice(null);
    setErrors({});

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
    const result = await coordinator.load(routeInput.orderId);
    if (request !== requestSequence.current) return null;
    await applyLoadResult(result);
    return result;
  }, [
    applyLoadResult,
    expireSession,
    providedCityCode,
    providedCoordinator,
    routeInput,
    shell,
  ]);

  useEffect(() => {
    setDraft(defaultDraft(routeInput?.reverseType ?? null));
    void load(true);
    const retry = () => void load(true);
    window.addEventListener(CUSTOMER_ORDER_CHANGE_RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(CUSTOMER_ORDER_CHANGE_RETRY_EVENT, retry);
    };
  }, [load, routeInput?.reverseType]);

  const controller = useMemo(
    () => activeCoordinator === null
      ? null
      : new CustomerOrderChangeActionController(
          activeCoordinator,
          navigation,
        ),
    [activeCoordinator, navigation],
  );

  const refreshAfterMutation = useCallback(async (
    nextNotice: NonNullable<CustomerOrderChangeNotice>,
    conflict: boolean,
  ) => {
    if (
      activeCoordinator === null ||
      routeInput === null
    ) return;
    setRefreshing(true);
    const result = await activeCoordinator.load(routeInput.orderId);
    await applyLoadResult(result, nextNotice, conflict);
  }, [activeCoordinator, applyLoadResult, routeInput]);

  const handleMutationResult = useCallback(async (
    result: CustomerOrderChangeActionResult,
  ) => {
    if (result.status === "success") {
      await refreshAfterMutation(Object.freeze({
        kind: "success",
        message: result.idempotent
          ? "服务端确认了同一申请，并已刷新订单与变更记录。"
          : "申请已由服务端接收，并已刷新订单与变更记录。",
      }), false);
      return;
    }
    if (result.status === "conflict") {
      if ("reasonCode" in result && result.reasonCode === "request_in_flight") {
        setStatus("submitting");
        return;
      }
      await refreshAfterMutation(Object.freeze({
        kind: "conflict",
        message: "订单或申请状态已变化，已刷新服务端最新事实。",
      }), true);
      return;
    }
    if (result.status === "validation_error") {
      setErrors("errors" in result ? result.errors : Object.freeze({
        reason: "服务端拒绝了当前输入，请检查后重试。",
      }));
      setStatus("validation_error");
      return;
    }
    if (result.status === "unauthenticated") {
      setStatus("forbidden_or_not_found");
      await expireSession();
      return;
    }
    if (result.status === "forbidden_or_not_found") {
      setAggregate(null);
      setStatus("forbidden_or_not_found");
      return;
    }
    if (result.status === "unavailable") {
      if (
        "reasonCode" in result &&
        result.reasonCode === "fulfillment_start_fact_missing"
      ) {
        setNotice(Object.freeze({
          kind: "conflict",
          message: "当前响应无法证明服务尚未开工，改期或改派保持关闭。",
        }));
        setStatus(aggregate?.reverseRequests.length === 0 ? "empty" : "ready");
        return;
      }
      setAggregate(null);
      setStatus("unavailable");
      return;
    }
    setAggregate(null);
    setStatus("error");
  }, [aggregate, expireSession, refreshAfterMutation]);

  const submit = useCallback(async () => {
    if (
      controller === null ||
      aggregate === null ||
      status === "submitting" ||
      refreshing
    ) return;
    setErrors({});
    setNotice(null);
    setStatus("submitting");
    const result = await controller.submit(aggregate.order, draft);
    await handleMutationResult(result);
  }, [
    aggregate,
    controller,
    draft,
    handleMutationResult,
    refreshing,
    status,
  ]);

  const actions = useMemo(() => Object.freeze({
    onBack: () => {
      if (routeInput !== null) {
        controller?.back(routeInput.orderId);
      }
    },
    onRefresh: () => void load(false),
    onSelectType: (reverseType: OrderReverseType) => {
      setDraft((current) => Object.freeze({ ...current, reverseType }));
      setErrors({});
      setNotice(null);
    },
    onReasonChange: (reason: string) => {
      setDraft((current) => Object.freeze({ ...current, reason }));
      setErrors((current) => Object.freeze({ ...current, reason: undefined }));
    },
    onScheduledAtChange: (requestedScheduledAt: string) => {
      setDraft((current) => Object.freeze({
        ...current,
        requestedScheduledAt,
      }));
    },
    onTimeSlotChange: (requestedTimeSlot: ScheduledTimeSlot) => {
      setDraft((current) => Object.freeze({
        ...current,
        requestedTimeSlot,
      }));
    },
    onSubmit: () => void submit(),
  }), [controller, load, routeInput, submit]);

  let templateState: CustomerOrderChangeTemplateState;
  if (routeInput === null) {
    templateState = Object.freeze({ status: "forbidden_or_not_found" });
  } else if (
    aggregate !== null &&
    ["ready", "empty", "submitting", "validation_error", "conflict"]
      .includes(status)
  ) {
    const data = Object.freeze({
      viewModel: Object.freeze({
        routeInput,
        aggregate,
        draft,
        errors,
        eligibility: orderChangeEligibility(aggregate.order),
        refreshing,
        notice,
      }),
      actions,
    }) satisfies CustomerOrderChangeTemplateData;
    templateState = Object.freeze({
      status: status as
        | "ready"
        | "empty"
        | "submitting"
        | "validation_error"
        | "conflict",
      data,
    });
  } else if (status === "error") {
    templateState = Object.freeze({
      status: "error",
      errorCode: "order_change_failed",
      retryable: true,
    });
  } else if (status === "unavailable") {
    templateState = Object.freeze({
      status: "unavailable",
      reasonCode: "order_change_api_unavailable",
      retryable: true,
    });
  } else if (status === "forbidden_or_not_found") {
    templateState = Object.freeze({ status: "forbidden_or_not_found" });
  } else {
    templateState = Object.freeze({ status: "loading" });
  }

  return (
    <CustomerOrderChangeTemplate
      slice={slice}
      route={route}
      state={templateState as unknown as CustomerSliceState}
    />
  );
}

export const RouteComponent = CustomerOrderChangePage;
