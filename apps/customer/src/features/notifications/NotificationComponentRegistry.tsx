import { CustomerComponentRegistry } from "@xlb/customer-components";
import {
  NotificationBoundaryHeader,
  NotificationFeedback,
  NotificationHeader,
  NotificationList,
  NotificationViewTabs,
  type CustomerNotificationComponentProps,
} from "./notificationComponents.js";

export const CUSTOMER_NOTIFICATION_COMPONENTS = [
  "header",
  "view-tabs",
  "feedback",
  "notification-list",
] as const;

export type CustomerNotificationComponentType =
  typeof CUSTOMER_NOTIFICATION_COMPONENTS[number];

export function createCustomerNotificationComponentRegistry() {
  return new CustomerComponentRegistry<
    CustomerNotificationComponentType,
    CustomerNotificationComponentProps
  >()
    .register("header", NotificationHeader)
    .register("view-tabs", NotificationViewTabs)
    .register("feedback", NotificationFeedback)
    .register("notification-list", NotificationList);
}

export function createCustomerNotificationBoundaryRegistry() {
  return new CustomerComponentRegistry<"state-header", Record<string, never>>()
    .register("state-header", NotificationBoundaryHeader);
}
