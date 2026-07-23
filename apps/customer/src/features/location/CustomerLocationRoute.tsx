import { createApiClient, customerApi } from "@xlb/api-client";
import { useEffect, useMemo, useState } from "react";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import { getCustomerBrowserEntryRuntime } from "../shell/browserEntryRuntime.js";
import { customerReturnUrlFromQuery } from "../shell/safeReturnUrl.js";
import { CustomerLocationActionController } from "./CustomerLocationActionController.js";
import {
  CustomerLocationCoordinator,
  type CustomerLocationView,
} from "./CustomerLocationCoordinator.js";
import { CustomerLocationTemplate } from "./CustomerLocationTemplate.js";

function origin(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

function sliceState(view: CustomerLocationView): CustomerSliceState<CustomerLocationView> {
  if (view.status === "resolving-profile" || view.status === "checking-capability") {
    return {
      status: "loading",
      requestKey: view.status,
      previousActorDataVisible: false,
    };
  }
  if (view.status === "conflict") {
    return {
      status: "conflict",
      conflictCode: view.error?.code ?? "profile_actor_mismatch",
      refreshRequired: true,
      recovery: {
        actionKey: "location.retry",
        labelKey: "customer.location.retry",
      },
    };
  }
  if (view.status === "unavailable") {
    return {
      status: "unavailable",
      capability: "system-location-resolver",
      reasonCode: view.error?.code ?? "gap_06",
      recovery: {
        actionKey: "city.select",
        labelKey: "customer.location.select_manually",
      },
    };
  }
  if (view.status === "error" || view.status === "out-of-service") {
    return {
      status: "error",
      errorCode: view.error?.code ?? view.status,
      retryable: view.error?.retryable ?? true,
      recovery: {
        actionKey: "location.retry",
        labelKey: "customer.location.retry",
      },
    };
  }
  return { status: "ready", data: view };
}

export function CustomerLocationRoute({
  slice,
  route,
}: CustomerFeatureRouteComponentProps) {
  const entry = useMemo(getCustomerBrowserEntryRuntime, []);
  const api = useMemo(() => customerApi.forClient(createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    headers: () => {
      const token = entry.shell.accessToken();
      const city = entry.shell.citySnapshot();
      return {
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...(city.status === "resolved" ? { "x-xlb-city-code": city.cityCode } : {}),
      };
    },
  })), [entry]);
  const coordinator = useMemo(() => new CustomerLocationCoordinator(
    api,
    entry.shell,
    {
      origin: origin(),
      returnUrl: customerReturnUrlFromQuery(route.query, origin()),
    },
  ), [api, entry, route.query]);
  const actions = useMemo(
    () => new CustomerLocationActionController(coordinator),
    [coordinator],
  );
  const [view, setView] = useState(coordinator.snapshot());

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(setView);
    void coordinator.initialize();
    return unsubscribe;
  }, [coordinator]);

  return (
    <CustomerLocationTemplate
      slice={slice}
      route={route}
      state={sliceState(view)}
      runtime={{ view, actions }}
    />
  );
}
