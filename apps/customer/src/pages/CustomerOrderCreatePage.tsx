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
import { cityAreaByCode, getCatalogSkus as normalizeCatalogSkus } from "../adapters/catalogAdapters";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { UatDebugPanel, useSearchParamSku } from "./customerPageShell";

type QuoteState =
  | { status: "pending" | "loading" }
  | { status: "success"; quote: PriceQuote }
  | { status: "error"; error: string };

type SubmitState =
  | { status: "pending" | "submitting" }
  | { status: "success"; order: Order; paymentOrder: PaymentOrder; verifiedOrder: Order }
  | { status: "error"; error: string };

export interface CustomerOrderCreatePageProps {
  api: {
    getPriceQuote(skuId: string): Promise<{ quote: PriceQuote }>;
    createOrder(payload: {
      customerId: string;
      skuId: string;
      quantity: number;
    }): Promise<{ order: Order }>;
    createPaymentOrder(request: { orderId: string }): Promise<{ paymentOrder: PaymentOrder }>;
    getOrder(orderId: string): Promise<{ order: Order }>;
  };
  catalogState: CustomerLoadable<CatalogSnapshot>;
  cityCode: CityCode;
  onOrderCreated: (orderId: string) => void;
  onRetryCatalog: () => void;
}

function createOrderPayload(cityCode: CityCode, selectedSkuId: string, quantity: number) {
  return {
    customerId: "customer-demo-001",
    cityCode,
    skuId: selectedSkuId,
    quantity,
  };
}

function statusTone(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "paid") return "success";
  if (status === "cancelled" || status === "failed" || status === "closed") return "danger";
  if (status === "pending" || status === "pending_payment" || status === "draft") return "warning";
  return "muted";
}

export function CustomerOrderCreatePage({
  api,
  catalogState,
  cityCode,
  onOrderCreated,
  onRetryCatalog,
}: CustomerOrderCreatePageProps) {
  const initialSkuId = useSearchParamSku();
  const [selectedSkuId, setSelectedSkuId] = useState(initialSkuId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "pending" });
  const [submitState, setSubmitState] = useState<SubmitState>({ status: "pending" });

  const skus = useMemo(
    () => normalizeCatalogSkus(catalogState.status === "success" ? catalogState.data : undefined),
    [catalogState],
  );
  const selectedSku = skus.find((sku) => sku.skuId === selectedSkuId);

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
    if (catalogState.status === "success" && !selectedSkuId && skus[0]) {
      setSelectedSkuId(skus[0].skuId);
    }
  }, [catalogState, selectedSkuId, skus]);

  useEffect(() => {
    if (!selectedSkuId) {
      setQuoteState({ status: "pending" });
      return;
    }
    setQuoteState({ status: "loading" });
    void api
      .getPriceQuote(selectedSkuId)
      .then((result) => setQuoteState({ status: "success", quote: result.quote }))
      .catch((error: unknown) => {
        setQuoteState({ status: "error", error: error instanceof Error ? error.message : "Get quote failed" });
      });
  }, [api, selectedSkuId]);

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

    setSubmitState({ status: "submitting" });
    try {
      const request = createOrderPayload(cityCode, selectedSkuId, quantity);
      const orderResponse = await api.createOrder({
        customerId: request.customerId,
        skuId: request.skuId,
        quantity: request.quantity,
      });
      const paymentResponse = await api.createPaymentOrder({ orderId: orderResponse.order.orderId });
      const verifiedOrder = await api.getOrder(orderResponse.order.orderId);
      onOrderCreated(orderResponse.order.orderId);
      setSubmitState({
        status: "success",
        order: orderResponse.order,
        paymentOrder: paymentResponse.paymentOrder,
        verifiedOrder: verifiedOrder.order,
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
              {skus.map((sku) => (
                <option key={sku.skuId} value={sku.skuId}>
                  {`${sku.name} / ${sku.subtitle}`}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Quantity" description="Minimum is 1. Cannot input 0.">
            <QuantityStepper min={1} value={quantity} onChange={setQuantity} />
          </FormField>
        </div>

        {selectedSku && (
          <ServiceCard
            title={selectedSku.name}
            subtitle={[selectedSku.categoryName, selectedSku.itemName, selectedSku.unit].filter(Boolean).join(" / ")}
            status={<StatusTag tone="success">selected</StatusTag>}
            actionLabel="Change service"
            onClick={() => (window.location.href = "/customer/services")}
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
                onAction={() => onRetryCatalog()}
              />
            }
          />
        )}
        {quoteState.status === "success" && (
          <CustomerQuoteCard
            label={selectedSku ? selectedSku.name : "Current quote"}
            price={<PriceText amount={quoteState.quote.basePrice} currency={quoteState.quote.currency} />}
            meta={`${quoteState.quote.priceText} / ${quoteState.quote.priceType}`}
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
              description: submitState.status === "success" ? "order created" : submitState.status === "error" ? "blocked" : "waiting submit",
              state: submitState.status === "success" ? "complete" : submitState.status === "error" ? "blocked" : "pending",
            },
            {
              key: "payment",
              title: "Create payment",
              description: submitState.status === "success" ? "payment order created" : "waiting order",
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
            action={<Button type="button" onClick={() => void submitOrder()}>Try again</Button>}
          />
        )}
        {submitState.status === "success" && (
          <div style={{ display: "grid", gap: 10 }}>
            <StatusTag tone="success">Order ID: {submitState.order.orderId}</StatusTag>
            <ServiceCard
              title="Order created"
              subtitle={`${submitState.verifiedOrder.quantity}${submitState.verifiedOrder.unit} / ${submitState.verifiedOrder.status}`}
              status={<StatusTag tone={statusTone(submitState.order.status)}>{submitState.order.status}</StatusTag>}
              priceText={<PriceText amount={submitState.order.totalAmount} currency={submitState.order.currency} />}
              actionLabel="View orders"
              onClick={() => {
                window.location.href = "/customer/orders";
              }}
            />
            <StatusTag tone="warning">Payment order: {submitState.paymentOrder.paymentOrderId}</StatusTag>
          </div>
        )}
      </section>

      <CustomerAnswerCard state={binding.state} />
      <UatDebugPanel
        binding={binding}
        facts={[
          { label: "city_code", value: cityCode },
          { label: "skuId", value: selectedSkuId || null },
          { label: "quantity", value: quantity },
          { label: "quote", value: quoteState.status === "success" ? quoteState.quote : quoteState },
          { label: "create order payload", value: selectedSkuId ? createOrderPayload(cityCode, selectedSkuId, quantity) : null },
          { label: "orderId", value: submitState.status === "success" ? submitState.order.orderId : null },
          { label: "paymentOrderId", value: submitState.status === "success" ? submitState.paymentOrder.paymentOrderId : null },
          { label: "order detail response", value: submitState.status === "success" ? submitState.verifiedOrder : null },
          { label: "workflow state", value: binding.state },
          { label: "availableActions", value: binding.availableActions },
        ]}
      />
    </CustomerOrderCreateTemplate>
  );
}
