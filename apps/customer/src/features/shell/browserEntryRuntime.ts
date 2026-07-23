import { clearCustomerScopedBrowserCaches, CustomerCacheScopeCoordinator } from "./cacheScope.js";
import { CustomerCityRepository } from "./citySelection.js";
import { CustomerAppShellActionController } from "./CustomerAppShellActionController.js";
import { CustomerAppShellCoordinator } from "./CustomerAppShellCoordinator.js";
import {
  CustomerSessionRepository,
  MemoryCustomerStorage,
  resolveBrowserCustomerStorage,
  type CustomerStorage,
} from "./sessionLifecycle.js";

export interface CustomerBrowserEntryRuntime {
  readonly shell: CustomerAppShellCoordinator;
  readonly actions: CustomerAppShellActionController;
  readonly storage: CustomerStorage;
}

let singleton: CustomerBrowserEntryRuntime | null = null;

export function createCustomerBrowserEntryRuntime(
  storage = resolveBrowserCustomerStorage() ?? new MemoryCustomerStorage(),
): CustomerBrowserEntryRuntime {
  const scopes = new CustomerCacheScopeCoordinator((_previous, _next) => {
    clearCustomerScopedBrowserCaches(storage);
  });
  const shell = new CustomerAppShellCoordinator(
    new CustomerSessionRepository(storage),
    new CustomerCityRepository(storage),
    scopes,
  );
  return Object.freeze({
    shell,
    actions: new CustomerAppShellActionController(shell),
    storage,
  });
}

export function getCustomerBrowserEntryRuntime(): CustomerBrowserEntryRuntime {
  singleton ??= createCustomerBrowserEntryRuntime();
  return singleton;
}
