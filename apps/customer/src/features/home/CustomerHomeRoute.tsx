import type {
  CustomerFeatureRouteComponentProps,
  CustomerSliceState,
} from "../../platform/slices/index.js";
import { CustomerSduiPageTemplate } from "./CustomerSduiPageTemplate.js";

const HOME_RUNTIME_BRIDGE_STATE: CustomerSliceState<null> = Object.freeze({
  status: "ready",
  data: null,
});

/**
 * Route-level bridge only. The null operationalManifest is deliberate:
 * HomePage obtains the validated customer.home v1 manifest through P10
 * HomeManifestDelivery rather than accepting route- or manifest-owned facts.
 */
export function CustomerHomeRoute({
  slice,
  route,
}: CustomerFeatureRouteComponentProps) {
  return (
    <CustomerSduiPageTemplate
      slice={slice}
      route={route}
      state={HOME_RUNTIME_BRIDGE_STATE}
      operationalManifest={null}
    />
  );
}

export const RouteComponent = CustomerHomeRoute;
