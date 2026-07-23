import type { CustomerProfile, KnownCityCode } from "@xlb/types";
import { isCustomerServiceCity } from "../shell/citySelection.js";

export interface CustomerProfileDraft {
  readonly name: string;
  readonly defaultCityCode: KnownCityCode;
}

export type CustomerProfileFieldErrors = Readonly<
  Partial<Record<"name" | "defaultCityCode" | "form", string>>
>;

export type CustomerProfileRuntimeStatus =
  | "ready"
  | "dirty"
  | "saving"
  | "saved"
  | "logging-out";

export interface CustomerProfileNotice {
  readonly kind: "success" | "error" | "conflict";
  readonly message: string;
}

export type CustomerAccountDestination =
  | "addresses"
  | "coupons"
  | "notifications"
  | "support";

export interface CustomerProfileViewModel {
  readonly profile: CustomerProfile;
  readonly draft: CustomerProfileDraft;
  readonly currentCityCode: KnownCityCode;
  readonly status: CustomerProfileRuntimeStatus;
  readonly errors: CustomerProfileFieldErrors;
  readonly notice: CustomerProfileNotice | null;
  readonly citySwitchConfirmation: KnownCityCode | null;
}

export interface CustomerProfileActions {
  readonly onNameChange: (name: string) => void;
  readonly onDefaultCityChange: (cityCode: KnownCityCode) => void;
  readonly onSave: () => void;
  readonly onNavigate: (destination: CustomerAccountDestination) => void;
  readonly onLogout: () => void;
  readonly onConfirmCitySwitch: () => void;
  readonly onDeclineCitySwitch: () => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerProfileTemplateReadyData {
  readonly viewModel: CustomerProfileViewModel;
  readonly actions: CustomerProfileActions;
}

export function profileDraftFrom(
  profile: CustomerProfile,
  currentCityCode: KnownCityCode,
): CustomerProfileDraft {
  return Object.freeze({
    name: profile.name,
    defaultCityCode: isCustomerServiceCity(profile.defaultCityCode)
      ? profile.defaultCityCode
      : currentCityCode,
  });
}
