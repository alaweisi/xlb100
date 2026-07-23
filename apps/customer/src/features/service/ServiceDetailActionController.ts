export interface CustomerServiceDetailNavigation {
  backToDiscovery(): void;
  openCheckout(skuId: string): void;
}

export interface CustomerServiceDetailActionScope {
  readonly skuId: string;
}

function navigate(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function createBrowserCustomerServiceDetailNavigation(): CustomerServiceDetailNavigation {
  return Object.freeze({
    backToDiscovery() {
      navigate("/service");
    },
    openCheckout(skuId: string) {
      const query = new URLSearchParams({ skuId });
      navigate(`/checkout?${query.toString()}`);
    },
  });
}

export class ServiceDetailActionController {
  readonly #navigation: CustomerServiceDetailNavigation;

  constructor(navigation: CustomerServiceDetailNavigation) {
    this.#navigation = navigation;
  }

  backToDiscovery(): void {
    this.#navigation.backToDiscovery();
  }

  startCheckout(requestedSkuId: string, scope: CustomerServiceDetailActionScope): boolean {
    if (requestedSkuId !== scope.skuId) return false;
    this.#navigation.openCheckout(scope.skuId);
    return true;
  }
}
