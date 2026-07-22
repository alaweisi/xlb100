import type { CustomerSduiDataKey, CustomerSduiDataSource } from "@xlb/types";

import type { HomeDataBatchResult, HomeDataSourceResult } from "./types.js";

export interface HomeResolvedDataBindingLike {
  readonly slot: string;
  readonly source: CustomerSduiDataSource;
  readonly required: boolean;
}

export interface HomeDataBindingNodeLike {
  readonly dataBindings: readonly HomeResolvedDataBindingLike[];
}

export interface HomeDataSlotResolution {
  readonly slot: string;
  readonly sourceId: string;
  readonly dataKey: CustomerSduiDataKey;
  readonly required: boolean;
  readonly state: HomeDataSourceResult["state"] | "missing";
}

export interface HomeResolvedDataSlots {
  readonly data: Readonly<Record<string, unknown>>;
  readonly slots: readonly HomeDataSlotResolution[];
  readonly requiredFailures: readonly HomeDataSlotResolution[];
  readonly renderable: boolean;
}

/** Maps P3 resolved data bindings to P5 normalized values without exposing dataRef to components. */
export function resolveHomeDataSlots(
  node: HomeDataBindingNodeLike,
  batch: HomeDataBatchResult,
): HomeResolvedDataSlots {
  const data: Record<string, unknown> = {};
  const slots: HomeDataSlotResolution[] = [];

  for (const binding of node.dataBindings) {
    const result = batch.results[binding.source.id];
    const resolution: HomeDataSlotResolution = Object.freeze({
      slot: binding.slot,
      sourceId: binding.source.id,
      dataKey: binding.source.dataKey,
      required: binding.required,
      state: result?.state ?? "missing",
    });
    slots.push(resolution);
    if (result?.state === "success" || result?.state === "stale") {
      data[binding.slot] = result.value;
    }
  }

  const requiredFailures = slots.filter((slot) =>
    slot.required && slot.state !== "success" && slot.state !== "stale",
  );
  return Object.freeze({
    data: Object.freeze(data),
    slots: Object.freeze(slots),
    requiredFailures: Object.freeze(requiredFailures),
    renderable: requiredFailures.length === 0,
  });
}

export function createHomeDataBindingsResolver(batch: HomeDataBatchResult) {
  return (node: HomeDataBindingNodeLike): HomeResolvedDataSlots =>
    resolveHomeDataSlots(node, batch);
}
