import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  AftersaleCaseDetail,
  AftersaleCaseList,
  AftersaleComplaintComposer,
  AftersaleFeedback,
  AftersaleHeader,
  AftersaleNoteComposer,
  type CustomerAftersaleComponentProps,
} from "./aftersaleComponents.js";

export const CUSTOMER_AFTERSALE_COMPONENTS = [
  "header",
  "feedback",
  "case-list",
  "complaint-composer",
  "case-detail",
  "note-composer",
] as const;

export type CustomerAftersaleComponentType =
  typeof CUSTOMER_AFTERSALE_COMPONENTS[number];

export function createCustomerAftersaleComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerAftersaleComponentType,
    CustomerAftersaleComponentProps
  >()
    .register("header", AftersaleHeader)
    .register("feedback", AftersaleFeedback)
    .register("case-list", AftersaleCaseList)
    .register("complaint-composer", AftersaleComplaintComposer)
    .register("case-detail", AftersaleCaseDetail)
    .register("note-composer", AftersaleNoteComposer);
}
