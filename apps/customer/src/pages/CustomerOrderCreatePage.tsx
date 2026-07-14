import { useEffect, useMemo, useState } from "react";
import type {
  CatalogSnapshot,
  CityCode,
  CouponGrant,
  MarketingDiscountDecision,
  Order,
  PriceQuote,
  ScheduledTimeSlot,
} from "@xlb/types";
import {
  ActionDock,
  Button,
  CustomerAnswerCard,
  CustomerOrderCreateTemplate,
  CustomerQuoteCard,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  PriceText,
  QuantityStepper,
  Select,
  ServiceCard,
  StatusTag,
  Textarea,
  WorkflowTimeline,
} from "@xlb/ui";
import type { CustomerLoadable } from "./customerPageShell";
import {
  cityAreaByCode,
  dedupeCatalogSkusByName,
  getCatalogSkuDisplayLabel,
  getCatalogSkus as normalizeCatalogSkus,
} from "../adapters/catalogAdapters";
import { toCustomerQuoteViewModel } from "../adapters/pricingAdapter";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import {
  buildScheduledAt,
  formatScheduledLabel,
  getOrderAddressOption,
  getServiceTimeSlot,
  scheduleDayOptions,
  serviceTimeSlots,
} from "../adapters/orderAddressOptions";
import { useSearchParamSku } from "./customerPageShell";
import {
  formatServerMarketingMinor,
  isCustomerCouponGrantSelectable,
} from "../adapters/marketingAdapter";

type QuoteState =
  | { status: "pending" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; quote: PriceQuote; quoteViewModel: ReturnType<typeof toCustomerQuoteViewModel> };

type SubmitState =
  | { status: "pending" | "submitting" }
  | { status: "success"; order: Order; orderDetail: Order }
  | { status: "error"; error: string };

type CouponState =
  | { status: "loading" }
  | { status: "success"; grants: CouponGrant[] }
  | { status: "error"; error: string };

type DecisionState =
  | { status: "pending" | "loading" }
  | { status: "success"; decision: MarketingDiscountDecision; orderCommandKey: string }
  | { status: "error"; error: string };

interface CreateOrderFormDetails {
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  detailAddress: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  scheduledTimeSlot: ScheduledTimeSlot;
}

export interface CustomerOrderCreatePageProps {
  api: {
    getPriceQuote(skuId: string): Promise<{ quote: PriceQuote }>;
    createOrder(payload: {
      customerId?: string; // Phase 14: optional — backend derives from auth context
      skuId: string;
      quantity: number;
      addressProvince: string;
      addressCity: string;
      addressDistrict: string;
      detailAddress: string;
      contactName: string;
      contactPhone: string;
      scheduledAt: string;
      scheduledTimeSlot: ScheduledTimeSlot;
    }): Promise<{ order: Order }>;
    getOrder(orderId: string): Promise<{ order: Order }>;
    listCouponGrants?(query?: { status?: "available" }): Promise<{ couponGrants: CouponGrant[] }>;
    issueDiscountDecision?(payload: {
      skuId: string;
      quantity: number;
      selectedCouponGrantId: string;
      idempotencyKey: string;
    }): Promise<{ discountDecision: MarketingDiscountDecision }>;
  };
  catalogState: CustomerLoadable<CatalogSnapshot>;
  cityCode: CityCode;
  onOrderCreated: (orderId: string) => void;
}

function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "cancelled" || status === "failed" || status === "closed") return "danger";
  if (
    status === "pending" ||
    status === "pending_payment" ||
    status === "pending_dispatch" ||
    status === "service_completed" ||
    status === "draft"
  ) return "warning";
  return "muted";
}

function createOrderRequestPayload(skuId: string, quantity: number, details: CreateOrderFormDetails) {
  return {
    // Phase 14: customerId no longer sent from client;
    // backend derives it from auth token/context.
    skuId,
    quantity,
    ...details,
  };
}

export function CustomerOrderCreatePage({
  api,
  catalogState,
  cityCode,
  onOrderCreated,
}: CustomerOrderCreatePageProps) {
  const initialSkuId = useSearchParamSku();
  const [selectedSkuId, setSelectedSkuId] = useState(initialSkuId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [selectedDistrict, setSelectedDistrict] = useState(() => getOrderAddressOption(cityCode).districts[0]);
  const [detailAddress, setDetailAddress] = useState("喜乐帮演示小区 3 栋 502");
  const [contactName, setContactName] = useState("演示用户");
  const [contactPhone, setContactPhone] = useState("13800000001");
  const [scheduleDayOffset, setScheduleDayOffset] = useState(1);
  const [scheduledTimeSlot, setScheduledTimeSlot] = useState<ScheduledTimeSlot>("morning");
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "pending" });
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "pending" });
  const [couponState, setCouponState] = useState<CouponState>({ status: "loading" });
  const [selectedCouponGrantId, setSelectedCouponGrantId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("couponGrantId") ?? "";
  });
  const [decisionState, setDecisionState] = useState<DecisionState>({ status: "pending" });

  const addressOption = useMemo(() => getOrderAddressOption(cityCode), [cityCode]);
  const scheduledAt = useMemo(
    () => buildScheduledAt(scheduleDayOffset, scheduledTimeSlot),
    [scheduleDayOffset, scheduledTimeSlot],
  );
  const selectedTimeSlot = getServiceTimeSlot(scheduledTimeSlot);
  const orderFormDetails: CreateOrderFormDetails = {
    addressProvince: addressOption.province,
    addressCity: addressOption.city,
    addressDistrict: selectedDistrict,
    detailAddress: detailAddress.trim(),
    contactName: contactName.trim(),
    contactPhone: contactPhone.trim(),
    scheduledAt,
    scheduledTimeSlot,
  };

  const allSkus = useMemo(() => {
    if (catalogState.status !== "success") return [];
    const source = normalizeCatalogSkus(catalogState.data);
    return source;
  }, [catalogState]);

  const skus = useMemo(() => dedupeCatalogSkusByName(allSkus), [allSkus]);

  const selectedSku = allSkus.find((sku) => sku.skuId === selectedSkuId) ?? null;
  const selectedSkuSummary = selectedSku ? getCatalogSkuDisplayLabel(selectedSku) : null;
  const optionSkus = useMemo(() => {
    if (!selectedSku || selectedSkuId === "" || skus.some((sku) => sku.skuId === selectedSkuId)) {
      return skus;
    }
    return [...skus, selectedSku];
  }, [skus, selectedSku, selectedSkuId]);

  const binding = createCustomerUiBinding({
    route: "createOrder",
    cityCode,
    selectedSkuId,
    quoteReady: quoteState.status === "success",
    submitting: submitState.status === "submitting",
  });

  const actionById = useMemo(() => {
    return binding.availableActions.reduce(
      (map, action) => {
        map[action.actionId] = action;
        return map;
      },
      {} as Record<string, (typeof binding.availableActions)[number]>,
    );
  }, [binding]);

  const isContactPhoneValid = /^1[3-9]\d{9}$/.test(orderFormDetails.contactPhone);
  const isAddressReady =
    Boolean(orderFormDetails.addressDistrict) &&
    orderFormDetails.detailAddress.length >= 2 &&
    Boolean(orderFormDetails.contactName) &&
    isContactPhoneValid;
  const isScheduleReady = Boolean(orderFormDetails.scheduledAt) && Boolean(orderFormDetails.scheduledTimeSlot);
  const hasCurrentDecision = decisionState.status === "success"
    && decisionState.decision.couponGrantId === selectedCouponGrantId
    && decisionState.decision.skuId === selectedSkuId
    && decisionState.decision.quantity === quantity;
  const canSubmit =
    Boolean(selectedSkuId) &&
    quoteState.status === "success" &&
    isAddressReady &&
    isScheduleReady &&
    (!selectedCouponGrantId || hasCurrentDecision) &&
    submitState.status !== "submitting";

  useEffect(() => {
    if (!api.listCouponGrants) {
      setCouponState({ status: "success", grants: [] });
      return;
    }
    setCouponState({ status: "loading" });
    void api.listCouponGrants({ status: "available" })
      .then((response) => setCouponState({
        status: "success",
        grants: response.couponGrants.filter((grant) => isCustomerCouponGrantSelectable(grant)),
      }))
      .catch((error: unknown) => setCouponState({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to load coupons",
      }));
  }, [api]);

  useEffect(() => {
    setDecisionState({ status: "pending" });
  }, [selectedSkuId, quantity, selectedCouponGrantId]);

  useEffect(() => {
    if (!addressOption.districts.includes(selectedDistrict)) {
      setSelectedDistrict(addressOption.districts[0]);
    }
  }, [addressOption, selectedDistrict]);

  useEffect(() => {
    if (catalogState.status !== "success" || !allSkus.length) return;
    const hasValidSelectedSku = Boolean(selectedSkuId) && allSkus.some((sku) => sku.skuId === selectedSkuId);
    if (!hasValidSelectedSku && skus.length > 0) {
      setSelectedSkuId(skus[0].skuId);
    }
  }, [catalogState.status, allSkus, skus, selectedSkuId]);

  useEffect(() => {
    if (!selectedSkuId) {
      setQuoteState({ status: "pending" });
      return;
    }
    setQuoteState({ status: "loading" });
    void api
      .getPriceQuote(selectedSkuId)
      .then((result) =>
        setQuoteState({ status: "success", quote: result.quote, quoteViewModel: toCustomerQuoteViewModel(result.quote) }),
      )
      .catch((error: unknown) => {
        setQuoteState({ status: "error", error: error instanceof Error ? error.message : "Get quote failed" });
      });
  }, [api, selectedSkuId]);

  const retryQuote = () => {
    if (!selectedSkuId) return;
    setQuoteState({ status: "loading" });
    void api
      .getPriceQuote(selectedSkuId)
      .then((result) =>
        setQuoteState({ status: "success", quote: result.quote, quoteViewModel: toCustomerQuoteViewModel(result.quote) }),
      )
      .catch((error: unknown) => {
        setQuoteState({ status: "error", error: error instanceof Error ? error.message : "Get quote failed" });
      });
  };

  function clearSubmitError() {
    if (submitState.status === "error") {
      setSubmitState({ status: "pending" });
    }
  }

  async function applySelectedCoupon() {
    if (!selectedCouponGrantId || !selectedSkuId || !api.issueDiscountDecision) {
      setDecisionState({ status: "error", error: "Select an available coupon and service first." });
      return;
    }
    const decisionCommandKey = globalThis.crypto?.randomUUID?.()
      ?? `marketing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setDecisionState({ status: "loading" });
    try {
      const response = await api.issueDiscountDecision({
        skuId: selectedSkuId,
        quantity,
        selectedCouponGrantId,
        idempotencyKey: decisionCommandKey,
      });
      setDecisionState({
        status: "success",
        decision: response.discountDecision,
        orderCommandKey: decisionCommandKey,
      });
    } catch (error) {
      setDecisionState({
        status: "error",
        error: error instanceof Error ? error.message : "Coupon validation failed. Reload and retry.",
      });
    }
  }

  async function submitOrder() {
    clearSubmitError();
    if (!canSubmit || !selectedSkuId) {
      setSubmitState({ status: "error", error: "Please complete service, address, contact and schedule before submit." });
      return;
    }

    const requestPayload = {
      ...createOrderRequestPayload(selectedSkuId, quantity, orderFormDetails),
      ...(decisionState.status === "success" && hasCurrentDecision
        ? {
            discountDecisionId: decisionState.decision.discountDecisionId,
            discountDecisionRevision: decisionState.decision.version,
            orderIdempotencyKey: decisionState.orderCommandKey,
          }
        : {}),
    };
    setSubmitState({ status: "submitting" });
    try {
      const orderResponse = await api.createOrder(requestPayload);
      const verifiedOrderResponse = await api.getOrder(orderResponse.order.orderId);
      onOrderCreated(orderResponse.order.orderId);
      setSubmitState({
        status: "success",
        order: orderResponse.order,
        orderDetail: verifiedOrderResponse.order,
      });
    } catch (error) {
      setSubmitState({ status: "error", error: error instanceof Error ? error.message : "Submit failed" });
    }
  }

  return (
    <CustomerOrderCreateTemplate route="/customer/order/create" cityCode={cityCode} binding={binding}>
      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <strong>{`City: ${cityCode} / ${cityAreaByCode[cityCode] ?? "default area"}`}</strong>
          <FormField label="Service" description="Select one service">
            <Select value={selectedSkuId} onChange={(event) => setSelectedSkuId(event.target.value)}>
              <option value="" disabled>
                Select service
              </option>
              {optionSkus.map((sku) => (
                <option key={sku.skuId} value={sku.skuId}>
                  {getCatalogSkuDisplayLabel(sku).optionLabel}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Quantity" description="Minimum is 1. It cannot be reduced to zero.">
            <QuantityStepper min={1} value={quantity} onChange={setQuantity} />
          </FormField>
          <FormField label="District" description={`${addressOption.province} / ${addressOption.city}`}>
            <Select value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)}>
              {addressOption.districts.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Detail address" description="Example: building, unit and room number">
            <Textarea
              value={detailAddress}
              onChange={(event) => setDetailAddress(event.target.value)}
              placeholder="XX小区3栋502"
            />
          </FormField>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <FormField label="Contact name">
              <Input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="联系人" />
            </FormField>
            <FormField label="Contact phone" error={contactPhone && !isContactPhoneValid ? "请输入 11 位手机号" : undefined}>
              <Input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                inputMode="tel"
                placeholder="13800000001"
              />
            </FormField>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <FormField label="Service date">
              <Select value={String(scheduleDayOffset)} onChange={(event) => setScheduleDayOffset(Number(event.target.value))}>
                {scheduleDayOptions.map((option) => (
                  <option key={option.offsetDays} value={option.offsetDays}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Time slot" description={selectedTimeSlot.timeRange}>
              <Select
                value={scheduledTimeSlot}
                onChange={(event) => setScheduledTimeSlot(event.target.value as ScheduledTimeSlot)}
              >
                {serviceTimeSlots.map((slot) => (
                  <option key={slot.slot} value={slot.slot}>
                    {slot.label} {slot.timeRange}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        </div>

        {selectedSku && (
          <ServiceCard
            title={selectedSku.name}
            subtitle={selectedSkuSummary?.subtitle ?? [selectedSku.categoryPathLabel, selectedSku.unit].filter(Boolean).join(" / ")}
            status={<StatusTag tone="success">selected</StatusTag>}
            actionLabel="Change service"
            onClick={() => {
              window.location.href = `/customer/services?${new URLSearchParams({ cityCode }).toString()}`;
            }}
          />
        )}

        {quoteState.status === "loading" && <LoadingState title="Loading quote" description="Reading pricing..." />}
        {quoteState.status === "error" && (
          <ErrorState
            title="Failed to get quote"
            description="Pricing failed. Please retry."
            action={
              <ActionDock
                actions={actionById["customer.pricing.retryQuote"] ? [actionById["customer.pricing.retryQuote"]] : []}
                onAction={() => retryQuote()}
              />
            }
          />
        )}
        {quoteState.status === "success" && (
          <CustomerQuoteCard
            label={selectedSku?.name ?? "Current quote"}
            price={<PriceText amount={quoteState.quote.basePrice} currency={quoteState.quote.currency} />}
            meta={`${quoteState.quoteViewModel.priceText} / ${quoteState.quoteViewModel.priceType}`}
          />
        )}

        <section className="customer-coupon-selection" aria-label="Coupon selection">
          <FormField
            label="Coupon"
            description="Coupons are applied only after the server validates the current SKU, quantity and Pricing revision."
          >
            <Select
              value={selectedCouponGrantId}
              disabled={couponState.status !== "success"}
              onChange={(event) => setSelectedCouponGrantId(event.target.value)}
            >
              <option value="">Do not use a coupon</option>
              {couponState.status === "success" && couponState.grants.map((grant) => (
                <option key={grant.couponGrantId} value={grant.couponGrantId}>
                  {grant.issuanceReason} / expires {new Date(grant.expiresAt).toLocaleDateString()}
                </option>
              ))}
            </Select>
          </FormField>
          {couponState.status === "loading" && <LoadingState title="Loading coupons" description="Reading available grants..." />}
          {couponState.status === "error" && <ErrorState title="Failed to load coupons" description={couponState.error} />}
          {selectedCouponGrantId && (
            <Button
              type="button"
              disabled={decisionState.status === "loading" || quoteState.status !== "success"}
              onClick={() => void applySelectedCoupon()}
            >
              {decisionState.status === "loading" ? "Validating coupon..." : "Apply selected coupon"}
            </Button>
          )}
          {decisionState.status === "error" && (
            <ErrorState title="Coupon unavailable" description={`${decisionState.error} The original price is not submitted automatically.`} />
          )}
          {decisionState.status === "success" && (
            <div className="customer-coupon-summary">
              <StatusTag tone="success">Coupon validated by server</StatusTag>
              <span>Gross: {formatServerMarketingMinor(decisionState.decision.grossAmountMinor)}</span>
              <span>Discount: -{formatServerMarketingMinor(decisionState.decision.discountAmountMinor)}</span>
              <strong>Net: {formatServerMarketingMinor(decisionState.decision.netAmountMinor)}</strong>
              <small>Decision expires at {new Date(decisionState.decision.expiresAt).toLocaleString()}</small>
            </div>
          )}
        </section>

        <WorkflowTimeline
          items={[
            { key: "catalog", title: "Pick service", description: "service selected", state: "complete" },
            {
              key: "quote",
              title: "Get quote",
              description: quoteState.status === "success" ? "quote ready" : "waiting quote",
              state: quoteState.status === "success" ? "complete" : "current",
            },
            {
              key: "address",
              title: "Fill address",
              description: isAddressReady ? `${selectedDistrict} ${orderFormDetails.detailAddress}` : "waiting address",
              state: isAddressReady ? "complete" : quoteState.status === "success" ? "current" : "pending",
            },
            {
              key: "schedule",
              title: "Pick schedule",
              description: isScheduleReady ? formatScheduledLabel(orderFormDetails.scheduledAt, orderFormDetails.scheduledTimeSlot) : "waiting schedule",
              state: isScheduleReady ? "complete" : isAddressReady ? "current" : "pending",
            },
            {
              key: "order",
              title: "Create order",
              description:
                submitState.status === "success"
                  ? `order created ${submitState.order.orderId}`
                  : submitState.status === "error"
                    ? "blocked"
                    : "waiting submit",
              state:
                submitState.status === "success" ? "complete" : submitState.status === "error" ? "blocked" : "pending",
            },
            {
              key: "payment",
              title: "Pay after service",
              description:
                submitState.status === "success"
                  ? "waiting worker fulfillment and customer confirm"
                  : "waiting order",
              state: "pending",
            },
          ]}
        />

        <ActionDock
          actions={actionById["customer.order.submit"] ? [actionById["customer.order.submit"]] : []}
          onAction={() => void submitOrder()}
          density="compact"
        />

        {submitState.status === "error" && (
          <ErrorState
            title="Submit failed"
            description={submitState.error}
            action={<Button type="button" onClick={() => void submitOrder()}>
              Try again
            </Button>}
          />
        )}
        {submitState.status === "success" && (
          <div style={{ display: "grid", gap: 10 }}>
            <StatusTag tone="success">Order ID: {submitState.order.orderId}</StatusTag>
            <ServiceCard
              title={submitState.order.skuName}
              subtitle={`${submitState.orderDetail.quantity} ${submitState.orderDetail.unit} / ${submitState.orderDetail.addressDistrict} ${submitState.orderDetail.detailAddress} / ${formatScheduledLabel(submitState.orderDetail.scheduledAt, submitState.orderDetail.scheduledTimeSlot)}`}
              status={<StatusTag tone={statusTone(submitState.orderDetail.status)}>{submitState.orderDetail.status}</StatusTag>}
              priceText={<PriceText amount={submitState.orderDetail.totalAmount} currency={submitState.orderDetail.currency} />}
              actionLabel="View order detail"
              onClick={() => {
                window.location.href = "/customer/orders";
              }}
            />
            <StatusTag tone="warning">Payment opens after worker completion and customer confirmation</StatusTag>
          </div>
        )}
      </section>

      <CustomerAnswerCard state={binding.state} />
    </CustomerOrderCreateTemplate>
  );
}
