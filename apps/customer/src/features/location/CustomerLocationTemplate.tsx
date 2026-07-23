import type { CustomerL1TemplateProps } from "../../platform/slices/index.js";
import type { CustomerLocationActionController } from "./CustomerLocationActionController.js";
import type { CustomerLocationView } from "./CustomerLocationCoordinator.js";
import {
  CUSTOMER_LOCATION_COMPONENT_PLAN,
  createCustomerLocationComponentRegistry,
} from "./createCustomerLocationComponentRegistry.js";
import "../shell/customer-entry.css";

export interface CustomerLocationTemplateRuntime {
  readonly view: CustomerLocationView;
  readonly actions: CustomerLocationActionController;
}

export interface CustomerLocationTemplateProps extends CustomerL1TemplateProps {
  readonly runtime?: CustomerLocationTemplateRuntime;
}

const locationComponents = createCustomerLocationComponentRegistry();

export function CustomerLocationTemplate({
  runtime,
}: CustomerLocationTemplateProps) {
  if (runtime === undefined) {
    return (
      <main className="xlb-entry-shell">
        <section className="xlb-entry-status" data-kind="error" role="alert">
          城市入口尚未装配。
        </section>
      </main>
    );
  }
  return (
    <main
      className="xlb-entry-shell"
      data-location-state={runtime.view.status}
      aria-busy={runtime.view.status === "resolving-profile" || undefined}
    >
      <section className="xlb-entry-panel">
        {CUSTOMER_LOCATION_COMPONENT_PLAN.map((type) => {
          const Component = locationComponents.resolve(type);
          return Component === null ? null : <Component key={type} {...runtime} />;
        })}
      </section>
    </main>
  );
}
