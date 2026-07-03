import type {
  CityCode,
  DispatchAcceptedEventPayload,
  FulfillmentCreatedEventPayload,
} from "@xlb/types";

export function buildDispatchAcceptedPayload(input: {
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: CityCode;
  workerId: string;
  skuId: string;
  acceptedAt: string;
}): DispatchAcceptedEventPayload {
  return {
    acceptanceId: input.acceptanceId,
    dispatchTaskId: input.dispatchTaskId,
    orderId: input.orderId,
    cityCode: input.cityCode,
    workerId: input.workerId,
    skuId: input.skuId,
    acceptedAt: input.acceptedAt,
  };
}

export function buildFulfillmentCreatedPayload(input: {
  fulfillmentId: string;
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: CityCode;
  workerId: string;
  skuId: string;
  status: "accepted";
}): FulfillmentCreatedEventPayload {
  return {
    fulfillmentId: input.fulfillmentId,
    acceptanceId: input.acceptanceId,
    dispatchTaskId: input.dispatchTaskId,
    orderId: input.orderId,
    cityCode: input.cityCode,
    workerId: input.workerId,
    skuId: input.skuId,
    status: input.status,
  };
}
