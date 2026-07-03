import type {
  CityCode,
  FulfillmentCompletedEventPayload,
  FulfillmentStartedEventPayload,
} from "@xlb/types";

type FulfillmentEventBase = {
  fulfillmentId: string;
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: CityCode;
  workerId: string;
  skuId: string;
};

export function buildFulfillmentStartedPayload(
  input: FulfillmentEventBase & { startedAt: string },
): FulfillmentStartedEventPayload {
  return { ...input };
}

export function buildFulfillmentCompletedPayload(
  input: FulfillmentEventBase & {
    completedAt: string;
    completionNote: string | null;
  },
): FulfillmentCompletedEventPayload {
  return { ...input };
}
