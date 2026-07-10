import type {
  DecideFulfillmentConfirmationRequest,
  FulfillmentCustomerConfirmation,
  FulfillmentEvidence,
  FulfillmentEvidenceAggregate,
} from "@xlb/types";

export type FulfillmentEvidenceResponse = FulfillmentEvidence;
export type FulfillmentEvidenceAggregateResponse = FulfillmentEvidenceAggregate;
export type FulfillmentCustomerConfirmationResponse = FulfillmentCustomerConfirmation;
export type DecideFulfillmentConfirmationInput = DecideFulfillmentConfirmationRequest;

export type UploadFulfillmentEvidenceResponse = { ok: true; evidence: FulfillmentEvidenceResponse };
export type WorkerFulfillmentEvidenceResponse = { ok: true; aggregate: FulfillmentEvidenceAggregateResponse };
export type OrderFulfillmentEvidenceResponse = { ok: true; aggregates: FulfillmentEvidenceAggregateResponse[] };
export type DecideFulfillmentConfirmationResponse = {
  ok: true;
  confirmation: FulfillmentCustomerConfirmationResponse;
  idempotent: boolean;
};
