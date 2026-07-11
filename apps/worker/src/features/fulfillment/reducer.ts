import type { Fulfillment } from "@xlb/types";

export type FulfillmentState = { items: Fulfillment[]; selected: Fulfillment | null; lifecycleBusy: boolean };
export type FulfillmentAction =
  | { type: "listed"; items: Fulfillment[] }
  | { type: "selected"; fulfillment: Fulfillment | null }
  | { type: "lifecycleBusy"; busy: boolean }
  | { type: "cleared" };
export const initialFulfillmentState: FulfillmentState = { items: [], selected: null, lifecycleBusy: false };

export function fulfillmentReducer(state: FulfillmentState, action: FulfillmentAction): FulfillmentState {
  if (action.type === "listed") return { ...state, items: action.items };
  if (action.type === "selected") return { ...state, selected: action.fulfillment };
  if (action.type === "lifecycleBusy") return { ...state, lifecycleBusy: action.busy };
  return initialFulfillmentState;
}
