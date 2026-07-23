import { createApiClient, createAuthApi } from "@xlb/api-client";
import { useEffect, useMemo, useState } from "react";
import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import { getCustomerBrowserEntryRuntime } from "../shell/browserEntryRuntime.js";
import { customerReturnUrlFromQuery } from "../shell/safeReturnUrl.js";
import { CustomerAuthActionController } from "./CustomerAuthActionController.js";
import { CustomerAuthCoordinator, type CustomerAuthView } from "./CustomerAuthCoordinator.js";
import { CustomerAuthTemplate } from "./CustomerAuthTemplate.js";

function origin(): string {
  return typeof window === "undefined" ? "http://localhost" : window.location.origin;
}

function sliceState(view: CustomerAuthView): CustomerSliceState<CustomerAuthView> {
  if (view.status === "requesting-code" || view.status === "verifying") {
    return {
      status: "loading",
      requestKey: view.status,
      previousActorDataVisible: false,
    };
  }
  if (view.status === "conflict") {
    return {
      status: "conflict",
      conflictCode: view.error?.code ?? "wrong_actor",
      refreshRequired: true,
      recovery: {
        actionKey: "auth.return",
        labelKey: "customer.auth.return_home",
      },
    };
  }
  if (view.status === "error" || view.status === "rate-limited" || view.status === "code-expired") {
    return {
      status: "error",
      errorCode: view.error?.code ?? view.status,
      retryable: view.error?.retryable ?? true,
      recovery: {
        actionKey: "auth.request_code",
        labelKey: "customer.auth.retry",
      },
    };
  }
  return { status: "ready", data: view };
}

export function CustomerAuthRoute({
  slice,
  route,
}: CustomerFeatureRouteComponentProps) {
  const entry = useMemo(getCustomerBrowserEntryRuntime, []);
  const coordinator = useMemo(() => new CustomerAuthCoordinator(
    createAuthApi(createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL || "",
      maxRetries: 0,
    })),
    entry.shell,
    {
      origin: origin(),
      returnUrl: customerReturnUrlFromQuery(route.query, origin()),
    },
  ), [entry, route.query]);
  const actions = useMemo(
    () => new CustomerAuthActionController(coordinator),
    [coordinator],
  );
  const [view, setView] = useState(coordinator.snapshot());

  useEffect(() => {
    const unsubscribe = coordinator.subscribe(setView);
    void entry.shell.restore();
    const timer = window.setInterval(() => coordinator.tick(), 1_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [coordinator, entry]);

  return (
    <CustomerAuthTemplate
      slice={slice}
      route={route}
      state={sliceState(view)}
      runtime={{ view, actions }}
    />
  );
}
