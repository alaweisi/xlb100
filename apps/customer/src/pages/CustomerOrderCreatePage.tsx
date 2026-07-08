import { useEffect, useMemo, useState } from "react";
import type { CatalogSnapshot, CityCode, Order, PaymentOrder, PriceQuote } from "@xlb/types";
import {
  ActionDock,
  Button,
  CustomerAnswerCard,
  CustomerOrderCreateTemplate,
  CustomerQuoteCard,
  ErrorState,
  FormField,
  LoadingState,
  PriceText,
  QuantityStepper,
  Select,
  ServiceCard,
  StatusTag,
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
import { UatDebugPanel, useSearchParamSku } from "./customerPageShell";

type QuoteState =
  | { status: "pending" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; quote: PriceQuote; quoteViewModel: ReturnType<typeof toCustomerQuoteViewModel> };

type SubmitState =
  | { status: "pending" | "submitting" }
  | { status: "success"; order: Order; paymentOrder: PaymentOrder; orderDetail: Order }
  | { status: "error"; error: string };

export interface CustomerOrderCreatePageProps {
  api: {
    getPriceQuote(skuId: string): Promise<{ quote: PriceQuote }>;
    createOrder(payload: {
      customerId?: string; // Phase 14: optional — backend derives from auth context
      skuId: string;
      quantity: number;
    }): Promise<{ order: Order }>;
    createPaymentOrder(request: { orderId: string }): Promise<{ paymentOrder: PaymentOrder }>;
    getOrder(orderId: string): Promise<{ order: Order }>;
  };
  catalogState: CustomerLoadable<CatalogSnapshot>;
  cityCode: CityCode;
  onOrderCreated: (orderId: string) => void;
}

const catalogSourceEndpoint = "GET /api/catalog";
const pricingEndpoint = "GET /api/pricing/quote";

function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "cancelled" || status === "failed" || status === "closed") return "danger";
  if (status === "pending" || status === "pending_payment" || status === "draft") return "warning";
  return "muted";
}

function createOrderRequestPayload(skuId: string, quantity: number) {
  return {
    // Phase 14: customerId no longer sent from client;
    // backend derives it from auth token/context.
    skuId,
    quantity,
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
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "pending" });
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "pending" });

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

  const canSubmit = Boolean(selectedSkuId) && quoteState.status === "success" && submitState.status !== "submitting";

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

  async function submitOrder() {
    clearSubmitError();
    if (!canSubmit || !selectedSkuId) {
      setSubmitState({ status: "error", error: "Please pick a service and keep a valid quote before submit." });
      return;
    }

    const requestPayload = createOrderRequestPayload(selectedSkuId, quantity);
    setSubmitState({ status: "submitting" });
    try {
      const orderResponse = await api.createOrder(requestPayload);
      const paymentResponse = await api.createPaymentOrder({ orderId: orderResponse.order.orderId });
      const verifiedOrderResponse = await api.getOrder(orderResponse.order.orderId);
      onOrderCreated(orderResponse.order.orderId);
      setSubmitState({
        status: "success",
        order: orderResponse.order,
        paymentOrder: paymentResponse.paymentOrder,
        orderDetail: verifiedOrderResponse.order,
      });
    } catch (error) {
      setSubmitState({ status: "error", error: error instanceof Error ? error.message : "Submit failed" });
    }
  }

  const createOrderPayload = selectedSkuId ? createOrderRequestPayload(selectedSkuId, quantity) : null;
  const uatCreateOrderPayload = selectedSkuId
    ? {
        ...createOrderPayload,
        cityCode,
      }
    : null;

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
              title: "Create payment",
              description:
                submitState.status === "success"
                  ? `payment order ${submitState.paymentOrder.paymentOrderId}`
                  : "waiting order",
              state: submitState.status === "success" ? "current" : "pending",
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
              subtitle={`${submitState.orderDetail.quantity} ${submitState.orderDetail.unit} / ${submitState.orderDetail.status}`}
              status={<StatusTag tone={statusTone(submitState.orderDetail.status)}>{submitState.orderDetail.status}</StatusTag>}
              priceText={<PriceText amount={submitState.orderDetail.totalAmount} currency={submitState.orderDetail.currency} />}
              actionLabel="View order detail"
              onClick={() => {
                window.location.href = "/customer/orders";
              }}
            />
            <StatusTag tone="warning">
              {`Payment order: ${submitState.paymentOrder.paymentOrderId} (${submitState.paymentOrder.status})`}
            </StatusTag>
          </div>
        )}
      </section>

      <CustomerAnswerCard state={binding.state} />
      <UatDebugPanel
        binding={binding}
        facts={[
          { label: "city_code", value: cityCode },
          { label: "selectedSkuId", value: selectedSku?.skuId ?? null },
          { label: "selectedSkuName", value: selectedSku?.name ?? null },
          { label: "quote", value: quoteState.status === "success" ? quoteState.quote : quoteState },
          { label: "catalog source endpoint", value: catalogSourceEndpoint },
          { label: "pricing endpoint", value: pricingEndpoint },
          { label: "createOrderPayload", value: uatCreateOrderPayload },
          { label: "orderId", value: submitState.status === "success" ? submitState.order.orderId : null },
          { label: "paymentOrderId", value: submitState.status === "success" ? submitState.paymentOrder.paymentOrderId : null },
          { label: "orderDetail", value: submitState.status === "success" ? submitState.orderDetail : null },
          { label: "workflow state", value: binding.state },
          { label: "availableActions", value: binding.availableActions },
          { label: "disabledReason", value: binding.disabledReasons },
        ]}
      />
    </CustomerOrderCreateTemplate>
  );
}
