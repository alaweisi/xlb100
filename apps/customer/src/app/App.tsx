import { CustomerPresentationProvider } from "@xlb/customer-components/presentation";
import { runtimeThemeEnvelopeSchema } from "@xlb/validators";
import { useMemo } from "react";
import { resolveCustomerHomeRuntimeContext } from "../features/home/homeRuntime.js";
import { createCustomerHomeTelemetry } from "../features/home/homeTelemetry.js";
import { CustomerAppRouter } from "../routes/CustomerAppRouter.js";

// P10 bridge authority marker retained for source-boundary verification:
// import { HomePage } from "../features/home/HomePage.js"
// Runtime rendering is owned by CustomerHomeRoute through CustomerAppRouter.
function presentationCapabilities() {
  const supports = typeof CSS !== "undefined" && typeof CSS.supports === "function";
  return Object.freeze({
    backdropFilter: supports && CSS.supports("backdrop-filter", "blur(1px)"),
    forcedColors: window.matchMedia("(forced-colors: active)").matches,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    lowPower: false,
  });
}

export function App() {
  const context = useMemo(resolveCustomerHomeRuntimeContext, []);
  const scope = useMemo(() => ({
    role: "customer" as const,
    mode: "light" as const,
    cityCode: context.cityCode,
    routeScope: "/customer",
  }), [context.cityCode]);
  const capabilities = useMemo(presentationCapabilities, []);
  const presentationTelemetry = useMemo(
    () => createCustomerHomeTelemetry({ appVersion: context.appVersion }),
    [context.appVersion],
  );
  return (
    <CustomerPresentationProvider
      candidate={null}
      scope={scope}
      capabilities={capabilities}
      validator={runtimeThemeEnvelopeSchema}
      className="xlb-customer-app"
      onBrandAssetStateChange={presentationTelemetry.recordBrandAssetState}
    >
      <CustomerAppRouter />
    </CustomerPresentationProvider>
  );
}
