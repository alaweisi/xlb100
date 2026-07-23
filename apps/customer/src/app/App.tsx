import { CustomerPresentationProvider } from "@xlb/customer-components/presentation";
import { runtimeThemeEnvelopeSchema } from "@xlb/validators";
import { useEffect, useMemo } from "react";
import { HomePage } from "../features/home/HomePage.js";
import { resolveCustomerHomeRuntimeContext } from "../features/home/homeRuntime.js";
import { createCustomerHomeTelemetry } from "../features/home/homeTelemetry.js";

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
  const telemetry = useMemo(
    () => createCustomerHomeTelemetry({ appVersion: context.appVersion }),
    [context.appVersion],
  );

  useEffect(() => {
    telemetry.startPageView();
    return telemetry.attachBrowserLifecycle();
  }, [telemetry]);

  return (
    <CustomerPresentationProvider
      candidate={null}
      scope={scope}
      capabilities={capabilities}
      validator={runtimeThemeEnvelopeSchema}
      className="xlb-customer-app"
      onBrandAssetStateChange={telemetry.recordBrandAssetState}
    >
      <HomePage telemetry={telemetry} />
    </CustomerPresentationProvider>
  );
}
