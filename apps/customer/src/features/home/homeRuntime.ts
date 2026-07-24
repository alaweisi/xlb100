import {
  createApiClient,
  createCustomerSduiApi,
  customerApi,
} from "@xlb/api-client";
import type { CityCode, CustomerSduiDataSource } from "@xlb/types";
import {
  HomeActionRegistry,
  type HomeCompositionNode,
  type HomeRuntimeBindingsResolver,
} from "../../platform/sdui/index.js";
import {
  HomeDataAdapterRegistry,
  HomeDataCoordinator,
  registerCustomerHomeDataAdapters,
  resolveHomeDataSlots,
  type HomeDataBatchResult,
} from "../../platform/sdui/data/index.js";
import {
  CustomerSduiHomeManifestTransport,
  HomeManifestDelivery,
} from "../../platform/sdui/delivery/index.js";
import { createHomeActionRegistry } from "./createHomeActionRegistry.js";
import type { CustomerHomeTelemetry } from "./homeTelemetry.js";

const CITY_LABELS: Readonly<Record<string, string>> = {
  hangzhou: "杭州",
  shanghai: "上海",
  beijing: "北京",
};

function storageValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export interface CustomerHomeRuntimeContext {
  readonly cityCode: CityCode;
  readonly locale: string;
  readonly appVersion: string;
  readonly cacheScopeKey: string;
}

export function resolveCustomerHomeRuntimeContext(): CustomerHomeRuntimeContext {
  const cityCode = (storageValue("xlb.customer.cityCode") ||
    import.meta.env.VITE_CUSTOMER_CITY_CODE ||
    "hangzhou") as CityCode;
  const locale = navigator.language.startsWith("zh") ? "zh-CN" : navigator.language;
  return Object.freeze({
    cityCode,
    locale,
    appVersion: import.meta.env.VITE_CUSTOMER_APP_VERSION || "2.0.0",
    cacheScopeKey: `guest:${cityCode}`,
  });
}

function createClient(context: CustomerHomeRuntimeContext) {
  return createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    headers: () => {
      const token = storageValue("xlb.customer.token");
      return {
        "x-xlb-city-code": context.cityCode,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      };
    },
  });
}

export function createCustomerHomeRuntime(
  context: CustomerHomeRuntimeContext,
  telemetry?: CustomerHomeTelemetry,
) {
  const client = createClient(context);
  const readApi = customerApi.forClient(client);
  const manifestApi = createCustomerSduiApi(client);
  const dataRegistry = new HomeDataAdapterRegistry();

  registerCustomerHomeDataAdapters(dataRegistry, {
    customerApi: readApi,
    async getCurrentLocation() {
      const districtLabel = storageValue("xlb.customer.districtLabel");
      const cityLabel = CITY_LABELS[context.cityCode] ?? context.cityCode;
      return {
        cityCode: context.cityCode,
        cityLabel,
        districtLabel,
        displayLabel: districtLabel ? `${cityLabel} · ${districtLabel}` : cityLabel,
      };
    },
  });

  return Object.freeze({
    delivery: new HomeManifestDelivery({
      transport: new CustomerSduiHomeManifestTransport({ api: manifestApi }),
      onEvent: telemetry?.onDeliveryEvent,
    }),
    dataCoordinator: new HomeDataCoordinator(dataRegistry, {
      onEvent: telemetry?.onDataEvent,
    }),
    actionRegistry: createHomeActionRegistry({
      onEvent: telemetry?.onActionEvent,
    }),
  });
}

function bindActions(node: HomeCompositionNode, actionRegistry: HomeActionRegistry) {
  return Object.freeze(Object.fromEntries(node.actionBindings.map(({ slot, action }) => [
    slot,
    Object.freeze({
      definition: action,
      invoke: (payload?: unknown) => actionRegistry.invoke(action.actionKey, {
        definition: action,
        sourceComponentId: node.instance.id,
        sourceComponentType: node.instance.type,
        sourceComponentRegion: node.instance.region,
        sourceComponentOrder: node.instance.order,
        payload,
      }),
    }),
  ])));
}

export function createHomeRuntimeBindingsResolver(
  batch: HomeDataBatchResult,
  actionRegistry: HomeActionRegistry,
): HomeRuntimeBindingsResolver {
  return (node) => {
    const resolved = resolveHomeDataSlots(node, batch);
    return Object.freeze({
      data: resolved.data,
      actions: bindActions(node, actionRegistry),
    });
  };
}

export function manifestDataSources(
  nodes: readonly HomeCompositionNode[],
): readonly CustomerSduiDataSource[] {
  const sources = new Map<string, CustomerSduiDataSource>();
  for (const node of nodes) {
    for (const binding of node.dataBindings) {
      sources.set(binding.source.id, binding.source);
    }
  }
  return Object.freeze([...sources.values()]);
}
