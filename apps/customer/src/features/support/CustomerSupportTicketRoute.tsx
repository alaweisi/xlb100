import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  SupportCsat,
  SupportTicket,
  SupportTicketEvent,
  SupportTicketPriority,
  SupportTicketType,
} from "@xlb/types";
import {
  supportTicketPrioritySchema,
  supportTicketTypeSchema,
} from "@xlb/validators";
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
import { CustomerSupportTicketTemplate } from "./CustomerSupportTicketTemplate.js";
import {
  SupportTicketActionController,
  type CustomerSupportTicketNavigation,
  type SupportTicketActionResult,
} from "./SupportTicketActionController.js";
import {
  SupportTicketCoordinator,
  type CustomerSupportTicketScope,
  type SupportTicketListLoadResult,
} from "./SupportTicketCoordinator.js";
import {
  emptyCustomerSupportTicketDraft,
  isSafeCustomerSupportIdentifier,
  mergeSupportTicketPages,
  type CustomerSupportBusinessReferences,
  type CustomerSupportTicketDraft,
  type CustomerSupportTicketDraftErrors,
  type CustomerSupportTicketNotice,
  type CustomerSupportTicketOperation,
  type CustomerSupportTicketRouteInput,
  type CustomerSupportTicketTemplateReadyData,
} from "./supportTicketTypes.js";
import "./customer-support-ticket.css";

export const CUSTOMER_SUPPORT_TICKET_RETRY_EVENT =
  "xlb:customer-support-ticket-retry";

const SAFE_CURSOR = /^[A-Za-z0-9_-]{1,512}$/u;

type SupportPageFailure = Exclude<
  SupportTicketListLoadResult,
  { readonly status: "ready" }
>;

type SupportPageLoadResult =
  | { readonly status: "ready"; readonly view: "hub" }
  | { readonly status: "ready"; readonly view: "tickets" }
  | { readonly status: "ready"; readonly view: "detail" }
  | SupportPageFailure;

function changeBrowserRoute(path: string, replace = false): void {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerSupportTicketNavigation():
Readonly<CustomerSupportTicketNavigation> {
  return Object.freeze({
    back() {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      changeBrowserRoute("/", true);
    },
    openTickets(references: CustomerSupportBusinessReferences) {
      const query = new URLSearchParams();
      if (references.orderId !== null) {
        query.set("orderId", references.orderId);
      }
      if (references.complaintId !== null) {
        query.set("complaintId", references.complaintId);
      }
      const suffix = query.toString();
      changeBrowserRoute(`/support/tickets${suffix === "" ? "" : `?${suffix}`}`);
    },
    openTicket(ticketId: string) {
      changeBrowserRoute(`/support/tickets/${encodeURIComponent(ticketId)}`);
    },
  });
}

function parseReferences(
  query: Readonly<Record<string, string>>,
): CustomerSupportBusinessReferences | null {
  const orderId = query.orderId?.trim() ?? null;
  const complaintId = query.complaintId?.trim() ?? null;
  if (
    (orderId !== null && !isSafeCustomerSupportIdentifier(orderId)) ||
    (
      complaintId !== null &&
      !isSafeCustomerSupportIdentifier(complaintId)
    ) ||
    (complaintId !== null && orderId === null)
  ) {
    return null;
  }
  return Object.freeze({ orderId, complaintId });
}

export function parseCustomerSupportTicketRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerSupportTicketRouteInput | null {
  const pattern = route.pattern;
  if (pattern === "/support" || route.pathname === "/support") {
    const references = parseReferences(route.query);
    return references === null
      ? null
      : Object.freeze({ view: "hub", references });
  }
  if (
    pattern === "/support/tickets" ||
    route.pathname === "/support/tickets"
  ) {
    const references = parseReferences(route.query);
    const cursor = route.query.cursor?.trim() ?? null;
    if (
      references === null ||
      (cursor !== null && !SAFE_CURSOR.test(cursor))
    ) {
      return null;
    }
    return Object.freeze({ view: "tickets", references, cursor });
  }
  if (pattern === "/support/tickets/:ticketId") {
    const ticketId = route.params.ticketId?.trim() ?? "";
    return isSafeCustomerSupportIdentifier(ticketId)
      ? Object.freeze({ view: "detail", ticketId })
      : null;
  }
  return null;
}

function createDefaultCoordinator(
  cityCode: CityCode,
  shell: CustomerAppShellCoordinator,
): SupportTicketCoordinator {
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
  return new SupportTicketCoordinator(customerApi.forClient(client));
}

function readyScope(
  state: CustomerAppShellState,
): CustomerSupportTicketScope | null {
  if (
    state.status !== "ready" ||
    state.session === null ||
    state.cityCode === null
  ) {
    return null;
  }
  return Object.freeze({
    cityCode: state.cityCode,
    actorId: state.session.actor.userId,
  });
}

function recovery() {
  return Object.freeze({
    actionKey: CUSTOMER_SUPPORT_TICKET_RETRY_EVENT,
    labelKey: "重试",
  });
}

function boundaryState(
  result: SupportPageFailure,
): CustomerSliceState<CustomerSupportTicketTemplateReadyData> {
  switch (result.status) {
    case "error":
      return Object.freeze({
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
        recovery: result.retryable ? recovery() : null,
      });
    case "not_found":
      return Object.freeze({
        status: "unavailable",
        capability: "customer.support.tickets",
        reasonCode: "support_ticket_not_found",
        recovery: null,
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
        recovery: result.reasonCode === "support_ticket_access_unavailable"
          ? null
          : recovery(),
      });
  }
}

function initialScope(
  cityCode: CityCode | null | undefined,
  actorId: string | null | undefined,
): CustomerSupportTicketScope | null {
  return cityCode && actorId
    ? Object.freeze({ cityCode, actorId })
    : null;
}

export interface CustomerSupportTicketPageProps
  extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly actorId?: string | null;
  readonly coordinator?: SupportTicketCoordinator;
  readonly navigation?: CustomerSupportTicketNavigation;
  readonly shell?: CustomerAppShellCoordinator;
  readonly presentationPlan?: unknown;
  readonly onSessionExpired?: () => void;
}

export function CustomerSupportTicketPage({
  slice,
  route,
  cityCode: providedCityCode,
  actorId: providedActorId,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  shell: providedShell,
  presentationPlan = null,
  onSessionExpired,
}: CustomerSupportTicketPageProps) {
  const routeInput = useMemo(
    () => parseCustomerSupportTicketRoute(route),
    [route],
  );
  const runtime = useMemo(
    () => providedShell === undefined &&
        (providedCityCode === undefined || providedActorId === undefined)
      ? getCustomerBrowserEntryRuntime()
      : null,
    [providedActorId, providedCityCode, providedShell],
  );
  const shell = providedShell ?? runtime?.shell ?? null;
  const [scope, setScope] = useState<CustomerSupportTicketScope | null>(
    initialScope(providedCityCode, providedActorId),
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerSupportTicketNavigation(),
    [providedNavigation],
  );
  const coordinator = useMemo(
    () => providedCoordinator ??
      (scope === null || shell === null
        ? null
        : createDefaultCoordinator(scope.cityCode, shell)),
    [providedCoordinator, scope, shell],
  );
  const controller = useMemo(
    () => coordinator === null
      ? null
      : new SupportTicketActionController(coordinator, navigation),
    [coordinator, navigation],
  );

  const [loadResult, setLoadResult] =
    useState<SupportPageLoadResult | null>(null);
  const [tickets, setTickets] = useState<readonly SupportTicket[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    readonly ticket: SupportTicket;
    readonly events: readonly SupportTicketEvent[];
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [operation, setOperation] =
    useState<CustomerSupportTicketOperation | null>(null);
  const [notice, setNotice] = useState<CustomerSupportTicketNotice | null>(null);
  const [draft, setDraft] = useState<CustomerSupportTicketDraft>(
    emptyCustomerSupportTicketDraft(
      routeInput?.view === "hub" || routeInput?.view === "tickets"
        ? routeInput.references
        : undefined,
    ),
  );
  const [draftErrors, setDraftErrors] =
    useState<CustomerSupportTicketDraftErrors>({});
  const [comment, setComment] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [csatScore, setCsatScore] =
    useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [csatComment, setCsatComment] = useState("");
  const [csatReceipt, setCsatReceipt] = useState<SupportCsat | null>(null);
  const [csatServerDecided, setCsatServerDecided] = useState(false);
  const requestEpoch = useRef(0);

  const expireSession = useCallback(async () => {
    onSessionExpired?.();
    if (shell !== null) await shell.expireSession();
    window.dispatchEvent(new CustomEvent("xlb:customer-session-expired", {
      detail: Object.freeze({ returnUrl: route.pathname }),
    }));
  }, [onSessionExpired, route.pathname, shell]);

  useEffect(() => {
    if (scope !== null) return;
    if (
      providedCityCode !== undefined ||
      providedActorId !== undefined ||
      shell === null
    ) {
      setLoadResult(Object.freeze({
        status: "unavailable",
        capability: "customer.support.tickets",
        reasonCode: "support_ticket_access_unavailable",
      }));
      return;
    }
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
    scope,
    shell,
  ]);

  const applyFailure = useCallback(async (result: SupportPageFailure) => {
    setLoadResult(result);
    setTickets([]);
    setNextCursor(null);
    setDetail(null);
    if (result.status === "unauthenticated") await expireSession();
  }, [expireSession]);

  const refresh = useCallback(async (
    input: CustomerSupportTicketRouteInput,
    options: {
      readonly showLoading?: boolean;
      readonly finalNotice?: CustomerSupportTicketNotice | null;
    } = {},
  ) => {
    if (scope === null) return null;
    if (input.view === "hub") {
      setLoadResult(Object.freeze({ status: "ready", view: "hub" }));
      setTickets([]);
      setNextCursor(null);
      setDetail(null);
      setNotice(options.finalNotice ?? null);
      return Object.freeze({ status: "ready" as const, view: "hub" as const });
    }
    if (coordinator === null) {
      const unavailable = Object.freeze({
        status: "unavailable" as const,
        capability: "customer.support.tickets" as const,
        reasonCode: "support_ticket_api_unavailable" as const,
      });
      await applyFailure(unavailable);
      return unavailable;
    }

    const epoch = ++requestEpoch.current;
    if (options.showLoading ?? true) {
      setLoadResult(null);
    } else {
      setRefreshing(true);
    }
    setLoadingMore(false);
    const result = input.view === "tickets"
      ? await coordinator.loadList(scope, input.cursor)
      : await coordinator.loadDetail(input.ticketId, scope);
    if (epoch !== requestEpoch.current) return null;
    setRefreshing(false);

    if (result.status !== "ready") {
      await applyFailure(result);
      return result;
    }
    setNotice(options.finalNotice ?? null);
    if (input.view === "tickets" && "tickets" in result) {
      setLoadResult(Object.freeze({ status: "ready", view: "tickets" }));
      setTickets(result.tickets);
      setNextCursor(result.nextCursor);
      setDetail(null);
      return result;
    }
    if (input.view === "detail" && "ticket" in result) {
      setLoadResult(Object.freeze({ status: "ready", view: "detail" }));
      setTickets([]);
      setNextCursor(null);
      setDetail(Object.freeze({
        ticket: result.ticket,
        events: result.events,
      }));
      return result;
    }
    const invalid = Object.freeze({
      status: "error" as const,
      errorCode: "support_ticket_response_invalid" as const,
      retryable: false,
    });
    await applyFailure(invalid);
    return invalid;
  }, [applyFailure, coordinator, scope]);

  useEffect(() => {
    if (routeInput === null || scope === null) return;
    setDraftErrors({});
    if (routeInput.view === "hub" || routeInput.view === "tickets") {
      setDraft(emptyCustomerSupportTicketDraft(routeInput.references));
    }
    setComment("");
    setReopenReason("");
    setCsatScore(null);
    setCsatComment("");
    setCsatReceipt(null);
    setCsatServerDecided(false);
    void refresh(routeInput, { showLoading: true });
    const retry = () => void refresh(routeInput, { showLoading: true });
    window.addEventListener(CUSTOMER_SUPPORT_TICKET_RETRY_EVENT, retry);
    return () => {
      requestEpoch.current += 1;
      window.removeEventListener(CUSTOMER_SUPPORT_TICKET_RETRY_EVENT, retry);
    };
  }, [refresh, routeInput, scope]);

  const loadMore = useCallback(async () => {
    if (
      routeInput?.view !== "tickets" ||
      coordinator === null ||
      scope === null ||
      nextCursor === null ||
      loadingMore ||
      refreshing ||
      operation !== null
    ) {
      return;
    }
    const epoch = requestEpoch.current;
    setLoadingMore(true);
    const result = await coordinator.loadList(scope, nextCursor);
    if (epoch !== requestEpoch.current) return;
    setLoadingMore(false);
    if (result.status === "ready") {
      setTickets((current) => mergeSupportTicketPages(current, result.tickets));
      setNextCursor(result.nextCursor);
      return;
    }
    if (result.status === "unauthenticated") {
      await applyFailure(result);
      return;
    }
    setNotice(Object.freeze({
      kind: "error",
      message: result.status === "not_found"
        ? "更多工单无法读取，当前列表已保留。"
        : "更多工单加载失败，当前服务端列表未被覆盖。",
    }));
  }, [
    applyFailure,
    coordinator,
    loadingMore,
    nextCursor,
    operation,
    refreshing,
    routeInput,
    scope,
  ]);

  const settleMutation = useCallback(async (
    result: SupportTicketActionResult,
    completedOperation: CustomerSupportTicketOperation,
  ) => {
    if (result.status === "validation_error") {
      if (completedOperation === "creating") setDraftErrors(result.errors);
      setNotice(Object.freeze({ kind: "error", message: result.message }));
      return;
    }
    if (result.status === "success") {
      if (
        completedOperation === "creating" &&
        result.ticket !== null &&
        coordinator !== null &&
        scope !== null
      ) {
        const authoritative = await coordinator.loadDetail(
          result.ticket.ticketId,
          scope,
        );
        if (authoritative.status !== "ready") {
          if (authoritative.status === "unauthenticated") {
            await applyFailure(authoritative);
          } else {
            setNotice(Object.freeze({
              kind: "error",
              message: "工单已获服务端回执，但详情刷新未完成，请从列表重试。",
            }));
          }
          return;
        }
        navigation.openTicket(authoritative.ticket.ticketId);
        setNotice(Object.freeze({
          kind: "success",
          message: "工单已由服务端确认创建，并已刷新权威详情。",
        }));
        return;
      }
      if (completedOperation === "commenting") setComment("");
      if (completedOperation === "reopening") setReopenReason("");
      if (completedOperation === "rating" && result.csat !== null) {
        setCsatReceipt(result.csat);
      }
      if (routeInput !== null) {
        await refresh(routeInput, {
          showLoading: false,
          finalNotice: Object.freeze({
            kind: "success",
            message: completedOperation === "commenting"
              ? "留言已获服务端回执，并已刷新工单时间线。"
              : completedOperation === "reopening"
                ? "重开请求已获服务端回执，并已刷新工单状态。"
                : "评价已由服务端确认，工单详情已刷新。",
          }),
        });
      }
      return;
    }
    if (result.status === "conflict") {
      if (completedOperation === "rating") setCsatServerDecided(true);
      if (routeInput !== null) {
        await refresh(routeInput, {
          showLoading: false,
          finalNotice: Object.freeze({
            kind: "conflict",
            message: completedOperation === "rating"
              ? "服务端已裁决该工单的评价状态，不会重复提交。"
              : "工单已发生变化，页面已刷新服务端事实；上次写操作未被重放。",
          }),
        });
      }
      return;
    }
    if (result.status === "not_found") {
      await applyFailure(result);
      return;
    }
    if (result.status === "unauthenticated") {
      await applyFailure(result);
      return;
    }
    if (result.status === "unavailable") {
      await applyFailure(Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: "support_ticket_api_unavailable",
      }));
      return;
    }
    setNotice(Object.freeze({
      kind: "error",
      message: result.retryable
        ? "本次操作结果尚未确认，请刷新服务端事实后再试。"
        : "服务端未接受本次操作，请检查输入后重试。",
    }));
  }, [
    applyFailure,
    coordinator,
    navigation,
    refresh,
    routeInput,
    scope,
  ]);

  const runMutation = useCallback(async (
    nextOperation: CustomerSupportTicketOperation,
    task: () => Promise<SupportTicketActionResult>,
  ) => {
    if (operation !== null || refreshing || loadingMore) return;
    setOperation(nextOperation);
    setNotice(null);
    ++requestEpoch.current;
    const result = await task();
    setOperation(null);
    await settleMutation(result, nextOperation);
  }, [loadingMore, operation, refreshing, settleMutation]);

  const actions = useMemo(() => Object.freeze({
    onBack() {
      controller?.back();
    },
    onOpenTickets() {
      if (
        controller === null ||
        routeInput === null ||
        routeInput.view !== "hub"
      ) {
        return;
      }
      controller.openTickets(routeInput.references);
    },
    onOpenTicket(ticketId: string) {
      if (isSafeCustomerSupportIdentifier(ticketId)) {
        controller?.openTicket(ticketId);
      }
    },
    onRefresh() {
      if (
        routeInput !== null &&
        operation === null &&
        !loadingMore &&
        !refreshing
      ) {
        void refresh(routeInput, { showLoading: false });
      }
    },
    onLoadMore() {
      void loadMore();
    },
    onDraftChange(
      field: keyof CustomerSupportTicketDraft,
      value: string,
    ) {
      if (
        (field === "type" && !supportTicketTypeSchema.safeParse(value).success) ||
        (
          field === "priority" &&
          !supportTicketPrioritySchema.safeParse(value).success
        )
      ) {
        return;
      }
      setDraft((current) => Object.freeze({
        ...current,
        [field]: value as SupportTicketType | SupportTicketPriority | string,
      }));
      setDraftErrors((current) => Object.freeze({
        ...current,
        [field]: undefined,
      }));
    },
    onCreate() {
      if (controller !== null && scope !== null) {
        void runMutation("creating", () => controller.create(draft, scope));
      }
    },
    onCommentChange(value: string) {
      setComment(value);
    },
    onComment() {
      if (controller !== null && scope !== null && detail !== null) {
        void runMutation("commenting", () =>
          controller.comment(detail.ticket, comment, scope));
      }
    },
    onReopenReasonChange(value: string) {
      setReopenReason(value);
    },
    onReopen() {
      if (controller !== null && scope !== null && detail !== null) {
        void runMutation("reopening", () =>
          controller.reopen(detail.ticket, reopenReason, scope));
      }
    },
    onCsatScoreChange(score: 1 | 2 | 3 | 4 | 5) {
      setCsatScore(score);
    },
    onCsatCommentChange(value: string) {
      setCsatComment(value);
    },
    onSubmitCsat() {
      if (
        controller !== null &&
        scope !== null &&
        detail !== null &&
        !csatServerDecided &&
        csatReceipt === null
      ) {
        void runMutation("rating", () =>
          controller.submitCsat(
            detail.ticket,
            csatScore,
            csatComment,
            scope,
          ));
      }
    },
    onDismissNotice() {
      setNotice(null);
    },
  }), [
    comment,
    controller,
    csatComment,
    csatReceipt,
    csatScore,
    csatServerDecided,
    detail,
    draft,
    loadMore,
    loadingMore,
    operation,
    refresh,
    refreshing,
    reopenReason,
    routeInput,
    runMutation,
    scope,
  ]);

  let state: CustomerSliceState<CustomerSupportTicketTemplateReadyData>;
  if (routeInput === null) {
    state = Object.freeze({
      status: "error",
      errorCode: "invalid_support_ticket_route",
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
          tickets,
          nextCursor,
          detail,
          refreshing,
          loadingMore,
          operation,
          notice,
          draft,
          draftErrors,
          comment,
          reopenReason,
          csatScore,
          csatComment,
          csatReceipt,
          csatServerDecided,
        }),
        actions,
      }),
    });
  }

  return (
    <CustomerSupportTicketTemplate
      slice={slice}
      route={route}
      state={state}
      operationalManifest={presentationPlan}
    />
  );
}

export const RouteComponent = CustomerSupportTicketPage;
