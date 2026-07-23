import {
  createApiClient,
  customerApi,
} from "@xlb/api-client";
import type {
  CityCode,
  Order,
  PriceQuote,
  ScheduledTimeSlot,
} from "@xlb/types";
import { pricingQuoteQuerySchema } from "@xlb/validators";
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
import { CUSTOMER_ADDRESS_SELECTED_EVENT } from "../address/AddressBookRoute.js";
import {
  CheckoutActionController,
  checkoutStepCanContinue,
  minimumCheckoutDate,
} from "./CheckoutActionController.js";
import {
  CheckoutCoordinator,
  type CustomerCheckoutLoadResult,
} from "./CheckoutCoordinator.js";
import { CustomerCheckoutStepperTemplate } from "./CustomerCheckoutStepperTemplate.js";
import {
  CUSTOMER_CHECKOUT_STEPS,
  createEmptyCheckoutDraft,
  type CustomerCheckoutDraft,
  type CustomerCheckoutDraftErrors,
  type CustomerCheckoutNotice,
  type CustomerCheckoutStep,
  type CustomerCheckoutTemplateReadyData,
} from "./checkoutTypes.js";
import "./checkout.css";

export const CHECKOUT_RETRY_EVENT = "xlb:customer-checkout-retry";
const SESSION_EXPIRED_EVENT = "xlb:customer-session-expired";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

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

export interface CustomerCheckoutNavigation {
  backToService(skuId: string): void;
  openAddressPicker(): void;
  openOrderDetail(orderId: string): void;
}

export function createBrowserCustomerCheckoutNavigation(): CustomerCheckoutNavigation {
  return Object.freeze({
    backToService(skuId: string) {
      changeBrowserRoute(`/service/${encodeURIComponent(skuId)}`);
    },
    openAddressPicker() {
      changeBrowserRoute("/profile/addresses?mode=picker");
    },
    openOrderDetail(orderId: string) {
      changeBrowserRoute(`/orders/${encodeURIComponent(orderId)}`, true);
    },
  });
}

export function parseCustomerCheckoutSkuId(
  route: CustomerFeatureRouteComponentProps["route"],
): string | null {
  if (
    route.pattern !== "/order/create" &&
    route.pathname !== "/order/create"
  ) {
    return null;
  }
  const requestedSkuId = route.query.skuId ?? "";
  const parsed = pricingQuoteQuerySchema.safeParse({ skuId: requestedSkuId });
  if (
    !parsed.success ||
    parsed.data.skuId !== requestedSkuId.trim() ||
    !SAFE_ID.test(parsed.data.skuId)
  ) {
    return null;
  }
  return parsed.data.skuId;
}

function createDefaultCoordinator(cityCode: CityCode): CheckoutCoordinator {
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
  return new CheckoutCoordinator(customerApi.forClient(client));
}

function recovery() {
  return Object.freeze({
    actionKey: CHECKOUT_RETRY_EVENT,
    labelKey: "重新读取",
  });
}

function boundaryState(
  result: Exclude<CustomerCheckoutLoadResult, { readonly status: "ready" }>,
): CustomerSliceState<CustomerCheckoutTemplateReadyData> {
  switch (result.status) {
    case "error":
      return Object.freeze({
        status: "error",
        errorCode: result.errorCode,
        retryable: result.retryable,
        recovery: result.retryable ? recovery() : null,
      });
    case "conflict":
      return Object.freeze({
        status: "conflict",
        conflictCode: result.conflictCode,
        refreshRequired: true,
        recovery: recovery(),
      });
    case "unauthenticated":
      return Object.freeze({
        status: "unavailable",
        capability: "customer.session",
        reasonCode: "session_expired",
        recovery: null,
      });
    case "unavailable":
      return Object.freeze({
        status: "unavailable",
        capability: result.capability,
        reasonCode: result.reasonCode,
        recovery: result.reasonCode === "sku_not_found" ? null : recovery(),
      });
  }
}

function firstErrorForStep(
  step: Exclude<CustomerCheckoutStep, "review">,
): CustomerCheckoutDraftErrors {
  switch (step) {
    case "service":
      return Object.freeze({ quantity: "数量需为 1–1000 的整数" });
    case "address":
      return Object.freeze({
        address: "请选择当前服务城市内的地址",
        contactPhone: "请输入该地址联系人的 11 位完整手机号码",
      });
    case "schedule":
      return Object.freeze({
        requestedDate: "请选择明天或之后的请求日期",
        requestedTimeSlot: "请选择一个请求时段",
      });
    case "coupon":
      return Object.freeze({});
  }
}

function quoteChanged(previous: PriceQuote, next: PriceQuote): boolean {
  return previous.priceRuleId !== next.priceRuleId ||
    previous.version !== next.version ||
    previous.priceText !== next.priceText ||
    previous.priceType !== next.priceType ||
    previous.breakdown.totalAmount !== next.breakdown.totalAmount;
}

export interface CustomerCheckoutPageProps extends CustomerFeatureRouteComponentProps {
  readonly cityCode?: CityCode | null;
  readonly coordinator?: CheckoutCoordinator;
  readonly navigation?: CustomerCheckoutNavigation;
  readonly now?: Date;
}

export function CustomerCheckoutPage({
  slice,
  route,
  cityCode: providedCityCode,
  coordinator: providedCoordinator,
  navigation: providedNavigation,
  now,
}: CustomerCheckoutPageProps) {
  const cityCode = providedCityCode === undefined
    ? storageValue("xlb.customer.cityCode") as CityCode | null
    : providedCityCode;
  const skuId = parseCustomerCheckoutSkuId(route);
  const coordinator = useMemo(
    () => providedCoordinator ?? (
      cityCode === null ? null : createDefaultCoordinator(cityCode)
    ),
    [cityCode, providedCoordinator],
  );
  const navigation = useMemo(
    () => providedNavigation ?? createBrowserCustomerCheckoutNavigation(),
    [providedNavigation],
  );
  const actionController = useMemo(
    () => coordinator === null ? null : new CheckoutActionController(coordinator),
    [coordinator],
  );
  const minimumDate = useMemo(() => minimumCheckoutDate(now), [now]);
  const [result, setResult] = useState<CustomerCheckoutLoadResult | null>(null);
  const [step, setStep] = useState<CustomerCheckoutStep>("service");
  const [draft, setDraft] = useState<CustomerCheckoutDraft>(
    createEmptyCheckoutDraft,
  );
  const [errors, setErrors] = useState<CustomerCheckoutDraftErrors>({});
  const [notice, setNotice] = useState<CustomerCheckoutNotice | null>(null);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const requestSequence = useRef(0);

  const expireSession = useCallback(() => {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, {
      detail: Object.freeze({ returnUrl: route.pathname }),
    }));
  }, [route.pathname]);

  const load = useCallback(async () => {
    if (cityCode === null || coordinator === null || skuId === null) {
      requestSequence.current += 1;
      setResult(Object.freeze({
        status: "unavailable",
        capability: "customer.catalog",
        reasonCode: skuId === null ? "sku_not_found" : "catalog_city_mismatch",
      }));
      return;
    }
    const current = ++requestSequence.current;
    setResult(null);
    const next = await coordinator.load(cityCode, skuId);
    if (current !== requestSequence.current) return;
    if (next.status === "unauthenticated") expireSession();
    setResult(next);
  }, [cityCode, coordinator, expireSession, skuId]);

  useEffect(() => {
    void load();
    const retry = () => void load();
    window.addEventListener(CHECKOUT_RETRY_EVENT, retry);
    return () => {
      requestSequence.current += 1;
      window.removeEventListener(CHECKOUT_RETRY_EVENT, retry);
    };
  }, [load]);

  useEffect(() => {
    if (
      cityCode === null ||
      coordinator === null ||
      result?.status !== "ready"
    ) {
      return;
    }
    const selected = (event: Event) => {
      const addressId = (event as CustomEvent<unknown>).detail;
      const candidate = typeof addressId === "object" &&
          addressId !== null &&
          "addressId" in addressId
        ? (addressId as { readonly addressId?: unknown }).addressId
        : null;
      if (typeof candidate !== "string" || !SAFE_ID.test(candidate)) return;
      void (async () => {
        const addresses = await coordinator.loadAddresses(cityCode);
        if (addresses.status !== "ready") {
          setNotice(Object.freeze({
            kind: "conflict",
            message: "地址簿已变化，请重新选择当前城市地址。",
          }));
          return;
        }
        const address = addresses.addresses.find((item) =>
          item.addressId === candidate);
        if (address === undefined) {
          setNotice(Object.freeze({
            kind: "conflict",
            message: "未能在当前城市地址列表中确认所选地址。",
          }));
          return;
        }
        setResult((current) => current?.status === "ready"
          ? Object.freeze({
              ...current,
              facts: Object.freeze({
                ...current.facts,
                addresses: addresses.addresses,
              }),
            })
          : current);
        setDraft((current) => Object.freeze({
          ...current,
          addressId: address.addressId,
          contactPhone: "",
        }));
        setErrors({});
        setNotice(Object.freeze({
          kind: "info",
          message: "已从地址簿接收地址。请重新输入完整联系电话。",
        }));
      })();
    };
    window.addEventListener(CUSTOMER_ADDRESS_SELECTED_EVENT, selected);
    return () => {
      window.removeEventListener(CUSTOMER_ADDRESS_SELECTED_EVENT, selected);
    };
  }, [cityCode, coordinator, result?.status]);

  if (result === null) {
    return (
      <CustomerCheckoutStepperTemplate
        slice={slice}
        route={route}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />
    );
  }
  if (result.status !== "ready") {
    return (
      <CustomerCheckoutStepperTemplate
        slice={slice}
        route={route}
        state={boundaryState(result)}
      />
    );
  }

  const selectedAddress = result.facts.addresses.find((address) =>
    address.addressId === draft.addressId) ?? null;
  const movePrevious = () => {
    const currentIndex = CUSTOMER_CHECKOUT_STEPS.indexOf(step);
    if (currentIndex <= 0) return;
    setStep(CUSTOMER_CHECKOUT_STEPS[currentIndex - 1]!);
    setErrors({});
    setNotice(null);
  };

  const actions = Object.freeze({
    onBack() {
      navigation.backToService(result.facts.service.identity.skuId);
    },
    onPreviousStep: movePrevious,
    async onNextStep() {
      if (step === "review") return;
      if (!checkoutStepCanContinue(
        step,
        draft,
        result.facts.addresses,
        cityCode!,
        minimumDate,
      )) {
        setErrors(firstErrorForStep(step));
        return;
      }
      setErrors({});
      setNotice(null);
      if (step !== "coupon") {
        const currentIndex = CUSTOMER_CHECKOUT_STEPS.indexOf(step);
        setStep(CUSTOMER_CHECKOUT_STEPS[currentIndex + 1]!);
        return;
      }

      setQuoteRefreshing(true);
      const refreshed = await coordinator!.refreshQuote(
        cityCode!,
        result.facts.service.identity.skuId,
      );
      setQuoteRefreshing(false);
      if (refreshed.status === "unauthenticated") {
        expireSession();
        return;
      }
      if (refreshed.status !== "ready") {
        setNotice(Object.freeze({
          kind: refreshed.status === "conflict" ? "conflict" : "error",
          message: "无法重新确认正式报价，请稍后重试。",
        }));
        return;
      }
      const changed = quoteChanged(result.facts.service.quote, refreshed.quote);
      setResult(Object.freeze({
        ...result,
        facts: Object.freeze({
          ...result.facts,
          service: Object.freeze({
            ...result.facts.service,
            quote: refreshed.quote,
            freshness: "fresh",
            staleReason: null,
          }),
        }),
      }));
      setNotice(Object.freeze({
        kind: changed ? "conflict" : "info",
        message: changed
          ? "服务端报价已更新，请按最新 Quote 重新核对。"
          : "已重新读取并确认当前服务端 Quote。",
      }));
      setStep("review");
    },
    onQuantityChange(quantity: number) {
      setDraft((current) => Object.freeze({ ...current, quantity }));
      setErrors((current) => Object.freeze({ ...current, quantity: undefined }));
    },
    onAddressSelect(addressId: string) {
      const address = result.facts.addresses.find((candidate) =>
        candidate.addressId === addressId &&
        candidate.cityCode === cityCode);
      if (address === undefined) return;
      setDraft((current) => Object.freeze({
        ...current,
        addressId,
        contactPhone: "",
      }));
      setErrors((current) => Object.freeze({
        ...current,
        address: undefined,
        contactPhone: undefined,
      }));
    },
    onOpenAddressPicker() {
      navigation.openAddressPicker();
    },
    onContactPhoneChange(contactPhone: string) {
      setDraft((current) => Object.freeze({ ...current, contactPhone }));
      setErrors((current) => Object.freeze({
        ...current,
        contactPhone: undefined,
      }));
    },
    onRequestedDateChange(requestedDate: string) {
      setDraft((current) => Object.freeze({ ...current, requestedDate }));
      setErrors((current) => Object.freeze({
        ...current,
        requestedDate: undefined,
      }));
    },
    onRequestedTimeSlotChange(requestedTimeSlot: ScheduledTimeSlot) {
      setDraft((current) => Object.freeze({ ...current, requestedTimeSlot }));
      setErrors((current) => Object.freeze({
        ...current,
        requestedTimeSlot: undefined,
      }));
    },
    async onSubmit() {
      if (actionController === null || submitting) return;
      setSubmitting(true);
      setErrors({});
      setNotice(null);
      const submitted = await actionController.submit(draft, {
        cityCode: cityCode!,
        verifiedSkuId: result.facts.service.identity.skuId,
        addresses: result.facts.addresses,
        quote: result.facts.service.quote,
      }, minimumDate);
      setSubmitting(false);
      switch (submitted.status) {
        case "validation_error":
          setErrors(submitted.errors);
          return;
        case "unauthenticated":
          expireSession();
          return;
        case "conflict":
          setNotice(Object.freeze({
            kind: "conflict",
            message: submitted.conflictCode === "request_in_flight"
              ? "订单正在提交，请勿重复操作。"
              : "服务端事实已变化，请返回核对后重新提交。",
          }));
          return;
        case "unavailable":
          setNotice(Object.freeze({
            kind: "error",
            message: "正式下单能力暂不可用，请稍后重试。",
          }));
          return;
        case "error":
          setNotice(Object.freeze({
            kind: "error",
            message: submitted.retryable
              ? "订单创建未确认，请检查网络后再重试。"
              : "订单响应无法安全确认，请返回订单中心核实后再操作。",
          }));
          return;
        case "success":
          setCreatedOrder(submitted.order);
          setNotice(Object.freeze({
            kind: "success",
            message: `订单已由服务端创建，当前状态：${submitted.order.status}。`,
          }));
          setDraft(createEmptyCheckoutDraft());
          navigation.openOrderDetail(submitted.order.orderId);
      }
    },
    onDismissNotice() {
      setNotice(null);
    },
  });

  const state: CustomerSliceState<CustomerCheckoutTemplateReadyData> = {
    status: "ready",
    data: {
      viewModel: {
        currentStep: step,
        service: result.facts.service,
        quote: result.facts.service.quote,
        addresses: result.facts.addresses,
        selectedAddress,
        draft,
        errors,
        notice,
        quoteRefreshing,
        submitting,
        createdOrder,
        minimumRequestedDate: minimumDate,
        couponCapability: "projection_unavailable",
      },
      actions,
    },
  };

  return (
    <CustomerCheckoutStepperTemplate
      slice={slice}
      route={route}
      state={state}
    />
  );
}

export const RouteComponent = CustomerCheckoutPage;
