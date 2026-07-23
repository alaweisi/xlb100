import type {
  CustomerAddress,
  Order,
  PriceQuote,
  ScheduledTimeSlot,
} from "@xlb/types";
import type { CustomerServiceDetailViewModel } from "../service/serviceDetail.js";

export const CUSTOMER_CHECKOUT_STEPS = [
  "service",
  "address",
  "schedule",
  "coupon",
  "review",
] as const;

export type CustomerCheckoutStep = typeof CUSTOMER_CHECKOUT_STEPS[number];

export interface CustomerCheckoutDraft {
  readonly quantity: number;
  readonly addressId: string | null;
  /**
   * The Address API intentionally returns only contactPhoneMasked. The full
   * number is customer input held in memory for the current checkout only.
   */
  readonly contactPhone: string;
  readonly requestedDate: string;
  readonly requestedTimeSlot: ScheduledTimeSlot | null;
}

export type CustomerCheckoutDraftErrors = Readonly<
  Partial<Record<"quantity" | "address" | "contactPhone" | "requestedDate" | "requestedTimeSlot" | "form", string>>
>;

export interface CustomerCheckoutNotice {
  readonly kind: "info" | "error" | "conflict" | "success";
  readonly message: string;
}

export interface CustomerCheckoutViewModel {
  readonly currentStep: CustomerCheckoutStep;
  readonly service: CustomerServiceDetailViewModel;
  readonly quote: PriceQuote;
  readonly addresses: readonly CustomerAddress[];
  readonly selectedAddress: CustomerAddress | null;
  readonly draft: CustomerCheckoutDraft;
  readonly errors: CustomerCheckoutDraftErrors;
  readonly notice: CustomerCheckoutNotice | null;
  readonly quoteRefreshing: boolean;
  readonly submitting: boolean;
  readonly createdOrder: Order | null;
  readonly minimumRequestedDate: string;
  readonly couponCapability: "projection_unavailable";
}

export interface CustomerCheckoutActions {
  readonly onBack: () => void;
  readonly onPreviousStep: () => void;
  readonly onNextStep: () => void;
  readonly onQuantityChange: (quantity: number) => void;
  readonly onAddressSelect: (addressId: string) => void;
  readonly onOpenAddressPicker: () => void;
  readonly onContactPhoneChange: (contactPhone: string) => void;
  readonly onRequestedDateChange: (requestedDate: string) => void;
  readonly onRequestedTimeSlotChange: (slot: ScheduledTimeSlot) => void;
  readonly onSubmit: () => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerCheckoutTemplateReadyData {
  readonly viewModel: CustomerCheckoutViewModel;
  readonly actions: CustomerCheckoutActions;
}

export function createEmptyCheckoutDraft(): CustomerCheckoutDraft {
  return Object.freeze({
    quantity: 1,
    addressId: null,
    contactPhone: "",
    requestedDate: "",
    requestedTimeSlot: null,
  });
}

export function maskCustomerEnteredPhone(phone: string): string {
  const normalized = phone.trim();
  if (!/^1[3-9]\d{9}$/u.test(normalized)) return "";
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}
