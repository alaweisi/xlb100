import type { KnownCityCode } from "@xlb/types";
import { CustomerAppShellCoordinator } from "./CustomerAppShellCoordinator.js";

export class CustomerAppShellActionController {
  constructor(private readonly coordinator: CustomerAppShellCoordinator) {}

  retry(): Promise<unknown> {
    return this.coordinator.restore();
  }

  expire(): Promise<unknown> {
    return this.coordinator.expireSession();
  }

  logout(): Promise<unknown> {
    return this.coordinator.logout();
  }

  selectCity(cityCode: KnownCityCode): Promise<unknown> {
    return this.coordinator.selectCity(cityCode);
  }
}
