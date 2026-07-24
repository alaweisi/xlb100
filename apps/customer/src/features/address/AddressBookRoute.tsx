import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CustomerAddress,
  CityCode,
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
  AddressBookActionController,
  createAddressIdempotencyKey,
} from "./AddressBookActionController.js";
import {
  AddressBookCoordinator,
  type AddressBookLoadResult,
  type AddressMutationResult,
} from "./AddressBookCoordinator.js";
import { CustomerAddressBookTemplate } from "./CustomerAddressBookTemplate.js";
import {
  EMPTY_ADDRESS_DRAFT,
  addressDraftFrom,
  type CustomerAddressBookRouteInput,
  type CustomerAddressBookTemplateReadyData,
  type CustomerAddressBookView,
  type CustomerAddressFormDraft,
} from "./addressBookTypes.js";
import "./address-book.css";

export const ADDRESS_BOOK_RETRY_EVENT = "xlb:customer-addresses-retry";
export const ADDRESS_BOOK_OPEN_NEW_EVENT = "xlb:customer-addresses-open-new";
export const CUSTOMER_ADDRESS_SELECTED_EVENT = "xlb:customer-address-selected";

const SAFE_ADDRESS_ID = /^[A-Za-z0-9_-]{1,128}$/u;

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

export interface CustomerAddressNavigation {
  back(): void;
  openList(pickerMode: boolean): void;
  openNew(pickerMode: boolean): void;
  openEdit(addressId: string, pickerMode: boolean): void;
  selectAddress(addressId: string): void;
}

export function createBrowserCustomerAddressNavigation(): CustomerAddressNavigation {
  const pickerSuffix = (pickerMode: boolean) => pickerMode ? "?mode=picker" : "";
  return Object.freeze({
    back() {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }
      changeBrowserRoute("/profile", true);
    },
    openList(pickerMode: boolean) {
      changeBrowserRoute(`/profile/addresses${pickerSuffix(pickerMode)}`);
    },
    openNew(pickerMode: boolean) {
      changeBrowserRoute(`/profile/addresses/new${pickerSuffix(pickerMode)}`);
    },
    openEdit(addressId: string, pickerMode: boolean) {
      changeBrowserRoute(
        `/profile/addresses/${encodeURIComponent(addressId)}/edit${pickerSuffix(pickerMode)}`,
      );
    },
    selectAddress(addressId: string) {
      window.dispatchEvent(new CustomEvent(CUSTOMER_ADDRESS_SELECTED_EVENT, {
        detail: Object.freeze({ addressId }),
      }));
      this.back();
    },
  });
}

function createDefaultCoordinator(cityCode: CityCode): AddressBookCoordinator {
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
  return new AddressBookCoordinator(customerApi.forClient(client));
}

export function parseCustomerAddressBookRoute(
  route: CustomerFeatureRouteComponentProps["route"],
): CustomerAddressBookRouteInput | null {
  const pickerMode = route.query.mode === "picker";
  if (
    route.pattern === "/profile/addresses" ||
    route.pathname === "/profile/addresses"
  ) {
    return Object.freeze({ view: "list", addressId: null, pickerMode });
  }
  if (
    route.pattern === "/profile/addresses/new" ||
    route.pathname === "/profile/addresses/new"
  ) {
    return Object.freeze({ view: "new", addressId: null, pickerMode });
  }
  if (
    route.pattern === "/profile/addresses/:addressId/edit" ||
    route.pathname.endsWith("/edit")
  ) {
    const addressId = route.params.addressId?.trim() ?? "";
    if (!SAFE_ADDRESS_ID.test(addressId)) return null;
    return Object.freeze({ view: "edit", addressId, pickerMode });
  }
  return null;
}

function recovery(actionKey = ADDRESS_BOOK_RETRY_EVENT, labelKey = "重试") {
  return Object.freeze({ actionKey, labelKey });
}

function boundaryState(
  result: Exclude<AddressBookLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerAddressBookTemplateReadyData> {
  switch (result.status) {
    case "empty":
      return Object.freeze({
        status: "empty",
        reasonCode: result.reasonCode,
        recovery: recovery(ADDRESS_BOOK_OPEN_NEW_EVENT, "新增地址"),
      });
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
        recovery: recovery(),
      });
  }
}

export interface AddressBookPageProps extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly coordinator?: AddressBookCoordinator;
  readonly navigation?: CustomerAddressNavigation;
  readonly onSessionExpired?: () => void;
}

export function AddressBookPage({
  slice,
  route,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  onSessionExpired,
}: AddressBookPageProps) {
  const cityCode = providedCityCode === undefined
    ? storageValue("xlb.customer.cityCode") as CityCode | null
    : providedCityCode;
  const routeInput = useMemo(() => parseCustomerAddressBookRoute(route), [route]);
  const coordinator = useMemo(
    () => providedCoordinator ?? (cityCode === null
      ? null
      : createDefaultCoordinator(cityCode)),
    [cityCode, providedCoordinator],
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerAddressNavigation(),
    [providedNavigation],
  );
  const controller = useMemo(
    () => coordinator === null ? null : new AddressBookActionController(coordinator),
    [coordinator],
  );
  const [loadResult, setLoadResult] = useState<AddressBookLoadResult | null>(null);
  const [addresses, setAddresses] = useState<readonly CustomerAddress[]>([]);
  const [view, setView] = useState<CustomerAddressBookView>(
    routeInput?.view ?? "list",
  );
  const [activeAddressId, setActiveAddressId] = useState<string | null>(
    routeInput?.addressId ?? null,
  );
  const [draft, setDraft] = useState<CustomerAddressFormDraft>(
    EMPTY_ADDRESS_DRAFT,
  );
  const [errors, setErrors] = useState<CustomerAddressBookTemplateReadyData["viewModel"]["errors"]>({});
  const [submitting, setSubmitting] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [notice, setNotice] = useState<CustomerAddressBookTemplateReadyData["viewModel"]["notice"]>(null);
  const requestSequence = useRef(0);
  const idempotencyKey = useRef(createAddressIdempotencyKey());

  const expireSession = useCallback(() => {
    onSessionExpired?.();
    window.dispatchEvent(new CustomEvent("xlb:customer-session-expired", {
      detail: Object.freeze({ returnUrl: route.pathname }),
    }));
  }, [onSessionExpired, route.pathname]);

  const load = useCallback(async (showLoading = true) => {
    if (cityCode === null || coordinator === null) {
      setLoadResult(Object.freeze({
        status: "unavailable",
        capability: "customer.addresses",
        reasonCode: "address_city_mismatch",
      }));
      return null;
    }
    const current = ++requestSequence.current;
    if (showLoading) setLoadResult(null);
    const result = await coordinator.load(cityCode);
    if (current !== requestSequence.current) return null;
    setLoadResult(result);
    if (result.status === "ready") setAddresses(result.addresses);
    if (result.status === "empty") setAddresses([]);
    if (result.status === "unauthenticated") expireSession();
    return result;
  }, [cityCode, coordinator, expireSession]);

  useEffect(() => {
    void load();
    const retry = () => void load();
    const openNew = () => {
      setView("new");
      setDraft(EMPTY_ADDRESS_DRAFT);
      setErrors({});
      idempotencyKey.current = createAddressIdempotencyKey();
      navigation.openNew(routeInput?.pickerMode ?? false);
    };
    window.addEventListener(ADDRESS_BOOK_RETRY_EVENT, retry);
    window.addEventListener(ADDRESS_BOOK_OPEN_NEW_EVENT, openNew);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(ADDRESS_BOOK_RETRY_EVENT, retry);
      window.removeEventListener(ADDRESS_BOOK_OPEN_NEW_EVENT, openNew);
    };
  }, [load, navigation, routeInput?.pickerMode]);

  useEffect(() => {
    if (routeInput === null) return;
    setView(routeInput.view);
    setActiveAddressId(routeInput.addressId);
    setErrors({});
    setSubmitting(false);
    setDeletingAddressId(null);
    setNotice(null);
    if (routeInput.view === "new") {
      setDraft(EMPTY_ADDRESS_DRAFT);
      idempotencyKey.current = createAddressIdempotencyKey();
    }
  }, [routeInput]);

  useEffect(() => {
    if (routeInput?.view !== "edit" || routeInput.addressId === null) return;
    const address = addresses.find(
      (candidate) => candidate.addressId === routeInput.addressId,
    );
    if (address !== undefined) {
      setDraft(addressDraftFrom(address));
      idempotencyKey.current = createAddressIdempotencyKey();
    }
  }, [addresses, routeInput]);

  const scope = useMemo(() => Object.freeze({
    addressIds: new Set(addresses.map((address) => address.addressId)),
  }), [addresses]);
  const editingAddress = view === "edit" && activeAddressId
    ? addresses.find((address) => address.addressId === activeAddressId) ?? null
    : null;
  const pickerMode = routeInput?.pickerMode ?? false;

  const settleMutationFailure = useCallback(async (
    result: Exclude<AddressMutationResult, { readonly status: "success" }>,
  ) => {
    switch (result.status) {
      case "unauthenticated":
        expireSession();
        setLoadResult(Object.freeze({ status: "unauthenticated" }));
        return;
      case "unavailable":
        setLoadResult(Object.freeze({
          status: "unavailable",
          capability: result.capability,
          reasonCode: "addresses_api_unavailable",
        }));
        return;
      case "not_found":
      case "conflict":
        if (await load(false) === null) return;
        setNotice(Object.freeze({
          kind: "conflict",
          message: "地址已变化，已重新读取服务端列表，请确认后重试。",
        }));
        return;
      case "error":
        setNotice(Object.freeze({
          kind: "error",
          message: result.retryable
            ? "操作未确认成功，请保留当前内容后重试。"
            : "服务端未接受本次操作，请检查后重试。",
        }));
    }
  }, [expireSession, load]);

  const actions = {
    onBack() {
      navigation.back();
    },
    onOpenList() {
      setView("list");
      setActiveAddressId(null);
      setDraft(EMPTY_ADDRESS_DRAFT);
      setErrors({});
      setNotice(null);
      navigation.openList(pickerMode);
    },
    onOpenNew() {
      setView("new");
      setActiveAddressId(null);
      setDraft(EMPTY_ADDRESS_DRAFT);
      setErrors({});
      setNotice(null);
      idempotencyKey.current = createAddressIdempotencyKey();
      navigation.openNew(pickerMode);
    },
    onOpenEdit(addressId: string) {
      const address = addresses.find((candidate) => candidate.addressId === addressId);
      if (address === undefined) return;
      setView("edit");
      setActiveAddressId(addressId);
      setDraft(addressDraftFrom(address));
      setErrors({});
      setNotice(null);
      idempotencyKey.current = createAddressIdempotencyKey();
      navigation.openEdit(addressId, pickerMode);
    },
    onSelect(addressId: string) {
      const address = addresses.find((candidate) => candidate.addressId === addressId);
      if (address === undefined || address.cityCode !== cityCode) return;
      navigation.selectAddress(addressId);
    },
    onDraftChange(
      field: keyof CustomerAddressFormDraft,
      value: string | boolean,
    ) {
      setDraft((current) => Object.freeze({ ...current, [field]: value }));
      setErrors((current) => {
        if (!(field in current) && !("form" in current)) return current;
        const next = { ...current };
        delete next[field as keyof typeof next];
        delete next.form;
        return Object.freeze(next);
      });
      setNotice(null);
    },
    async onSubmit() {
      if (
        controller === null ||
        cityCode === null ||
        submitting ||
        (view === "edit" && editingAddress === null)
      ) return;
      setSubmitting(true);
      const mutationSequence = ++requestSequence.current;
      const result = await controller.save(
        cityCode,
        draft,
        idempotencyKey.current,
        view === "edit" ? editingAddress?.addressId ?? null : null,
        scope,
      );
      if (mutationSequence !== requestSequence.current) {
        setSubmitting(false);
        return;
      }
      if (result.status === "validation_error") {
        setErrors(result.errors);
        setSubmitting(false);
        return;
      }
      if (result.status !== "success") {
        await settleMutationFailure(result);
        setSubmitting(false);
        return;
      }
      idempotencyKey.current = createAddressIdempotencyKey();
      const refreshed = await load(false);
      if (refreshed === null) {
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      if (refreshed.status !== "ready" && refreshed.status !== "empty") return;
      setView("list");
      setActiveAddressId(null);
      setDraft(EMPTY_ADDRESS_DRAFT);
      setErrors({});
      setNotice(Object.freeze({
        kind: "success",
        message: view === "edit" ? "地址已由服务端确认更新。" : "地址已由服务端确认保存。",
      }));
      navigation.openList(pickerMode);
    },
    onRequestDelete(addressId: string) {
      if (!scope.addressIds.has(addressId)) return;
      setDeletingAddressId(addressId);
      setNotice(null);
    },
    onCancelDelete() {
      if (!submitting) setDeletingAddressId(null);
    },
    async onConfirmDelete() {
      if (controller === null || deletingAddressId === null || submitting) return;
      setSubmitting(true);
      const mutationSequence = ++requestSequence.current;
      const result = await controller.delete(deletingAddressId, scope);
      if (mutationSequence !== requestSequence.current) {
        setSubmitting(false);
        return;
      }
      if (result.status !== "success") {
        await settleMutationFailure(result);
        setSubmitting(false);
        setDeletingAddressId(null);
        return;
      }
      const refreshed = await load(false);
      if (refreshed === null) {
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setDeletingAddressId(null);
      if (refreshed.status !== "ready" && refreshed.status !== "empty") return;
      setNotice(Object.freeze({
        kind: "success",
        message: "地址已由服务端确认删除。",
      }));
    },
    onDismissNotice() {
      setNotice(null);
    },
  } satisfies CustomerAddressBookTemplateReadyData["actions"];

  let state: CustomerSliceState<CustomerAddressBookTemplateReadyData>;
  if (routeInput === null) {
    state = {
      status: "error",
      errorCode: "invalid_address_route",
      retryable: false,
      recovery: null,
    };
  } else if (loadResult === null) {
    state = {
      status: "loading",
      requestKey: null,
      previousActorDataVisible: false,
    };
  } else if (
    loadResult.status === "empty" &&
    view === "list" &&
    notice === null
  ) {
    state = boundaryState(loadResult);
  } else if (loadResult.status !== "ready" && loadResult.status !== "empty") {
    state = boundaryState(loadResult);
  } else if (view === "edit" && editingAddress === null) {
    state = {
      status: "error",
      errorCode: "address_not_found",
      retryable: false,
      recovery: null,
    };
  } else if (cityCode === null) {
    state = {
      status: "unavailable",
      capability: "customer.addresses",
      reasonCode: "address_city_mismatch",
      recovery: recovery(),
    };
  } else {
    state = {
      status: "ready",
      data: {
        viewModel: {
          view,
          addresses,
          editingAddress,
          cityCode,
          pickerMode,
          draft,
          errors,
          submitting,
          deletingAddressId,
          notice,
        },
        actions,
      },
    };
  }

  return (
    <CustomerAddressBookTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = AddressBookPage;
