import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarBlank,
  Check,
  CheckCircle,
  Clock,
  HouseLine,
  MapPinLine,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
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
  Button,
  CustomerOrderCreateTemplate,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PriceText,
  QuantityStepper,
  Select,
  StatusTag,
  Textarea,
} from "@xlb/ui";
import type { CustomerLoadable } from "./customerPageShell";
import {
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
import { CustomerRouteShell, useSearchParamSku } from "./customerPageShell";
import {
  formatServerMarketingMinor,
  isCustomerCouponGrantSelectable,
} from "../adapters/marketingAdapter";
import { toCustomerError } from "../adapters/customerError";
import "./customer-order-create.css";

type BookingStep = 1 | 2 | 3 | 4;

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

const bookingSteps: ReadonlyArray<{ step: BookingStep; label: string }> = [
  { step: 1, label: "服务" },
  { step: 2, label: "地址" },
  { step: 3, label: "时间" },
  { step: 4, label: "确认" },
];

function formatDayOption(offsetDays: number, fallbackLabel: string): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const datePart = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "short" });
  return `${fallbackLabel} ${datePart} ${weekday}`;
}

function BookingTopBar({ step }: { step: BookingStep }) {
  return (
    <header className="order-create-topbar">
      <button
        aria-label="返回服务列表"
        className="order-create-icon-button"
        onClick={() => { window.location.href = "/customer/services"; }}
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={24} weight="bold" />
      </button>
      <strong>预约服务</strong>
      <span aria-label={`当前第 ${step} 步，共 4 步`}>{`${step} / 4`}</span>
    </header>
  );
}

function BookingProgress({
  activeStep,
  maxAccessibleStep,
  onStepChange,
}: {
  activeStep: BookingStep;
  maxAccessibleStep: BookingStep;
  onStepChange: (step: BookingStep) => void;
}) {
  return (
    <ol aria-label="预约进度" className="order-create-progress">
      {bookingSteps.map(({ step, label }) => {
        const isComplete = step < activeStep;
        const isActive = step === activeStep;
        const isAccessible = step <= maxAccessibleStep;
        return (
          <li className={isComplete ? "is-complete" : isActive ? "is-active" : ""} key={step}>
            <button
              aria-current={isActive ? "step" : undefined}
              aria-label={`${label}${isComplete ? "，已完成" : isActive ? "，当前步骤" : ""}`}
              disabled={!isAccessible}
              onClick={() => onStepChange(step)}
              type="button"
            >
              <span>{isComplete ? <Check aria-hidden="true" size={17} weight="bold" /> : step}</span>
              <small>{label}</small>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <header className="order-create-step-heading">
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function ReviewRow({ icon, label, value, meta }: { icon: ReactNode; label: string; value: string; meta?: string }) {
  return (
    <div className="order-create-review-row">
      <span aria-hidden="true" className="order-create-review-icon">{icon}</span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {meta ? <em>{meta}</em> : null}
      </span>
    </div>
  );
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
  const [activeStep, setActiveStep] = useState<BookingStep>(() => initialSkuId ? 2 : 1);
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
  const maxAccessibleStep: BookingStep = !selectedSku ? 1 : isAddressReady ? 4 : 2;

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

  function changeStep(step: BookingStep) {
    if (step > maxAccessibleStep) return;
    clearSubmitError();
    setActiveStep(step);
  }

  function handlePrimaryAction() {
    clearSubmitError();
    if (activeStep === 1 && selectedSku) setActiveStep(2);
    else if (activeStep === 2 && isAddressReady) setActiveStep(3);
    else if (activeStep === 3 && isScheduleReady) setActiveStep(4);
    else if (activeStep === 4 && quoteState.status === "error") retryQuote();
    else if (activeStep === 4) void submitOrder();
  }

  const primaryLabel = activeStep === 1
    ? "下一步：填写地址"
    : activeStep === 2
      ? "下一步：选择时间"
      : activeStep === 3
        ? "下一步：确认预约"
        : quoteState.status === "error"
          ? "重新获取报价"
          : submitState.status === "submitting" ? "正在提交预约…" : "提交预约";
  const primaryDisabled = activeStep === 1
    ? !selectedSku
    : activeStep === 2
      ? !isAddressReady
      : activeStep === 3
        ? !isScheduleReady
        : quoteState.status === "error" ? false : !canSubmit;

  const selectedServiceSummary = selectedSku ? (
    <section className="order-create-service-summary">
      <span aria-hidden="true"><HouseLine size={22} /></span>
      <div><small>已选服务</small><strong>{selectedSku.name}</strong><em>{selectedSkuSummary?.subtitle}</em></div>
      <button onClick={() => changeStep(1)} type="button">修改</button>
    </section>
  ) : null;

  let stepContent: ReactNode;
  if (activeStep === 1) {
    stepContent = (
      <section className="order-create-step" data-step="service">
        <StepHeading title="选择服务" description="服务名称和可用范围均来自当前城市正式服务目录" />
        {catalogState.status === "loading" || catalogState.status === "pending" ? <div className="order-create-state"><LoadingState title="服务目录加载中" description="正在读取当前城市可预约服务" /></div> : null}
        {catalogState.status === "error" ? <div className="order-create-state"><ErrorState title="服务目录加载失败" description={catalogState.error} /></div> : null}
        {catalogState.status === "success" && optionSkus.length === 0 ? <div className="order-create-state"><EmptyState title="暂无可预约服务" description="当前城市暂时没有可用服务，请稍后再试" /></div> : null}
        {catalogState.status === "success" && optionSkus.length > 0 ? (
          <div className="order-create-form-group">
            <label className="order-create-field order-create-field-stacked">
              <span>服务项目</span>
              <Select aria-label="服务项目" value={selectedSkuId} onChange={(event) => setSelectedSkuId(event.target.value)}>
                <option value="">请选择服务</option>
                {optionSkus.map((sku) => <option key={sku.skuId} value={sku.skuId}>{getCatalogSkuDisplayLabel(sku).optionLabel}</option>)}
              </Select>
            </label>
            <div className="order-create-field order-create-quantity-row">
              <span><strong>服务数量</strong><small>最少 1 份</small></span>
              <QuantityStepper min={1} value={quantity} onChange={setQuantity} />
            </div>
            {selectedSku ? <div className="order-create-selected-detail" role="status"><CheckCircle aria-hidden="true" size={20} weight="fill" /><span><strong>{selectedSku.name}</strong><small>{selectedSkuSummary?.subtitle}</small></span></div> : null}
          </div>
        ) : null}
      </section>
    );
  } else if (activeStep === 2) {
    stepContent = (
      <section className="order-create-step" data-step="address">
        <StepHeading title="填写地址" description="请填写服务地址，便于师傅准时上门" />
        <div className="order-create-form-group">
          {addressState.status === "loading" ? <div className="order-create-state"><LoadingState title="正在加载常用地址" description="读取账号已保存的服务地址" /></div> : null}
          {addressState.status === "error" ? <div className="order-create-state"><ErrorState title="常用地址暂不可用" description={addressState.error} /></div> : null}
          {addressState.status === "success" && addressState.addresses.length > 0 ? (
            <label className="order-create-field order-create-field-stacked">
              <span>常用地址</span>
              <Select
                aria-label="常用地址"
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
                <option value="">手动填写新地址</option>
                {addressState.addresses.map((address) => <option key={address.addressId} value={address.addressId}>{`${address.isDefault ? "默认 · " : ""}${address.contactName} · ${address.district}${address.detailAddress} · ${address.contactPhoneMasked}`}</option>)}
              </Select>
            </label>
          ) : null}
          <label className="order-create-field"><span>所在区域</span><Select aria-label="所在区域" value={selectedDistrict} onChange={(event) => setSelectedDistrict(event.target.value)}>{addressOption.districts.map((district) => <option key={district} value={district}>{district}</option>)}</Select></label>
          <label className="order-create-field order-create-field-textarea"><span>详细地址</span><span><Textarea aria-label="详细地址" maxLength={60} onChange={(event) => setDetailAddress(event.target.value)} placeholder="请填写小区、楼栋、门牌号等" value={detailAddress} /><small>{`${detailAddress.length}/60`}</small></span></label>
          <label className="order-create-field"><span>联系人</span><Input aria-label="联系人" autoComplete="name" onChange={(event) => setContactName(event.target.value)} placeholder="请填写联系人姓名" value={contactName} /></label>
          <label className="order-create-field"><span>手机号</span><span><Input aria-describedby="order-phone-hint" aria-invalid={Boolean(contactPhone) && !isContactPhoneValid} aria-label="手机号" autoComplete="tel" inputMode="tel" maxLength={11} onChange={(event) => setContactPhone(event.target.value.replace(/\D/g, ""))} placeholder="请填写常用手机号" value={contactPhone} />{contactPhone && !isContactPhoneValid ? <small className="is-error" id="order-phone-hint">请输入 11 位中国大陆手机号</small> : null}</span></label>
        </div>
        <section className="order-create-next-preview" aria-label="下一步预约时间">
          <h3>下一步：预约时间</h3>
          <div><CalendarBlank aria-hidden="true" size={21} /><span>服务日期</span><strong>{formatDayOption(scheduleDayOffset, scheduleDayOptions.find((item) => item.offsetDays === scheduleDayOffset)?.label ?? "已选")}</strong></div>
          <div><Clock aria-hidden="true" size={21} /><span>服务时段</span><strong>{`${selectedTimeSlot.label} ${selectedTimeSlot.timeRange}`}</strong></div>
        </section>
      </section>
    );
  } else if (activeStep === 3) {
    stepContent = (
      <section className="order-create-step" data-step="schedule">
        <StepHeading title="选择上门时间" description="请选择方便接待师傅的日期和时间段" />
        <fieldset className="order-create-choice-group"><legend>服务日期</legend><div className="order-create-choice-grid">{scheduleDayOptions.map((option) => <button aria-pressed={scheduleDayOffset === option.offsetDays} className={scheduleDayOffset === option.offsetDays ? "is-selected" : ""} key={option.offsetDays} onClick={() => setScheduleDayOffset(option.offsetDays)} type="button"><CalendarBlank aria-hidden="true" size={20} /><span>{formatDayOption(option.offsetDays, option.label)}</span></button>)}</div></fieldset>
        <fieldset className="order-create-choice-group"><legend>服务时段</legend><div className="order-create-choice-grid">{serviceTimeSlots.map((slot) => <button aria-pressed={scheduledTimeSlot === slot.slot} className={scheduledTimeSlot === slot.slot ? "is-selected" : ""} key={slot.slot} onClick={() => setScheduledTimeSlot(slot.slot)} type="button"><Clock aria-hidden="true" size={20} /><span>{`${slot.label} ${slot.timeRange}`}</span></button>)}</div></fieldset>
        <div className="order-create-schedule-note"><ShieldCheck aria-hidden="true" size={20} /><span>师傅接单后，具体上门安排会在订单中持续更新。</span></div>
      </section>
    );
  } else {
    stepContent = (
      <section className="order-create-step" data-step="confirm">
        <StepHeading title="确认预约" description="请核对服务信息，提交后将进入真实订单流程" />
        <section className="order-create-review-list" aria-label="预约信息">
          <ReviewRow icon={<HouseLine size={21} />} label="服务" value={selectedSku?.name ?? "未选择"} meta={`${quantity} ${selectedSku?.unit ?? ""}`.trim()} />
          <ReviewRow icon={<MapPinLine size={21} />} label="服务地址" value={`${selectedDistrict} ${orderFormDetails.detailAddress}`} meta={`${orderFormDetails.contactName} ${orderFormDetails.contactPhone}`} />
          <ReviewRow icon={<CalendarBlank size={21} />} label="上门时间" value={formatScheduledLabel(orderFormDetails.scheduledAt, orderFormDetails.scheduledTimeSlot)} />
        </section>
        <section className="order-create-quote" aria-label="服务报价">
          <header><span>服务端报价</span><small>最终以提交时服务端确认为准</small></header>
          {quoteState.status === "loading" || quoteState.status === "pending" ? <LoadingState title="正在获取报价" description="请稍候，正在读取服务端价格" /> : null}
          {quoteState.status === "error" ? <ErrorState title="报价获取失败" description={quoteState.error} /> : null}
          {quoteState.status === "success" ? <div className="order-create-quote-value"><span><strong>{quoteState.quote.priceText}</strong><small>{quoteState.quote.priceType}</small></span><PriceText amount={quoteState.quote.basePrice} currency={quoteState.quote.currency} /></div> : null}
        </section>
        {couponState.status === "success" && couponState.grants.length > 0 ? <section className="order-create-coupon"><label><span>优惠券（可选）</span><Select value={selectedCouponGrantId} onChange={(event) => setSelectedCouponGrantId(event.target.value)}><option value="">不使用优惠券</option>{couponState.grants.map((grant) => <option key={grant.couponGrantId} value={grant.couponGrantId}>{`${grant.issuanceReason} / ${new Date(grant.expiresAt).toLocaleDateString("zh-CN")} 到期`}</option>)}</Select></label>{selectedCouponGrantId ? <Button disabled={decisionState.status === "loading" || quoteState.status !== "success"} onClick={() => void applySelectedCoupon()}>{decisionState.status === "loading" ? "正在校验…" : "校验并使用"}</Button> : null}{decisionState.status === "error" ? <p className="order-create-inline-error" role="alert">{decisionState.error}</p> : null}{decisionState.status === "success" ? <div className="order-create-coupon-result" role="status"><StatusTag tone="success">服务端已校验</StatusTag><span>{`优惠 -${formatServerMarketingMinor(decisionState.decision.discountAmountMinor)}`}</span><strong>{`实付 ${formatServerMarketingMinor(decisionState.decision.netAmountMinor)}`}</strong></div> : null}</section> : null}
        {couponState.status === "error" ? <p className="order-create-optional-error">优惠券暂不可用，不影响按原价预约。</p> : null}
        {submitState.status === "error" ? <div className="order-create-submit-error" role="alert"><WarningCircle aria-hidden="true" size={20} /><span>{submitState.error}</span></div> : null}
      </section>
    );
  }

  const successContent = submitState.status === "success" ? (
    <section className="order-create-success" aria-live="polite">
      <CheckCircle aria-hidden="true" size={58} weight="fill" /><span>预约已提交</span><h2>{submitState.order.skuName}</h2><p>订单已由服务端确认创建，后续进度可在订单页查看。</p>
      <dl><div><dt>订单号</dt><dd>{submitState.order.orderId}</dd></div><div><dt>上门时间</dt><dd>{formatScheduledLabel(submitState.orderDetail.scheduledAt, submitState.orderDetail.scheduledTimeSlot)}</dd></div><div><dt>服务地址</dt><dd>{`${submitState.orderDetail.addressDistrict} ${submitState.orderDetail.detailAddress}`}</dd></div><div><dt>订单状态</dt><dd><StatusTag tone={statusTone(submitState.orderDetail.status)}>{orderStatusLabel(submitState.orderDetail.status)}</StatusTag></dd></div></dl>
      <Button variant="primary" onClick={() => { window.location.href = "/customer/orders"; }}>查看订单</Button>
    </section>
  ) : null;

  return (
    <CustomerRouteShell currentRoute="createOrder" topBar={<BookingTopBar step={submitState.status === "success" ? 4 : activeStep} />}>
      <CustomerOrderCreateTemplate route="/customer/order/create" cityCode={cityCode} binding={binding}>
        <BookingProgress activeStep={submitState.status === "success" ? 4 : activeStep} maxAccessibleStep={submitState.status === "success" ? 4 : maxAccessibleStep} onStepChange={submitState.status === "success" ? () => undefined : changeStep} />
        {successContent ?? <>{activeStep > 1 ? selectedServiceSummary : null}{stepContent}<div className="order-create-primary-dock"><Button aria-disabled={primaryDisabled} disabled={primaryDisabled} onClick={handlePrimaryAction} variant="primary">{primaryLabel}</Button></div></>}
      </CustomerOrderCreateTemplate>
    </CustomerRouteShell>
  );

}
