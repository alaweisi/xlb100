import type { CustomerSduiDataKey, CustomerSduiDataSource } from "@xlb/types";

import type {
  HomeDataAdapter,
  HomeDataLoadContext,
  HomeDataValueByKey,
} from "./types.js";

interface ErasedHomeDataAdapter {
  readonly dataKey: CustomerSduiDataKey;
  load(
    source: CustomerSduiDataSource,
    context: HomeDataLoadContext,
  ): Promise<HomeDataValueByKey[CustomerSduiDataKey]>;
}

export class HomeDataAdapterRegistry {
  readonly #adapters = new Map<CustomerSduiDataKey, ErasedHomeDataAdapter>();

  register<TKey extends CustomerSduiDataKey>(adapter: HomeDataAdapter<TKey>): this {
    if (this.#adapters.has(adapter.dataKey)) {
      throw new Error(`Home data adapter already registered: ${adapter.dataKey}`);
    }
    this.#adapters.set(adapter.dataKey, adapter as unknown as ErasedHomeDataAdapter);
    return this;
  }

  resolve<TKey extends CustomerSduiDataKey>(dataKey: TKey): HomeDataAdapter<TKey> | null {
    return (this.#adapters.get(dataKey) as HomeDataAdapter<TKey> | undefined) ?? null;
  }

  has(dataKey: CustomerSduiDataKey): boolean {
    return this.#adapters.has(dataKey);
  }

  list(): readonly CustomerSduiDataKey[] {
    return [...this.#adapters.keys()];
  }
}
