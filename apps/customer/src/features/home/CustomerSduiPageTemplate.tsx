import { useMemo } from "react";
import type { CustomerL3TemplateProps } from "../../platform/slices/index.js";
import { HomePage } from "./HomePage.js";
import { resolveCustomerHomeRuntimeContext } from "./homeRuntime.js";
import { createCustomerHomeTelemetry } from "./homeTelemetry.js";

/**
 * CSL-04 template seam. HomePage continues to own the established P10
 * Delivery/Composition/Data/Action runtime; the slice layer only makes that
 * runtime consumable by the final route integration window.
 */
export function CustomerSduiPageTemplate(
  _props: CustomerL3TemplateProps,
) {
  const context = useMemo(resolveCustomerHomeRuntimeContext, []);
  const telemetry = useMemo(
    () => createCustomerHomeTelemetry({ appVersion: context.appVersion }),
    [context.appVersion],
  );

  return <HomePage telemetry={telemetry} />;
}
