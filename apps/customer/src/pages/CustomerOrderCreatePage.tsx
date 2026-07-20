import { useEffect, useMemo, useState } from "react";
import type {
  CatalogSnapshot,
  CityCode,
  CouponGrant,
  CustomerAddress,
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
  EmptyState,
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
import { toCustomerError } from "../adapters/customerError";
import "./customer-orders.css";

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

type AddressState =
  | { status: "loading" }
  | { status: "success"; addresses: CustomerAddress[] }
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

function hasUnknownSubmitResult(kind: string): boolean {
  return kind === "offline" || kind === "timeout" || kind === "unknown";
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
      discountDecisionId?: string;
      discountDecisionRevision?: number;
      orderIdempotencyKey?: string;
    }): Promise<{ order: Order }>;
    getOrder(orderId: string): Promise<{ order: Order }>;
    listCouponGrants?(query?: { status?: "available" }): Promise<{ couponGrants: CouponGrant[] }>;
    issueDiscountDecision?(payload: {
      skuId: string;
      quantity: number;
      selectedCouponGrantId: string;
      idempotencyKey: string;
    }): Promise<{ discountDecision: MarketingDiscountDecision }>;
    listAddresses?(): Promise<{ addresses: CustomerAddress[] }>;
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

function orderStatusLabel(status: string): string {
  return ({
    draft: "待提交",
    pending_dispatch: "等待服务",
    service_completed: "待支付",
    pending_payment: "支付处理中",
    paid: "已支付",
    cancelled: "已取消",
  } as Record<string, string>)[status] ?? "状态待确认";
}

function priceTypeLabel(priceType: string): string {
  return ({
    fixed: "固定价",
    range: "区间价",
    from: "起步价",
    estimate_from: "预估起价",
    onsite_quote: "上门报价",
  } as Record<string, string>)[priceType] ?? "实时报价";
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
  const [detailAddress, setDetailAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
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
  const [orderIdempotencyKey] = useState(() => globalThis.crypto?.randomUUID?.()
    ?? `customer-order-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const [addressState, setAddressState] = useState<AddressState>({ status: "loading" });
  const [selectedAddressId, setSelectedAddressId] = useState("");

  const addressOption = useMemo(() => getOrderAddressOption(cityCode), [cityCode]);
  const selectedAddress = addressState.status === "success"
    ? addressState.addresses.find((address) => address.addressId === selectedAddressId) ?? null
    : null;
  const scheduledAt = useMemo(
    () => buildScheduledAt(scheduleDayOffset, scheduledTimeSlot),
    [scheduleDayOffset, scheduledTimeSlot],
  );
  const selectedTimeSlot = getServiceTimeSlot(scheduledTimeSlot);
  const orderFormDetails: CreateOrderFormDetails = {
    addressProvince: selectedAddress?.province ?? addressOption.province,
    addressCity: selectedAddress?.city ?? addressOption.city,
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
    if (!api.listAddresses) {
      setAddressState({ status: "success", addresses: [] });
      return;
    }
    setAddressState({ status: "loading" });
    void api.listAddresses()
      .then((response) => {
        const addresses = response.addresses.filter((address) => address.cityCode === cityCode);
        setAddressState({ status: "success", addresses });
        const preferred = addresses.find((address) => address.isDefault) ?? addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.addressId);
          setSelectedDistrict(preferred.district);
          setDetailAddress(preferred.detailAddress);
          setContactName(preferred.contactName);
        }
      })
      .catch((error: unknown) => setAddressState({
        status: "error",
        error: toCustomerError(error, "常用地址加载失败").description,
      }));
  }, [api, cityCode]);

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
        error: toCustomerError(error, "优惠券加载失败").description,
      }));
  }, [api]);

  useEffect(() => {
    setDecisionState({ status: "pending" });
  }, [selectedSkuId, quantity, selectedCouponGrantId]);

  useEffect(() => {
    if (!selectedAddress && !addressOption.districts.includes(selectedDistrict)) {
      setSelectedDistrict(addressOption.districts[0]);
    }
  }, [addressOption, selectedAddress, selectedDistrict]);

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
        setQuoteState({ status: "error", error: toCustomerError(error, "报价获取失败").description });
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
        setQuoteState({ status: "error", error: toCustomerError(error, "报价获取失败").description });
      });
  };

  function clearSubmitError() {
    if (submitState.status === "error") {
      setSubmitState({ status: "pending" });
    }
  }

  async function applySelectedCoupon() {
    if (!selectedCouponGrantId || !selectedSkuId || !api.issueDiscountDecision) {
      setDecisionState({ status: "error", error: "请先选择服务与可用优惠券。" });
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
        error: toCustomerError(error, "优惠券校验失败").description,
      });
    }
  }

  async function submitOrder() {
    clearSubmitError();
    if (!canSubmit || !selectedSkuId) {
      setSubmitState({ status: "error", error: "请完整填写服务、地址、联系方式和预约时间。" });
      return;
    }

    const requestPayload = {
      ...createOrderRequestPayload(selectedSkuId, quantity, orderFormDetails),
      orderIdempotencyKey,
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
      onOrderCreated(orderResponse.order.orderId);
      const verifiedOrderResponse = await api.getOrder(orderResponse.order.orderId);
      setSubmitState({
        status: "success",
        order: orderResponse.order,
        orderDetail: verifiedOrderResponse.order,
      });
    } catch (error) {
      const mapped = toCustomerError(error, "订单提交失败");
      setSubmitState({
        status: "error",
        error: hasUnknownSubmitResult(mapped.kind)
          ? "提交过程中连接中断，订单结果暂时无法确认。请使用当前页面重新提交，服务端会按同一请求标识去重。"
          : mapped.description,
      });
    }
  }

  const catalogLoading = catalogState.status === "loading" || catalogState.status === "pending";
  const catalogFailed = catalogState.status === "error";
  const catalogReady = catalogState.status === "success";
  const addressesLoading = addressState.status === "loading";
  const addressesFailed = addressState.status === "error";
  const addressesReady = addressState.status === "success";
  const quoteLoading = quoteState.status === "loading";
  const quoteFailed = quoteState.status === "error";
  const quoteReady = quoteState.status === "success";
  const couponsLoading = couponState.status === "loading";
  const couponsFailed = couponState.status === "error";
  const couponsReady = couponState.status === "success";
  const decisionLoading = decisionState.status === "loading";
  const decisionFailed = decisionState.status === "error";
  const decisionReady = decisionState.status === "success";
  const submitFailed = submitState.status === "error";
  const submitReady = submitState.status === "success";

  return (
    <div className="customer-transaction-page">
    <CustomerOrderCreateTemplate route="/customer/order/create" cityCode={cityCode} binding={binding}>
      {catalogLoading && (
        <LoadingState title="正在加载服务配置" description="读取当前城市实时服务目录" />
      )}
      {catalogFailed && <ErrorState title="服务配置加载失败" description={catalogState.error} />}
      {catalogReady && allSkus.length === 0 && (
        <EmptyState title="当前城市暂无可下单服务" description="请返回服务页刷新目录或切换城市。" />
      )}
      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <strong>{`${addressOption.city} · ${cityAreaByCode[cityCode] ?? "当前服务区域"}`}</strong>
          <FormField label="服务项目" description="服务与价格均来自当前城市实时目录">
            <Select aria-label="服务项目" value={selectedSkuId} onChange={(event) => setSelectedSkuId(event.target.value)}>
              <option value="" disabled>
                请选择服务
              </option>
              {optionSkus.map((sku) => (
                <option key={sku.skuId} value={sku.skuId}>
                  {getCatalogSkuDisplayLabel(sku).optionLabel}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="服务数量" description="最少 1 份，最终金额以服务端报价为准">
            <QuantityStepper min={1} value={quantity} onChange={setQuantity} />
          </FormField>
          {addressesLoading && <LoadingState title="正在加载常用地址" description="读取账号已保存的服务地址" />}
          {addressesFailed && <ErrorState title="常用地址暂不可用" description={addressState.error} />}
          {addressesReady && addressState.addresses.length > 0 && (
            <FormField label="常用地址" description="选择后仍需补充完整手机号，服务端只返回脱敏号码">
              <Select
                value={selectedAddressId}
                onChange={(event) => {
                  const addressId = event.target.value;
                  setSelectedAddressId(addressId);
                  const address = addressState.addresses.find((item) => item.addressId === addressId);
                  if (address) {
                    setSelectedDistrict(address.district);
                    setDetailAddress(address.detailAddress);
                    setContactName(address.contactName);
                    setContactPhone("");
                  }
                }}
              >
                <option value="">填写新地址</option>
                {addressState.addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.isDefault ? "默认 · " : ""}{address.district} {address.detailAddress} · {address.contactName} {address.contactPhoneMasked}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="服务区域" description={`${orderFormDetails.addressProvince} / ${orderFormDetails.addressCity}`}>
            <Select aria-label="服务区域" value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)}>
              {[...new Set([selectedDistrict, ...addressOption.districts])].map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="详细地址" description="请填写小区、楼栋、单元和门牌号">
            <Textarea
              aria-label="详细地址"
              value={detailAddress}
              onChange={(event) => setDetailAddress(event.target.value)}
              placeholder="示例小区3栋502室"
            />
          </FormField>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <FormField label="联系人">
              <Input aria-label="联系人" value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="联系人" />
            </FormField>
            <FormField label="联系电话" error={contactPhone && !isContactPhoneValid ? "请输入 11 位手机号" : undefined}>
              <Input
                aria-label="联系电话"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                inputMode="tel"
                placeholder="13800000001"
              />
            </FormField>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <FormField label="服务日期">
              <Select aria-label="服务日期" value={String(scheduleDayOffset)} onChange={(event) => setScheduleDayOffset(Number(event.target.value))}>
                {scheduleDayOptions.map((option) => (
                  <option key={option.offsetDays} value={option.offsetDays}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="服务时段" description={selectedTimeSlot.timeRange}>
              <Select
                aria-label="服务时段"
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
            status={<StatusTag tone="success">已选择</StatusTag>}
            actionLabel="更换服务"
            onClick={() => {
              window.location.href = `/customer/services?${new URLSearchParams({ cityCode }).toString()}`;
            }}
          />
        )}

        {quoteLoading && <LoadingState title="正在获取报价" description="读取当前服务和数量的实时价格" />}
        {quoteFailed && (
          <ErrorState
            title="报价获取失败"
            description={quoteState.error}
            action={
              <ActionDock
                actions={actionById["customer.pricing.retryQuote"] ? [actionById["customer.pricing.retryQuote"]] : []}
                onAction={() => retryQuote()}
              />
            }
          />
        )}
        {quoteReady && (
          <CustomerQuoteCard
            label={selectedSku?.name ?? "当前报价"}
            price={<PriceText amount={quoteState.quote.basePrice} currency={quoteState.quote.currency} />}
            meta={`${quoteState.quoteViewModel.priceText} · ${priceTypeLabel(quoteState.quoteViewModel.priceType)} · ${quoteState.quoteViewModel.sourceLabel}`}
          />
        )}

        <section className="customer-coupon-selection" aria-label="优惠券选择">
          <FormField
            label="优惠券"
            description="优惠资格、服务范围、数量和价格版本均由服务端校验"
          >
            <Select
              aria-label="优惠券"
              value={selectedCouponGrantId}
              disabled={!couponsReady}
              onChange={(event) => setSelectedCouponGrantId(event.target.value)}
            >
              <option value="">不使用优惠券</option>
              {couponsReady && couponState.grants.map((grant) => (
                <option key={grant.couponGrantId} value={grant.couponGrantId}>
                  可用优惠券 · {new Date(grant.expiresAt).toLocaleDateString("zh-CN")} 到期
                </option>
              ))}
            </Select>
          </FormField>
          {couponsLoading && <LoadingState title="正在加载优惠券" description="读取当前账号可用优惠券" />}
          {couponsFailed && <ErrorState title="优惠券加载失败" description={couponState.error} />}
          {selectedCouponGrantId && (
            <Button
              type="button"
              disabled={decisionLoading || !quoteReady}
              onClick={() => void applySelectedCoupon()}
            >
              {decisionLoading ? "正在校验优惠券" : "使用所选优惠券"}
            </Button>
          )}
          {decisionFailed && (
            <ErrorState title="优惠券暂不可用" description={`${decisionState.error} 系统不会自动改为原价提交。`} />
          )}
          {decisionReady && (
            <div className="customer-coupon-summary">
              <StatusTag tone="success">服务端校验通过</StatusTag>
              <span>原价：{formatServerMarketingMinor(decisionState.decision.grossAmountMinor)}</span>
              <span>优惠：-{formatServerMarketingMinor(decisionState.decision.discountAmountMinor)}</span>
              <strong>应付：{formatServerMarketingMinor(decisionState.decision.netAmountMinor)}</strong>
              <small>本次优惠结果有效至 {new Date(decisionState.decision.expiresAt).toLocaleString("zh-CN")}</small>
            </div>
          )}
        </section>

        <WorkflowTimeline
          items={[
            { key: "catalog", title: "选择服务", description: selectedSku ? "服务已选择" : "等待选择服务", state: selectedSku ? "complete" : "current" },
            {
              key: "quote",
              title: "确认报价",
              description: quoteReady ? "实时报价已返回" : "等待报价",
              state: quoteReady ? "complete" : "current",
            },
            {
              key: "address",
              title: "填写地址",
              description: isAddressReady ? `${selectedDistrict} ${orderFormDetails.detailAddress}` : "等待完整地址和联系方式",
              state: isAddressReady ? "complete" : quoteReady ? "current" : "pending",
            },
            {
              key: "schedule",
              title: "预约时间",
              description: isScheduleReady ? formatScheduledLabel(orderFormDetails.scheduledAt, orderFormDetails.scheduledTimeSlot) : "等待预约时间",
              state: isScheduleReady ? "complete" : isAddressReady ? "current" : "pending",
            },
            {
              key: "order",
              title: "创建订单",
              description:
                submitReady
                  ? `订单已创建 ${submitState.order.orderId}`
                  : submitFailed
                    ? "提交受阻"
                    : "等待提交",
              state:
                submitReady ? "complete" : submitFailed ? "blocked" : "pending",
            },
            {
              key: "payment",
              title: "服务后支付",
              description:
                submitReady
                  ? "等待服务完成并由顾客确认"
                  : "等待订单创建",
              state: "pending",
            },
          ]}
        />

        <ActionDock
          actions={actionById["customer.order.submit"] ? [actionById["customer.order.submit"]] : []}
          onAction={() => void submitOrder()}
          density="compact"
        />

        {submitFailed && (
          <ErrorState
            title="订单提交失败"
            description={submitState.error}
            action={<Button type="button" onClick={() => void submitOrder()}>
              重新提交
            </Button>}
          />
        )}
        {submitReady && (
          <div style={{ display: "grid", gap: 10 }}>
            <StatusTag tone="success">订单号：{submitState.order.orderId}</StatusTag>
            <ServiceCard
              title={submitState.order.skuName}
              subtitle={`${submitState.orderDetail.quantity} ${submitState.orderDetail.unit} / ${submitState.orderDetail.addressDistrict} ${submitState.orderDetail.detailAddress} / ${formatScheduledLabel(submitState.orderDetail.scheduledAt, submitState.orderDetail.scheduledTimeSlot)}`}
              status={<StatusTag tone={statusTone(submitState.orderDetail.status)}>{orderStatusLabel(submitState.orderDetail.status)}</StatusTag>}
              priceText={<PriceText amount={submitState.orderDetail.totalAmount} currency={submitState.orderDetail.currency} />}
              actionLabel="查看订单详情"
              onClick={() => {
                window.location.href = "/customer/orders";
              }}
            />
            <StatusTag tone="warning">服务完成并确认后方可进入支付</StatusTag>
          </div>
        )}
      </section>

      <CustomerAnswerCard state={binding.state} />
    </CustomerOrderCreateTemplate>
    </div>
  );
}
