import type {
  CustomerSduiActionDefinition,
  CustomerSduiComponentInstance,
  CustomerSduiComponentType,
} from "@xlb/types";

export interface CustomerHomeBoundAction {
  readonly definition: CustomerSduiActionDefinition;
  invoke(payload?: unknown): void | Promise<void>;
}

export type CustomerHomeComponentInstance<TType extends CustomerSduiComponentType> = Extract<
  CustomerSduiComponentInstance,
  { type: TType }
>;

export interface CustomerHomeComponentProps<TType extends CustomerSduiComponentType> {
  readonly instance: CustomerHomeComponentInstance<TType>;
  readonly data: Readonly<Record<string, unknown>>;
  readonly actions: Readonly<Record<string, CustomerHomeBoundAction>>;
}

export interface HomeCurrentLocation {
  readonly cityCode: string;
  readonly cityLabel: string;
  readonly districtLabel: string | null;
  readonly displayLabel: string;
}

export interface HomeNotificationSummary {
  readonly unreadCount: number;
}

export interface HomeServiceCategory {
  readonly categoryId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly itemCount: number;
}

export interface HomeRecommendedService {
  readonly skuId: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly name: string;
  readonly unit: string;
  readonly imageUrl: string | null;
  readonly priceLabel: string | null;
}

export interface HomeNearbyProvider {
  readonly providerId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly distanceMeters: number | null;
  readonly verified: boolean;
  readonly rating: number | null;
}

export interface HomePromotion {
  readonly promotionId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
  readonly accessibleLabel: string;
  readonly actionId: string | null;
}

export interface HomeTrustGuarantee {
  readonly guaranteeKey: string;
  readonly title: string;
  readonly description: string;
}

export function readObject<T extends object>(value: unknown): T | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as T
    : null;
}

export function readArray<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? value as readonly T[] : [];
}
