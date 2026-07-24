export interface CustomerPaymentNavigation {
  openOrders(): void;
}

export interface CustomerPaymentActionResult {
  readonly status: "navigated";
  readonly route: "/orders";
}

/**
 * GAP-02 permits no payment mutation or provider action. The sole action is a
 * deterministic return to the Customer order center.
 */
export class CustomerPaymentActionController {
  readonly #navigation: CustomerPaymentNavigation;

  constructor(navigation: CustomerPaymentNavigation) {
    this.#navigation = navigation;
  }

  returnToOrders(): CustomerPaymentActionResult {
    this.#navigation.openOrders();
    return Object.freeze({
      status: "navigated",
      route: "/orders",
    });
  }
}
