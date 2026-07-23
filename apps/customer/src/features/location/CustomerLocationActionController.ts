import type { CustomerEntryNavigate } from "../auth/CustomerAuthActionController.js";
import {
  CustomerLocationCoordinator,
  type CustomerLocationView,
} from "./CustomerLocationCoordinator.js";

function browserNavigate(route: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("xlb:customer:navigate", {
    detail: { actionKey: "city.return", route },
  }));
  window.history.replaceState({ actionKey: "city.return" }, "", route);
}

export class CustomerLocationActionController {
  constructor(
    private readonly coordinator: CustomerLocationCoordinator,
    private readonly navigate: CustomerEntryNavigate = browserNavigate,
  ) {}

  async selectCity(cityCode: string): Promise<CustomerLocationView> {
    const view = await this.coordinator.selectCity(cityCode);
    if (view.status === "manual-selected") this.navigate(view.returnUrl);
    return view;
  }

  requestSystemLocation(): CustomerLocationView {
    return this.coordinator.requestSystemLocation();
  }

  retry(): Promise<CustomerLocationView> {
    return this.coordinator.retry();
  }
}
