import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  AddressBoundaryHeader,
  AddressCityScope,
  AddressDeleteConfirmation,
  AddressFeedback,
  AddressForm,
  AddressHeader,
  AddressList,
  type CustomerAddressComponentProps,
} from "./addressComponents.js";

export const CUSTOMER_ADDRESS_COMPONENTS = [
  "header",
  "city-scope",
  "feedback",
  "address-list",
  "address-form",
  "delete-confirmation",
] as const;

export type CustomerAddressComponentType =
  typeof CUSTOMER_ADDRESS_COMPONENTS[number];

export function createCustomerAddressComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerAddressComponentType,
    CustomerAddressComponentProps
  >()
    .register("header", AddressHeader)
    .register("city-scope", AddressCityScope)
    .register("feedback", AddressFeedback)
    .register("address-list", AddressList)
    .register("address-form", AddressForm)
    .register("delete-confirmation", AddressDeleteConfirmation);
}

export function createCustomerAddressBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", AddressBoundaryHeader);
}
