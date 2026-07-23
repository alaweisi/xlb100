import type { ComponentType } from "react";
import type {
  CustomerRoutePattern,
  CustomerSliceDefinition,
} from "./CustomerSliceDefinition.js";
import type { CustomerTemplateRouteContext } from "./CustomerTemplateRegistry.js";

export interface CustomerFeatureRouteComponentProps {
  readonly slice: CustomerSliceDefinition;
  readonly route: CustomerTemplateRouteContext;
}

export interface CustomerFeatureRouteEntryModule {
  readonly RouteComponent: ComponentType<CustomerFeatureRouteComponentProps>;
}

export interface CustomerFeatureRouteRegistration {
  readonly slice: CustomerSliceDefinition;
  load(): Promise<CustomerFeatureRouteEntryModule>;
}

export interface CustomerFeatureRouteModule {
  readonly featureId: string;
  /**
   * Feature modules may own only app-local feature directories. App route
   * assembly, platform code and shared packages stay integration-owned.
   */
  readonly ownedDirectories: readonly `apps/customer/src/features/${string}`[];
  readonly routes: readonly CustomerFeatureRouteRegistration[];
}

type StoredRoute = {
  readonly featureId: string;
  readonly pattern: CustomerRoutePattern;
  readonly registration: CustomerFeatureRouteRegistration;
};

function assertOwnedDirectory(featureId: string, directory: string): void {
  if (
    !directory.startsWith("apps/customer/src/features/") ||
    directory.includes("\\") ||
    directory.includes("..") ||
    directory.endsWith("/")
  ) {
    throw new Error(`Customer feature ${featureId} has an invalid owned directory: ${directory}`);
  }
}

function snapshotModule(module: CustomerFeatureRouteModule): CustomerFeatureRouteModule {
  return Object.freeze({
    ...module,
    ownedDirectories: Object.freeze([...module.ownedDirectories]),
    routes: Object.freeze([...module.routes]),
  });
}

function directoriesOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function routeCollisionKey(pattern: CustomerRoutePattern): string {
  return pattern.replace(/:[^/]+/gu, ":");
}

/**
 * Collects independently-owned feature route modules without mounting them.
 * Final App route assembly remains an integration-window responsibility.
 */
export class CustomerFeatureRouteRegistry {
  readonly #modules = new Map<string, CustomerFeatureRouteModule>();
  readonly #directories = new Map<string, string>();
  readonly #routes = new Map<CustomerRoutePattern, StoredRoute>();
  readonly #routeCollisionKeys = new Map<string, StoredRoute>();
  #sealed = false;

  register(module: CustomerFeatureRouteModule): this {
    if (this.#sealed) {
      throw new Error("Customer feature route registry is sealed");
    }
    if (!/^[a-z][a-z0-9-]*$/u.test(module.featureId)) {
      throw new Error(`Invalid Customer feature id: ${module.featureId}`);
    }
    if (this.#modules.has(module.featureId)) {
      throw new Error(`Customer feature route module is already registered: ${module.featureId}`);
    }
    if (module.ownedDirectories.length === 0) {
      throw new Error(`Customer feature ${module.featureId} must own at least one directory`);
    }
    if (module.routes.length === 0) {
      throw new Error(`Customer feature ${module.featureId} must register at least one route`);
    }

    const pendingDirectories: string[] = [];
    for (const directory of module.ownedDirectories) {
      assertOwnedDirectory(module.featureId, directory);
      const existingDirectory = [...this.#directories.keys(), ...pendingDirectories]
        .find((candidate) => directoriesOverlap(candidate, directory));
      if (existingDirectory !== undefined) {
        const owner = this.#directories.get(existingDirectory) ?? module.featureId;
        throw new Error(
          `Customer feature directory ${directory} overlaps ${existingDirectory} owned by ${owner}`,
        );
      }
      pendingDirectories.push(directory);
    }

    const pendingRoutes = new Map<CustomerRoutePattern, StoredRoute>();
    const pendingRouteCollisionKeys = new Map<string, StoredRoute>();
    for (const registration of module.routes) {
      if (registration.slice.featureId !== module.featureId) {
        throw new Error(
          `Customer slice ${registration.slice.id} is owned by ${registration.slice.featureId}, not ${module.featureId}`,
        );
      }
      for (const pattern of registration.slice.routePatterns) {
        const collisionKey = routeCollisionKey(pattern);
        const existing = this.#routeCollisionKeys.get(collisionKey) ??
          pendingRouteCollisionKeys.get(collisionKey);
        if (existing !== undefined) {
          throw new Error(
            `Customer route ${pattern} collides with ${existing.pattern} owned by ${existing.featureId}`,
          );
        }
        const storedRoute = {
          featureId: module.featureId,
          pattern,
          registration,
        };
        pendingRoutes.set(pattern, storedRoute);
        pendingRouteCollisionKeys.set(collisionKey, storedRoute);
      }
    }

    const stored = snapshotModule(module);
    this.#modules.set(module.featureId, stored);
    for (const directory of stored.ownedDirectories) {
      this.#directories.set(directory, stored.featureId);
    }
    for (const [pattern, route] of pendingRoutes) {
      this.#routes.set(pattern, route);
      this.#routeCollisionKeys.set(routeCollisionKey(pattern), route);
    }
    return this;
  }

  seal(): this {
    this.#sealed = true;
    return this;
  }

  get sealed(): boolean {
    return this.#sealed;
  }

  resolve(pattern: CustomerRoutePattern): CustomerFeatureRouteRegistration | null {
    return this.#routes.get(pattern)?.registration ?? null;
  }

  ownerOfDirectory(directory: string): string | null {
    return this.#directories.get(directory) ?? null;
  }

  listModules(): readonly CustomerFeatureRouteModule[] {
    return Object.freeze([...this.#modules.values()]);
  }
}
