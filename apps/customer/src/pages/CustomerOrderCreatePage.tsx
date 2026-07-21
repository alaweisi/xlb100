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
  CustomerQuoteCard,
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
import type { CustomerAppFailure, CustomerLoadable } from "./customerPageShell";
import { describeCustomerAppError, useSearchParamSku } from "./customerPageShell";
import {
  dedupeCatalogSkusByName,
  getCatalogSkuDisplayLabel,
  getCatalogSkus as normalizeCatalogSkus,
} from "../adapters/catalogAdapters";
import { toCustomerQuoteViewModel } from "../adapters/pricingAdapter";
import { createCustomerUiBinding } from "../adapters/workflowAdapter";
import { assignCustomerDeepLink } from "../routes/customerDeepLinks";
import {
  buildScheduledAt,
  formatScheduledLabel,
  getOrderAddressOption,
  getServiceTimeSlot,
  scheduleDayOptions,
  serviceTimeSlots,
} from "../adapters/orderAddressOptions";
import {
  formatServerMarketingMinor,
  isCustomerCouponGrantSelectable,
} from "../adapters/marketingAdapter";
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
  | { status: "error"; failure: CustomerAppFailure };

type CouponState =
  | { status: "loading" }
  | { status: "success"; grants: CouponGrant[] }
  | { status: "error"; error: string };

type AddressState =
  | { status: "loading" }
  | { status: "success"; addresses: CustomerAddress[] }
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
      customerId?: string;
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
    listAddresses?(): Promise<{ addresses: CustomerAddress[] }>;
  };
  catalogState: CustomerLoadable<CatalogSnapshot>;
  cityCode: CityCode;
  onOrderCreated: (orderId: string) => void;
  onRetryCatalog?: () => void;
}

const bookingSteps: ReadonlyArray<{ step: BookingStep; label: string }> = [
  { step: 1, label: "服务" },
  { step: 2, label: "地址" },
  { step: 3, label: "时间" },
  { step: 4, label: "确认" },
];

const cityLabels: Record<CityCode, string> = {
  hangzhou: "杭州",
  shanghai: "上海",
  beijing: "北京",
};

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
  return { skuId, quantity, ...details };
}

function formatDayOption(offsetDays: number, fallbackLabel: string): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const datePart = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  const weekday = date.toLocaleDateString("zh-CN", { weekday: "short" });
  return `${fallbackLabel} ${datePart} ${weekday}`;
}

function BookingTopBar({ step, cityCode }: { step: BookingStep; cityCode: CityCode }) {
  return (
    <header className="order-create-topbar">
      <button
        aria-label="返回服务列表"
        className="order-create-icon-button"
        onClick={() => assignCustomerDeepLink("services", { cityCode })}
        type="button"
      >
        <ArrowLeft aria-hidden="true" size={24} weight="bold" />
      </button>
      <strong>预约服务</strong>
      <span aria-label={`当前第 ${step} 步，共 4 步`}>{`${step} / 4`}</span>
      <small>{cityLabels[cityCode]}</small>
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

export function CustomerOrderCreatePage({
  api,
  catalogState,
  cityCode,
  onOrderCreated,
  onRetryCatalog,
}: CustomerOrderCreatePageProps) {
  const initialSkuId = useSearchParamSku();
  const [activeStep, setActiveStep] = useState<BookingStep>(() => initialSkuId ? 2 : 1);
  const [selectedSkuId, setSelectedSkuId] = useState(initialSkuId ?? "");
  const [quantity, setQuantity] = useState(1);
  const addressOption = useMemo(() => getOrderAddressOption(cityCode), [cityCode]);
  const [selectedDistrict, setSelectedDistrict] = useState(() => addressOption.districts[0]);
  const [detailAddress, setDetailAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressState, setAddressState] = useState<AddressState>({ status: "loading" });
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
    return normalizeCatalogSkus(catalogState.data);
  }, [catalogState]);
  const skus = useMemo(() => dedupeCatalogSkusByName(allSkus), [allSkus]);
  const selectedSku = allSkus.find((sku) => sku.skuId === selectedSkuId) ?? null;
  const selectedSkuSummary = selectedSku ? getCatalogSkuDisplayLabel(selectedSku) : null;
  const optionSkus = useMemo(() => {
    if (!selectedSku || skus.some((sku) => sku.skuId === selectedSkuId)) return skus;
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
  const isAddressReady = Boolean(orderFormDetails.addressDistrict)
    && orderFormDetails.detailAddress.length >= 2
    && Boolean(orderFormDetails.contactName)
    && isContactPhoneValid;
  const isScheduleReady = Boolean(orderFormDetails.scheduledAt) && Boolean(orderFormDetails.scheduledTimeSlot);
  const hasCurrentDecision = decisionState.status === "success"
    && decisionState.decision.couponGrantId === selectedCouponGrantId
    && decisionState.decision.skuId === selectedSkuId
    && decisionState.decision.quantity === quantity;
  const canSubmit = Boolean(selectedSkuId)
    && quoteState.status === "success"
    && isAddressReady
    && isScheduleReady
    && (!selectedCouponGrantId || hasCurrentDecision)
    && submitState.status !== "submitting";
  const maxAccessibleStep: BookingStep = !selectedSku ? 1 : isAddressReady ? 4 : 2;

  useEffect(() => {
    if (!api.listAddresses) {
      setAddressState({ status: "success", addresses: [] });
      return;
    }
    let cancelled = false;
    setAddressState({ status: "loading" });
    void api.listAddresses()
      .then((response) => {
        if (cancelled) return;
        const addresses = response.addresses.filter((address) => address.cityCode === cityCode);
        setAddressState({ status: "success", addresses });
        const preferred = addresses.find((address) => address.isDefault) ?? addresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.addressId);
          setSelectedDistrict(preferred.district);
          setDetailAddress(preferred.detailAddress);
          setContactName(preferred.contactName);
          setContactPhone("");
        }
      })
      .catch(() => {
        if (!cancelled) setAddressState({ status: "error", error: "常用地址暂时无法读取，仍可手动填写新地址。" });
      });
    return () => { cancelled = true; };
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
        error: error instanceof Error ? error.message : "优惠券加载失败",
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
    if (!initialSkuId || catalogState.status !== "success") return;
    if (allSkus.some((sku) => sku.skuId === initialSkuId)) {
      setSelectedSkuId(initialSkuId);
      setActiveStep((current) => current === 1 ? 2 : current);
    }
  }, [allSkus, catalogState.status, initialSkuId]);

  useEffect(() => {
    if (catalogState.status === "success" && selectedSkuId && !selectedSku) {
      setSelectedSkuId("");
      setActiveStep(1);
    }
  }, [catalogState.status, selectedSku, selectedSkuId]);

  useEffect(() => {
    if (!selectedSkuId) {
      setQuoteState({ status: "pending" });
      return;
    }
    setQuoteState({ status: "loading" });
    void api.getPriceQuote(selectedSkuId)
      .then((result) => setQuoteState({
        status: "success",
        quote: result.quote,
        quoteViewModel: toCustomerQuoteViewModel(result.quote),
      }))
      .catch((error: unknown) => {
        setQuoteState({ status: "error", error: error instanceof Error ? error.message : "报价获取失败" });
      });
  }, [api, selectedSkuId]);

  function retryQuote() {
    if (!selectedSkuId) return;
    setQuoteState({ status: "loading" });
    void api.getPriceQuote(selectedSkuId)
      .then((result) => setQuoteState({
        status: "success",
        quote: result.quote,
        quoteViewModel: toCustomerQuoteViewModel(result.quote),
      }))
      .catch((error: unknown) => {
        setQuoteState({ status: "error", error: error instanceof Error ? error.message : "报价获取失败" });
      });
  }

  async function applySelectedCoupon() {
    if (!selectedCouponGrantId || !selectedSkuId || !api.issueDiscountDecision) {
      setDecisionState({ status: "error", error: "请先选择可用优惠券和服务" });
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
        error: error instanceof Error ? error.message : "优惠券校验失败，请重试",
      });
    }
  }

  async function submitOrder() {
    if (!canSubmit || !selectedSkuId) {
      setSubmitState({
        status: "error",
        failure: {
          kind: "unknown",
          title: "预约信息尚未完整",
          description: "请完成服务、地址、联系人和预约时间后再提交。",
          retryLabel: "继续填写",
        },
      });
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
      setSubmitState({ status: "error", failure: describeCustomerAppError(error) });
    }
  }

  function changeStep(step: BookingStep) {
    if (step > maxAccessibleStep) return;
    setSubmitState((current) => current.status === "error" ? { status: "pending" } : current);
    setActiveStep(step);
  }

  function handlePrimaryAction() {
    if (activeStep === 1 && selectedSku) setActiveStep(2);
    else if (activeStep === 2 && isAddressReady) setActiveStep(3);
    else if (activeStep === 3 && isScheduleReady) setActiveStep(4);
    else if (activeStep === 4) void submitOrder();
  }

  const primaryLabel = activeStep === 1
    ? "下一步：填写地址"
    : activeStep === 2
      ? "下一步：选择时间"
      : activeStep === 3
        ? "下一步：确认预约"
        : submitState.status === "submitting"
          ? "正在提交预约…"
          : "提交预约";
  const primaryDisabled = activeStep === 1
    ? !selectedSku
    : activeStep === 2
      ? !isAddressReady
      : activeStep === 3
        ? !isScheduleReady
        : !canSubmit;
  const primaryDisabledReason = activeStep === 1 && !selectedSku
    ? "请先选择一项可预约服务"
    : activeStep === 2 && !orderFormDetails.detailAddress
      ? "请填写详细服务地址"
      : activeStep === 2 && !orderFormDetails.contactName
        ? "请填写联系人"
        : activeStep === 2 && !isContactPhoneValid
          ? "请填写正确的 11 位手机号"
          : activeStep === 4 && quoteState.status === "loading"
            ? "正在等待服务端报价"
            : activeStep === 4 && quoteState.status === "error"
              ? "请先重新获取报价"
              : activeStep === 4 && selectedCouponGrantId && !hasCurrentDecision
                ? "请先完成优惠券校验"
                : "";

  const selectedServiceSummary = selectedSku ? (
    <section className="order-create-service-summary">
      <span aria-hidden="true"><HouseLine size={22} weight="regular" /></span>
      <div>
        <small>已选服务</small>
        <strong>{selectedSku.name}</strong>
        <em>{selectedSkuSummary?.subtitle}</em>
      </div>
      <button onClick={() => changeStep(1)} type="button">修改</button>
    </section>
  ) : null;

  let stepContent: ReactNode;
  if (activeStep === 1) {
    stepContent = (
      <section className="order-create-step" data-step="service">
        <StepHeading title="选择服务" description="服务名称和可用范围均来自当前城市的正式服务目录" />
        {catalogState.status === "loading" || catalogState.status === "pending" ? (
          <div className="order-create-state"><LoadingState title="服务目录加载中" description="正在读取当前城市可预约服务" /></div>
        ) : null}
        {catalogState.status === "error" ? (
          <div className="order-create-state">
            <ErrorState
              title="服务目录加载失败"
              description={catalogState.error}
              action={<Button onClick={onRetryCatalog ?? (() => window.location.reload())}>重新加载</Button>}
            />
          </div>
        ) : null}
        {catalogState.status === "success" && optionSkus.length === 0 ? (
          <div className="order-create-state"><EmptyState title="暂无可预约服务" description="当前城市暂时没有可用服务，请稍后再试" /></div>
        ) : null}
        {catalogState.status === "success" && optionSkus.length > 0 ? (
          <div className="order-create-form-group">
            <label className="order-create-field order-create-field-stacked">
              <span>服务项目</span>
              <Select
                aria-label="服务项目"
                value={selectedSkuId}
                onChange={(event) => setSelectedSkuId(event.target.value)}
              >
                <option value="">请选择服务</option>
                {optionSkus.map((sku) => (
                  <option key={sku.skuId} value={sku.skuId}>{getCatalogSkuDisplayLabel(sku).optionLabel}</option>
                ))}
              </Select>
            </label>
            <div className="order-create-field order-create-quantity-row">
              <span>
                <strong>服务数量</strong>
                <small>最少 1 份</small>
              </span>
              <QuantityStepper min={1} value={quantity} onChange={setQuantity} />
            </div>
            {selectedSku ? (
              <div className="order-create-selected-detail" role="status">
                <CheckCircle aria-hidden="true" size={20} weight="fill" />
                <span><strong>{selectedSku.name}</strong><small>{selectedSkuSummary?.subtitle}</small></span>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  } else if (activeStep === 2) {
    stepContent = (
      <section className="order-create-step" data-step="address">
        <StepHeading title="填写地址" description="请填写服务地址，便于师傅准时上门" />
        <div className="order-create-form-group">
          {addressState.status === "loading" ? (
            <LoadingState title="正在加载常用地址" description="读取账号已保存的服务地址" productRole="customer" />
          ) : null}
          {addressState.status === "error" ? (
            <ErrorState title="常用地址暂不可用" description={addressState.error} productRole="customer" />
          ) : null}
          {addressState.status === "success" && addressState.addresses.length > 0 ? (
            <label className="order-create-field">
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
                <option value="">填写新地址</option>
                {addressState.addresses.map((address) => (
                  <option key={address.addressId} value={address.addressId}>
                    {address.isDefault ? "默认 · " : ""}{address.district} {address.detailAddress} · {address.contactName} {address.contactPhoneMasked}
                  </option>
                ))}
              </Select>
              <small>为保护隐私，提交前仍需补充完整手机号。</small>
            </label>
          ) : null}
          <label className="order-create-field">
            <span>所在区域</span>
            <Select
              aria-label="所在区域"
              value={selectedDistrict}
              onChange={(event) => setSelectedDistrict(event.target.value)}
            >
              {addressOption.districts.map((district) => <option key={district} value={district}>{district}</option>)}
            </Select>
          </label>
          <label className="order-create-field order-create-field-textarea">
            <span>详细地址</span>
            <span>
              <Textarea
                aria-label="详细地址"
                maxLength={60}
                onChange={(event) => setDetailAddress(event.target.value)}
                placeholder="请填写小区、楼栋、门牌号等"
                value={detailAddress}
              />
              <small>{`${detailAddress.length}/60`}</small>
            </span>
          </label>
          <label className="order-create-field">
            <span>联系人</span>
            <Input
              aria-label="联系人"
              autoComplete="name"
              onChange={(event) => setContactName(event.target.value)}
              placeholder="请填写联系人姓名"
              value={contactName}
            />
          </label>
          <label className="order-create-field">
            <span>手机号</span>
            <span>
              <Input
                aria-describedby="order-phone-hint"
                aria-invalid={Boolean(contactPhone) && !isContactPhoneValid}
                aria-label="手机号"
                autoComplete="tel"
                inputMode="tel"
                maxLength={11}
                onChange={(event) => setContactPhone(event.target.value.replace(/\D/g, ""))}
                placeholder="请填写常用手机号"
                value={contactPhone}
              />
              {contactPhone && !isContactPhoneValid ? <small className="is-error" id="order-phone-hint">请输入 11 位中国大陆手机号</small> : null}
            </span>
          </label>
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
        <fieldset className="order-create-choice-group">
          <legend>服务日期</legend>
          <div className="order-create-choice-grid">
            {scheduleDayOptions.map((option) => (
              <button
                aria-pressed={scheduleDayOffset === option.offsetDays}
                className={scheduleDayOffset === option.offsetDays ? "is-selected" : ""}
                key={option.offsetDays}
                onClick={() => setScheduleDayOffset(option.offsetDays)}
                type="button"
              >
                <CalendarBlank aria-hidden="true" size={20} />
                <span>{formatDayOption(option.offsetDays, option.label)}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="order-create-choice-group">
          <legend>服务时段</legend>
          <div className="order-create-choice-grid">
            {serviceTimeSlots.map((slot) => (
              <button
                aria-pressed={scheduledTimeSlot === slot.slot}
                className={scheduledTimeSlot === slot.slot ? "is-selected" : ""}
                key={slot.slot}
                onClick={() => setScheduledTimeSlot(slot.slot)}
                type="button"
              >
                <Clock aria-hidden="true" size={20} />
                <span>{`${slot.label} ${slot.timeRange}`}</span>
              </button>
            ))}
          </div>
        </fieldset>
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
          {quoteState.status === "loading" || quoteState.status === "pending" ? (
            <LoadingState title="正在获取报价" description="请稍候，正在读取服务端价格" />
          ) : null}
          {quoteState.status === "error" ? (
            <ErrorState title="报价获取失败" description={quoteState.error} action={<Button onClick={retryQuote}>重新获取</Button>} />
          ) : null}
          {quoteState.status === "success" ? (
            <CustomerQuoteCard
              className="order-create-quote-card"
              label="服务端实时报价"
              meta={`${quoteState.quoteViewModel.priceText} · ${quoteState.quoteViewModel.priceType}`}
              price={<PriceText amount={quoteState.quoteViewModel.basePrice} currency={quoteState.quoteViewModel.currency} />}
              status={<StatusTag tone="success">已获取</StatusTag>}
            />
          ) : null}
        </section>

        {couponState.status === "success" && couponState.grants.length > 0 ? (
          <section className="order-create-coupon">
            <label>
              <span>优惠券（可选）</span>
              <Select value={selectedCouponGrantId} onChange={(event) => setSelectedCouponGrantId(event.target.value)}>
                <option value="">不使用优惠券</option>
                {couponState.grants.map((grant) => (
                  <option key={grant.couponGrantId} value={grant.couponGrantId}>{`${grant.issuanceReason} / ${new Date(grant.expiresAt).toLocaleDateString("zh-CN")} 到期`}</option>
                ))}
              </Select>
            </label>
            {selectedCouponGrantId ? (
              <Button disabled={decisionState.status === "loading" || quoteState.status !== "success"} onClick={() => void applySelectedCoupon()}>
                {decisionState.status === "loading" ? "正在校验…" : "校验并使用"}
              </Button>
            ) : null}
            {decisionState.status === "error" ? <p className="order-create-inline-error" role="alert">{decisionState.error}</p> : null}
            {decisionState.status === "success" ? (
              <div className="order-create-coupon-result" role="status">
                <StatusTag tone="success">服务端已校验</StatusTag>
                <span>{`优惠 -${formatServerMarketingMinor(decisionState.decision.discountAmountMinor)}`}</span>
                <strong>{`实付 ${formatServerMarketingMinor(decisionState.decision.netAmountMinor)}`}</strong>
              </div>
            ) : null}
          </section>
        ) : null}
        {couponState.status === "error" ? <p className="order-create-optional-error">优惠券暂不可用，不影响按原价预约。</p> : null}
        {submitState.status === "error" ? (
          <div className="order-create-submit-error" data-error-kind={submitState.failure.kind} role="alert">
            <WarningCircle aria-hidden="true" size={20} />
            <span><strong>{submitState.failure.title}</strong><small>{submitState.failure.description}</small></span>
          </div>
        ) : null}
      </section>
    );
  }

  const successContent = submitState.status === "success" ? (
    <section className="order-create-success" aria-live="polite">
      <CheckCircle aria-hidden="true" size={58} weight="fill" />
      <span>预约已提交</span>
      <h2>{submitState.order.skuName}</h2>
      <p>订单已由服务端确认创建，后续进度可在订单页查看。</p>
      <dl>
        <div><dt>订单号</dt><dd>{submitState.order.orderId}</dd></div>
        <div><dt>上门时间</dt><dd>{formatScheduledLabel(submitState.orderDetail.scheduledAt, submitState.orderDetail.scheduledTimeSlot)}</dd></div>
        <div><dt>服务地址</dt><dd>{`${submitState.orderDetail.addressDistrict} ${submitState.orderDetail.detailAddress}`}</dd></div>
        <div><dt>订单状态</dt><dd><StatusTag tone={statusTone(submitState.orderDetail.status)}>{submitState.orderDetail.status}</StatusTag></dd></div>
      </dl>
      <Button variant="primary" onClick={() => assignCustomerDeepLink("orders", { cityCode })}>查看订单</Button>
    </section>
  ) : null;

  return (
    <>
      <BookingTopBar cityCode={cityCode} step={submitState.status === "success" ? 4 : activeStep} />
      <CustomerOrderCreateTemplate route="/customer/order/create" cityCode={cityCode} binding={binding}>
        <BookingProgress
          activeStep={submitState.status === "success" ? 4 : activeStep}
          maxAccessibleStep={submitState.status === "success" ? 4 : maxAccessibleStep}
          onStepChange={submitState.status === "success" ? () => undefined : changeStep}
        />
        {successContent ?? (
          <>
            {activeStep > 1 ? selectedServiceSummary : null}
            {stepContent}
            <div className="order-create-primary-dock">
              <Button
                aria-disabled={primaryDisabled}
                disabled={primaryDisabled}
                onClick={handlePrimaryAction}
                variant="primary"
              >
                {primaryLabel}
              </Button>
              {primaryDisabled && primaryDisabledReason ? (
                <small className="order-create-disabled-reason" role="status">{primaryDisabledReason}</small>
              ) : null}
            </div>
          </>
        )}
      </CustomerOrderCreateTemplate>
    </>
  );
}
