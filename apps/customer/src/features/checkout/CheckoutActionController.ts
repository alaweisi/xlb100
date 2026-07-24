import type {
  CityCode,
  CustomerAddress,
  PriceQuote,
  ScheduledTimeSlot,
} from "@xlb/types";
import { createOrderSchema } from "@xlb/validators";
import type {
  CheckoutCoordinator,
  CustomerCheckoutCreateResult,
} from "./CheckoutCoordinator.js";
import type {
  CustomerCheckoutDraft,
  CustomerCheckoutDraftErrors,
} from "./checkoutTypes.js";

export interface CustomerCheckoutActionScope {
  readonly cityCode: CityCode;
  readonly verifiedSkuId: string;
  readonly addresses: readonly CustomerAddress[];
  readonly quote: PriceQuote;
}

export type CustomerCheckoutSubmitResult =
  | {
      readonly status: "validation_error";
      readonly errors: CustomerCheckoutDraftErrors;
    }
  | {
      readonly status: "conflict";
      readonly conflictCode: "request_in_flight";
    }
  | CustomerCheckoutCreateResult;

const PHONE_PATTERN = /^1[3-9]\d{9}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function slotStart(slot: ScheduledTimeSlot): string {
  switch (slot) {
    case "morning":
      return "09:00:00";
    case "afternoon":
      return "14:00:00";
    case "evening":
      return "19:00:00";
  }
}

export function minimumCheckoutDate(now = new Date()): string {
  const next = new Date(now.getTime());
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const date = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function checkoutValidationErrors(
  draft: CustomerCheckoutDraft,
  scope: CustomerCheckoutActionScope,
  minimumDate: string,
): CustomerCheckoutDraftErrors {
  const errors: Partial<Record<
    "quantity" | "address" | "contactPhone" | "requestedDate" | "requestedTimeSlot" | "form",
    string
  >> = {};
  if (!Number.isInteger(draft.quantity) || draft.quantity < 1 || draft.quantity > 1000) {
    errors.quantity = "数量需为 1–1000 的整数";
  }
  const address = scope.addresses.find((candidate) =>
    candidate.addressId === draft.addressId);
  if (address === undefined || address.cityCode !== scope.cityCode) {
    errors.address = "请选择当前服务城市内的地址";
  }
  if (!PHONE_PATTERN.test(draft.contactPhone.trim())) {
    errors.contactPhone = "请输入该地址联系人的 11 位完整手机号码";
  }
  if (
    !DATE_PATTERN.test(draft.requestedDate) ||
    draft.requestedDate < minimumDate
  ) {
    errors.requestedDate = "请选择明天或之后的请求日期";
  }
  if (draft.requestedTimeSlot === null) {
    errors.requestedTimeSlot = "请选择一个请求时段";
  }
  return Object.freeze(errors);
}

export function checkoutStepCanContinue(
  step: "service" | "address" | "schedule" | "coupon",
  draft: CustomerCheckoutDraft,
  addresses: readonly CustomerAddress[],
  cityCode: CityCode,
  minimumDate: string,
): boolean {
  switch (step) {
    case "service":
      return Number.isInteger(draft.quantity) &&
        draft.quantity >= 1 &&
        draft.quantity <= 1000;
    case "address":
      return addresses.some((address) =>
        address.addressId === draft.addressId &&
        address.cityCode === cityCode) &&
        PHONE_PATTERN.test(draft.contactPhone.trim());
    case "schedule":
      return DATE_PATTERN.test(draft.requestedDate) &&
        draft.requestedDate >= minimumDate &&
        draft.requestedTimeSlot !== null;
    case "coupon":
      return true;
  }
}

export class CheckoutActionController {
  readonly #coordinator: CheckoutCoordinator;
  #submitInFlight = false;

  constructor(coordinator: CheckoutCoordinator) {
    this.#coordinator = coordinator;
  }

  async submit(
    draft: CustomerCheckoutDraft,
    scope: CustomerCheckoutActionScope,
    minimumDate = minimumCheckoutDate(),
  ): Promise<CustomerCheckoutSubmitResult> {
    const errors = checkoutValidationErrors(draft, scope, minimumDate);
    if (Object.keys(errors).length > 0) {
      return Object.freeze({ status: "validation_error", errors });
    }
    if (this.#submitInFlight) {
      return Object.freeze({
        status: "conflict",
        conflictCode: "request_in_flight",
      });
    }

    const address = scope.addresses.find((candidate) =>
      candidate.addressId === draft.addressId)!;
    const slot = draft.requestedTimeSlot!;
    const body = {
      skuId: scope.verifiedSkuId,
      quantity: draft.quantity,
      addressProvince: address.province,
      addressCity: address.city,
      addressDistrict: address.district,
      detailAddress: address.detailAddress,
      contactName: address.contactName,
      contactPhone: draft.contactPhone.trim(),
      scheduledAt: new Date(
        `${draft.requestedDate}T${slotStart(slot)}+08:00`,
      ).toISOString(),
      scheduledTimeSlot: slot,
    };
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return Object.freeze({
        status: "validation_error",
        errors: Object.freeze({
          form: "下单信息未通过正式订单契约校验，请检查后重试",
        }),
      });
    }

    this.#submitInFlight = true;
    try {
      /*
       * The current backend only accepts orderIdempotencyKey together with a
       * Marketing decision. Ordinary orders therefore rely on this submission
       * lock and must not claim server-side idempotency.
       */
      return await this.#coordinator.createOrder(
        scope.cityCode,
        scope.verifiedSkuId,
        parsed.data,
      );
    } finally {
      this.#submitInFlight = false;
    }
  }
}
