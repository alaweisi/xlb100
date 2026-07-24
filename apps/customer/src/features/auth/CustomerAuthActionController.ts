import { CustomerAuthCoordinator, type CustomerAuthView } from "./CustomerAuthCoordinator.js";

export type CustomerEntryNavigate = (route: string) => void;

function browserNavigate(route: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("xlb:customer:navigate", {
    detail: { actionKey: "auth.return", route },
  }));
  window.history.replaceState({ actionKey: "auth.return" }, "", route);
}

export class CustomerAuthActionController {
  constructor(
    private readonly coordinator: CustomerAuthCoordinator,
    private readonly navigate: CustomerEntryNavigate = browserNavigate,
  ) {}

  updatePhone(phone: string): void {
    this.coordinator.setPhone(phone);
  }

  updateCode(code: string): void {
    this.coordinator.setCode(code);
  }

  requestCode(): Promise<CustomerAuthView> {
    return this.coordinator.requestCode();
  }

  async verifyCode(): Promise<CustomerAuthView> {
    const view = await this.coordinator.verifyCode();
    if (view.status === "authenticated") this.navigate(view.returnUrl);
    return view;
  }

  resendCode(): Promise<CustomerAuthView> {
    return this.coordinator.requestCode();
  }

  returnHome(): void {
    this.navigate("/");
  }
}
