import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  ProfileAccountActions,
  ProfileBoundaryHeader,
  ProfileCitySwitchConfirmation,
  ProfileEditor,
  ProfileFeedback,
  ProfileHeader,
  ProfileLogout,
  ProfileSummary,
  type CustomerProfileComponentProps,
} from "./profileComponents.js";

export const CUSTOMER_PROFILE_COMPONENTS = [
  "header",
  "feedback",
  "summary",
  "editor",
  "account-actions",
  "logout",
  "city-switch-confirmation",
] as const;

export type CustomerProfileComponentType =
  typeof CUSTOMER_PROFILE_COMPONENTS[number];

export function createCustomerProfileComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerProfileComponentType,
    CustomerProfileComponentProps
  >()
    .register("header", ProfileHeader)
    .register("feedback", ProfileFeedback)
    .register("summary", ProfileSummary)
    .register("editor", ProfileEditor)
    .register("account-actions", ProfileAccountActions)
    .register("logout", ProfileLogout)
    .register("city-switch-confirmation", ProfileCitySwitchConfirmation);
}

export function createCustomerProfileBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", ProfileBoundaryHeader);
}
