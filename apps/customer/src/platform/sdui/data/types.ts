import type {
  CityCode,
  CustomerSduiDataKey,
  CustomerSduiDataSource,
} from "@xlb/types";

export interface HomeCurrentLocationViewModel {
  cityCode: CityCode;
  cityLabel: string;
  districtLabel: string | null;
  displayLabel: string;
}

export interface HomeNotificationSummaryViewModel {
  unreadCount: number;
}

export interface HomeServiceCategoryViewModel {
  categoryId: string;
  name: string;
  sortOrder: number;
  itemCount: number;
}

export interface HomeRecommendedServiceViewModel {
  skuId: string;
  categoryId: string;
  categoryName: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  priceLabel: string | null;
}

export interface HomeNearbyProviderViewModel {
  providerId: string;
  displayName: string;
  avatarUrl: string | null;
  distanceMeters: number | null;
  verified: boolean;
  rating: number | null;
}

export interface HomePromotionViewModel {
  promotionId: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  accessibleLabel: string;
  actionId: string | null;
}

export interface HomeTrustGuaranteeViewModel {
  guaranteeKey: string;
  title: string;
  description: string;
}

export interface HomeDataValueByKey {
  "customer.current_location": HomeCurrentLocationViewModel;
  "customer.notification_summary": HomeNotificationSummaryViewModel;
  "catalog.service_categories": HomeServiceCategoryViewModel[];
  "catalog.recommended_services": HomeRecommendedServiceViewModel[];
  "provider.nearby": HomeNearbyProviderViewModel[];
  "content.home_promotions": HomePromotionViewModel[];
  "content.trust_guarantees": HomeTrustGuaranteeViewModel[];
}

export type HomeDataSourceFor<TKey extends CustomerSduiDataKey> = Extract<
  CustomerSduiDataSource,
  { dataKey: TKey }
>;

export interface HomeDataLoadContext {
  readonly requestId: string;
  readonly cityCode: CityCode;
  readonly locale: string;
  /** Opaque scope partition. It must change when city or authenticated actor changes. */
  readonly cacheScopeKey: string;
  readonly signal: AbortSignal;
  request<T>(key: string, loader: (signal: AbortSignal) => Promise<T>): Promise<T>;
}

export interface HomeDataAdapter<TKey extends CustomerSduiDataKey = CustomerSduiDataKey> {
  readonly dataKey: TKey;
  load(
    source: HomeDataSourceFor<TKey>,
    context: HomeDataLoadContext,
  ): Promise<HomeDataValueByKey[TKey]>;
}

export type HomeDataErrorCode =
  | "missing_adapter"
  | "adapter_error"
  | "cancelled"
  | "timeout"
  | "invalid_source";

export interface HomeDataError {
  code: HomeDataErrorCode;
  retryable: boolean;
}

interface HomeDataResultBase {
  sourceId: string;
  dataKey: CustomerSduiDataKey;
  resolvedAt: string;
}

export interface HomeDataSuccessResult extends HomeDataResultBase {
  state: "success";
  value: HomeDataValueByKey[CustomerSduiDataKey];
  cache: "miss" | "fresh";
}

export interface HomeDataStaleResult extends HomeDataResultBase {
  state: "stale";
  value: HomeDataValueByKey[CustomerSduiDataKey];
  cache: "stale";
  error: HomeDataError;
}

export interface HomeDataFailureResult extends HomeDataResultBase {
  state: "error" | "cancelled" | "unavailable";
  error: HomeDataError;
}

export type HomeDataSourceResult =
  | HomeDataSuccessResult
  | HomeDataStaleResult
  | HomeDataFailureResult;

export interface HomeDataBatchIssue {
  sourceId: string;
  code: "duplicate_source_id";
}

export interface HomeDataBatchResult {
  requestId: string;
  state: "empty" | "ready" | "partial" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string;
  results: Readonly<Record<string, HomeDataSourceResult>>;
  issues: readonly HomeDataBatchIssue[];
}

export type HomeDataTelemetryEvent =
  | { type: "source_started"; sourceId: string; dataKey: CustomerSduiDataKey }
  | { type: "source_cache_hit"; sourceId: string; dataKey: CustomerSduiDataKey }
  | { type: "source_stale_fallback"; sourceId: string; dataKey: CustomerSduiDataKey }
  | { type: "source_succeeded"; sourceId: string; dataKey: CustomerSduiDataKey }
  | { type: "source_failed"; sourceId: string; dataKey: CustomerSduiDataKey; code: HomeDataErrorCode }
  | { type: "upstream_coalesced"; key: string }
  | { type: "batch_completed"; requestId: string; state: HomeDataBatchResult["state"] };

export interface HomeDataCoordinatorRequest {
  requestId: string;
  cityCode: CityCode;
  locale: string;
  cacheScopeKey: string;
  dataSources: readonly CustomerSduiDataSource[];
  signal?: AbortSignal;
}

export interface HomeDataCoordinatorOptions {
  freshTtlMs?: number;
  staleTtlMs?: number;
  timeoutMs?: number;
  now?: () => number;
  onEvent?: (event: HomeDataTelemetryEvent) => void;
}
