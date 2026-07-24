import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  ComplaintCategory,
  ComplaintPriority,
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
  CustomerAftersaleActionController,
  type CustomerAftersaleActionResult,
  type CustomerAftersaleNavigation,
} from "./CustomerAftersaleActionController.js";
import { CustomerAftersaleCaseTemplate } from "./CustomerAftersaleCaseTemplate.js";
import {
  CustomerAftersaleCoordinator,
  type CustomerAftersaleDetailResult,
  type CustomerAftersaleListResult,
} from "./CustomerAftersaleCoordinator.js";
import {
  EMPTY_CUSTOMER_AFTERSALE_DRAFT,
  isSafeCustomerAftersaleIdentifier,
  type CustomerAftersaleComplaintDraft,
  type CustomerAftersaleDetailView,
  type CustomerAftersaleDraftErrors,
  type CustomerAftersaleNotice,
  type CustomerAftersaleOperation,
  type CustomerAftersaleRouteInput,
  type CustomerAftersaleScope,
  type CustomerAftersaleTemplateReadyData,
} from "./aftersaleTypes.js";
import "./customer-aftersale.css";

export const CUSTOMER_AFTERSALE_RETRY_EVENT = "xlb:customer-aftersale-retry";

type CustomerAftersaleLoadResult =
  | CustomerAftersaleListResult
  | CustomerAftersaleDetailResult;

function changeBrowserRoute(path: string, replace = false): void {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerAftersaleNavigation():
Readonly<CustomerAftersaleNavigation> {
  return Object.freeze({
    back() {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      changeBrowserRoute("/orders", true);
    },
    openComplaint(complaintId: string) {
      changeBrowserRoute(`/aftersale/${encodeURIComponent(complaintId)}`);
    },
  });
}

export function parseCustomerAftersaleRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerAftersaleRouteInput | null {
  if (route.pattern === "/orders/:orderId/aftersale") {
    const orderId = route.params.orderId?.trim() ?? "";
    return isSafeCustomerAftersaleIdentifier(orderId)
      ? Object.freeze({
          view: "order",
          orderId,
          complaintId: null,
        })
      : null;
  }
  if (route.pattern === "/aftersale/:complaintId") {
    const complaintId = route.params.complaintId?.trim() ?? "";
    return isSafeCustomerAftersaleIdentifier(complaintId)
      ? Object.freeze({
          view: "detail",
          orderId: null,
          complaintId,
        })
      : null;
  }
  return null;
}

function defaultCoordinator(
  shell: CustomerAppShellCoordinator,
  cityCode: CityCode,
): CustomerAftersaleCoordinator {
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
  return new CustomerAftersaleCoordinator(customerApi.forClient(client));
}

function readyScope(
  state: CustomerAppShellState,
): CustomerAftersaleScope | null {
  if (
    state.status !== "ready" ||
    state.session === null ||
    state.cityCode === null
  ) return null;
  return Object.freeze({
    cityCode: state.cityCode,
    actorId: state.session.actor.userId,
  });
}

function initialScope(
  cityCode: CityCode | null | undefined,
  actorId: string | null | undefined,
): CustomerAftersaleScope | null {
  return cityCode && actorId
    ? Object.freeze({ cityCode, actorId })
    : null;
}

function recovery() {
  return Object.freeze({
    actionKey: CUSTOMER_AFTERSALE_RETRY_EVENT,
    labelKey: "重新读取",
  });
}

function boundaryState(
  result: Exclude<
    CustomerAftersaleLoadResult,
    { readonly status: "ready" }
  >,
): CustomerSliceState<CustomerAftersaleTemplateReadyData> {
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
        capability: "customer.aftersale",
        reasonCode: "aftersale_not_accessible",
        recovery: null,
      });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: "aftersale_api_unavailable",
        recovery: recovery(),
      });
  }
}

export interface CustomerAftersalePageProps
  extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly actorId?: string | null;
  readonly coordinator?: CustomerAftersaleCoordinator;
  readonly navigation?: CustomerAftersaleNavigation;
  readonly shell?: CustomerAppShellCoordinator;
  readonly onSessionExpired?: () => void;
}

export function CustomerAftersalePage({
  slice,
  route,
  cityCode: providedCityCode,
  actorId: providedActorId,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  shell: providedShell,
  onSessionExpired,
}: CustomerAftersalePageProps) {
  const routeInput = useMemo(() => parseCustomerAftersaleRoute(route), [route]);
  const runtime = useMemo(
    () => providedShell === undefined &&
        (providedCityCode === undefined || providedActorId === undefined)
      ? getCustomerBrowserEntryRuntime()
      : null,
    [providedActorId, providedCityCode, providedShell],
  );
  const shell = providedShell ?? runtime?.shell ?? null;
  const providedScope = useMemo(
    () => initialScope(providedCityCode, providedActorId),
    [providedActorId, providedCityCode],
  );
  const [scope, setScope] = useState<CustomerAftersaleScope | null>(
    providedScope,
  );
  const effectiveScope = providedScope ?? scope;
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerAftersaleNavigation(),
    [providedNavigation],
  );
  const coordinator = useMemo(
    () => providedCoordinator ??
      (effectiveScope === null || shell === null
        ? null
        : defaultCoordinator(shell, effectiveScope.cityCode)),
    [effectiveScope, providedCoordinator, shell],
  );
  const controller = useMemo(
    () => coordinator === null
      ? null
      : new CustomerAftersaleActionController(coordinator, navigation),
    [coordinator, navigation],
  );

  const [loadResult, setLoadResult] =
    useState<CustomerAftersaleLoadResult | null>(null);
  const [complaints, setComplaints] = useState<
    CustomerAftersaleTemplateReadyData["viewModel"]["complaints"]
  >([]);
  const [detail, setDetail] =
    useState<CustomerAftersaleDetailView | null>(null);
  const [draft, setDraft] = useState<CustomerAftersaleComplaintDraft>(
    EMPTY_CUSTOMER_AFTERSALE_DRAFT,
  );
  const [draftErrors, setDraftErrors] =
    useState<CustomerAftersaleDraftErrors>({});
  const [note, setNote] = useState("");
  const [operation, setOperation] =
    useState<CustomerAftersaleOperation | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<CustomerAftersaleNotice | null>(null);
  const requestEpoch = useRef(0);

  const expireSession = useCallback(async () => {
    onSessionExpired?.();
    if (shell !== null) await shell.expireSession();
    window.dispatchEvent(new CustomEvent("xlb:customer-session-expired", {
      detail: Object.freeze({ returnUrl: route.pathname }),
    }));
  }, [onSessionExpired, route.pathname, shell]);

  useEffect(() => {
    if (providedScope !== null) return;
    if (
      providedCityCode !== undefined ||
      providedActorId !== undefined ||
      shell === null
    ) return;
    const epoch = ++requestEpoch.current;
    void (async () => {
      let state = shell.snapshot();
      if (state.status !== "ready") state = await shell.restore();
      if (epoch !== requestEpoch.current) return;
      const resolved = readyScope(state);
      if (resolved === null) {
        setLoadResult(Object.freeze({ status: "unauthenticated" }));
        await expireSession();
        return;
      }
      setScope(resolved);
    })();
  }, [
    expireSession,
    providedActorId,
    providedCityCode,
    providedScope,
    routeInput,
    shell,
  ]);

  const load = useCallback(async (
    showLoading = true,
  ): Promise<CustomerAftersaleLoadResult | null> => {
    if (
      routeInput === null ||
      effectiveScope === null ||
      coordinator === null
    ) {
      return null;
    }
    const epoch = ++requestEpoch.current;
    if (showLoading) {
      setLoadResult(null);
      setComplaints([]);
      setDetail(null);
    } else {
      setRefreshing(true);
    }
    setNotice(null);
    const result = routeInput.view === "order"
      ? await coordinator.loadList(routeInput.orderId, effectiveScope)
      : await coordinator.loadDetail(routeInput.complaintId, effectiveScope);
    if (epoch !== requestEpoch.current) return null;
    setRefreshing(false);
    setLoadResult(result);
    if (result.status === "ready") {
      if ("complaints" in result) {
        setComplaints(result.complaints);
        setDetail(null);
      } else {
        setComplaints([]);
        setDetail(result.detail);
      }
    } else {
      setComplaints([]);
      setDetail(null);
      if (result.status === "unauthenticated") await expireSession();
    }
    return result;
  }, [coordinator, effectiveScope, expireSession, routeInput]);

  useEffect(() => {
    if (routeInput === null) return;
    if (effectiveScope === null || coordinator === null) {
      if (
        providedCityCode !== undefined ||
        providedActorId !== undefined
      ) {
        setLoadResult(Object.freeze({
          status: "unavailable",
          capability: "customer.aftersale",
        }));
      }
      return;
    }
    void load(true);
    const retry = () => void load(true);
    window.addEventListener(CUSTOMER_AFTERSALE_RETRY_EVENT, retry);
    return () => {
      requestEpoch.current += 1;
      window.removeEventListener(CUSTOMER_AFTERSALE_RETRY_EVENT, retry);
    };
  }, [
    coordinator,
    load,
    providedActorId,
    providedCityCode,
    routeInput,
    effectiveScope,
  ]);

  const authoritativeRefresh = useCallback(async (
    nextNotice: CustomerAftersaleNotice,
  ) => {
    const result = await load(false);
    if (result?.status === "ready") setNotice(nextNotice);
  }, [load]);

  const settleMutation = useCallback(async (
    result: CustomerAftersaleActionResult,
    completedOperation: CustomerAftersaleOperation,
  ) => {
    if (result.status === "success") {
      if (completedOperation === "creating-complaint") {
        setDraft(EMPTY_CUSTOMER_AFTERSALE_DRAFT);
      } else {
        setNote("");
      }
      await authoritativeRefresh(Object.freeze({
        kind: "success",
        message: result.idempotent
          ? "服务端返回幂等重放回执，已重新读取正式售后事实。"
          : completedOperation === "creating-complaint"
            ? "投诉已由服务端确认，列表已按正式事实刷新。"
            : "备注已由服务端确认，详情已重新读取。",
      }));
      return;
    }
    if (result.status === "unauthenticated") {
      setLoadResult(result);
      await expireSession();
      return;
    }
    if (result.status === "safe_not_found") {
      setLoadResult(result);
      return;
    }
    if (result.status === "unavailable") {
      setLoadResult(result);
      return;
    }
    if (result.status === "conflict") {
      if (result.reasonCode === "request_in_flight") {
        setNotice(Object.freeze({
          kind: "conflict",
          message: "已有售后操作正在提交，请等待服务端响应。",
        }));
        return;
      }
      await authoritativeRefresh(Object.freeze({
        kind: "conflict",
        message: "服务端售后事实已变化，页面已权威刷新。",
      }));
      return;
    }
    if (result.status === "validation_error") {
      setDraftErrors("errors" in result ? result.errors : Object.freeze({
        description: "服务端未接受本次输入，请检查后重试。",
      }));
      return;
    }
    setNotice(Object.freeze({
      kind: "error",
      message: result.retryable
        ? "操作结果尚未确认，输入已保留，请刷新后重试。"
        : "服务端响应无法安全处理，请刷新后重试。",
    }));
  }, [authoritativeRefresh, expireSession]);

  const runMutation = useCallback(async (
    kind: CustomerAftersaleOperation,
    task: () => Promise<CustomerAftersaleActionResult>,
  ) => {
    if (operation !== null || refreshing) return;
    setOperation(kind);
    setDraftErrors({});
    setNotice(null);
    requestEpoch.current += 1;
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
    onOpenComplaint(complaintId: string) {
      controller?.openComplaint(complaintId);
    },
    onDraftChange(
      field: keyof CustomerAftersaleComplaintDraft,
      value: string,
    ) {
      if (operation !== null) return;
      if (field === "category") {
        setDraft((current) => Object.freeze({
          ...current,
          category: value as ComplaintCategory,
        }));
      } else if (field === "priority") {
        setDraft((current) => Object.freeze({
          ...current,
          priority: value as ComplaintPriority,
        }));
      } else {
        setDraft((current) => Object.freeze({
          ...current,
          description: value,
        }));
      }
      setDraftErrors((current) => Object.freeze({
        ...current,
        [field]: undefined,
      }));
    },
    onCreateComplaint() {
      if (
        controller === null ||
        effectiveScope === null ||
        routeInput?.view !== "order"
      ) return;
      void runMutation("creating-complaint", () =>
        controller.create(routeInput.orderId, draft, effectiveScope)
      );
    },
    onNoteChange(value: string) {
      if (operation === null) setNote(value);
    },
    onAddNote() {
      if (
        controller === null ||
        routeInput?.view !== "detail"
      ) return;
      void runMutation("adding-note", () =>
        controller.addNote(routeInput.complaintId, note)
      );
    },
    onDismissNotice() {
      setNotice(null);
    },
  }), [
    controller,
    draft,
    load,
    note,
    operation,
    refreshing,
    routeInput,
    runMutation,
    effectiveScope,
  ]);

  let state: CustomerSliceState<CustomerAftersaleTemplateReadyData>;
  if (routeInput === null) {
    state = Object.freeze({
      status: "error",
      errorCode: "invalid_aftersale_route",
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
    state = Object.freeze({
      status: "ready",
      data: Object.freeze({
        viewModel: Object.freeze({
          route: routeInput,
          complaints,
          detail,
          draft,
          draftErrors,
          note,
          operation,
          refreshing,
          notice,
        }),
        actions,
      }),
    });
  }

  return (
    <CustomerAftersaleCaseTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerAftersalePage;
