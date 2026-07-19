import type { ApiClient } from "./createApiClient.js";
import { createRequesterSupportApi } from "./support.js";
import { createNotificationApi } from "./notification.js";
import { createCustomerReviewApi } from "./reviewReputation.js";
import { createCustomerMarketingApi } from "./marketing.js";
import type {
  AftersaleComplaintDetailResponse,
  AftersaleComplaintResponse,
  ComplaintCategoryResponse,
  ComplaintPriorityResponse,
  OrderReverseResponse,
  OrderReverseTypeResponse,
} from "./aftersale.js";
import type {
  DecideFulfillmentConfirmationInput,
  DecideFulfillmentConfirmationResponse,
  OrderFulfillmentEvidenceResponse,
} from "./evidence.js";
import type {
  CustomerAddress,
  CustomerProfile,
  SaveCustomerAddressRequest,
  UpdateCustomerProfileRequest,
} from "@xlb/types";
import { validateCustomerOrderListResponse, validateOrderResponse, validatePaymentMutationResponse, validatePaymentOrderResponse } from "./responseValidators.js";

type CityCode = string;
type PriceType = "fixed" | "range" | "from" | "estimate_from" | "onsite_quote";
type OrderStatus =
  | "draft"
  | "pending_dispatch"
  | "service_completed"
  | "pending_payment"
  | "paid"
  | "cancelled";
type ScheduledTimeSlot = "morning" | "afternoon" | "evening";
type PaymentStatus = "pending" | "paid" | "failed" | "closed";
type PaymentProvider = "mock";
type RefundRequestStatus = "requested" | "approved";
type OrderReviewStatus = "created";
type ServiceMode =
  | "installation"
  | "repair"
  | "cleaning"
  | "delivery"
  | "measurement"
  | "dismantle"
  | "maintenance"
  | "inspection";
type StandardType = "installation" | "repair" | "inspection" | "material" | "safety" | "warranty";
type FeeItemType =
  | "base"
  | "labor"
  | "material"
  | "floor"
  | "distance"
  | "urgent"
  | "night"
  | "dismantle"
  | "diagnosis"
  | "enterprise_adjustment";
type FeeChargeMethod = "fixed" | "per_unit" | "range" | "onsite_quote" | "included";

export interface ServiceSkuProfileResponse {
  skuId: string;
  cityCode: CityCode;
  serviceMode: ServiceMode;
  brandScope: string | null;
  modelScope: string | null;
  skillLevel: "basic" | "advanced" | "specialist";
  warrantyDays: number;
  requiresModel: boolean;
  requiresMeasurement: boolean;
  supportsEnterprise: boolean;
  serviceGuaranteeText: string;
}

export interface ServiceStandardResponse {
  standardId: string;
  skuId: string;
  cityCode: CityCode;
  standardType: StandardType;
  title: string;
  content: string;
  sortOrder: number;
  isRequired: boolean;
  isEnabled: boolean;
}

export interface PriceFeeItemResponse {
  feeItemId: string;
  cityCode: CityCode;
  priceRuleId: string;
  skuId: string;
  feeCode: string;
  feeName: string;
  feeType: FeeItemType;
  chargeMethod: FeeChargeMethod;
  amount: number;
  minAmount: number | null;
  maxAmount: number | null;
  unit: string | null;
  isOptional: boolean;
  isEnabled: boolean;
  sortOrder: number;
}

export interface PriceQuoteBreakdownResponse {
  baseAmount: number;
  requiredFeeAmount: number;
  optionalFeeAmount: number;
  totalAmount: number;
  feeItems: PriceFeeItemResponse[];
}

export interface CatalogSnapshotResponse {
  cityCode: CityCode;
  categories: Array<{
    categoryId: string;
    cityCode: CityCode;
    name: string;
    sortOrder: number;
    isEnabled: boolean;
    items: Array<{
      itemId: string;
      categoryId: string;
      cityCode: CityCode;
      name: string;
      sortOrder: number;
      isEnabled: boolean;
      skus: Array<{
        skuId: string;
        itemId: string;
        cityCode: CityCode;
        name: string;
        unit: string;
        profile: ServiceSkuProfileResponse | null;
        standards: ServiceStandardResponse[];
        sortOrder: number;
        isEnabled: boolean;
      }>;
    }>;
  }>;
}

export interface PriceQuoteResponse {
  cityCode: CityCode;
  skuId: string;
  basePrice: number;
  currency: string;
  priceText: string;
  priceType: PriceType;
  minPrice: number | null;
  maxPrice: number | null;
  pricingNote: string | null;
  priceRuleId: string;
  version: number;
  skuProfile: ServiceSkuProfileResponse | null;
  standards: ServiceStandardResponse[];
  breakdown: PriceQuoteBreakdownResponse;
}

export interface CreateOrderBody {
  customerId?: string; // Phase 14: optional — backend derives from auth token/context
  skuId: string;
  quantity: number;
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  detailAddress: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  scheduledTimeSlot: ScheduledTimeSlot;
  discountDecisionId?: string;
  discountDecisionRevision?: number;
  orderIdempotencyKey?: string;
}

export interface CreatePaymentOrderBody {
  orderId: string;
}

export interface MockPaySuccessBody {
  paymentOrderId: string;
  providerTradeNo: string;
  status: "paid";
}

export interface CreateRefundRequestBody {
  orderId: string;
  amount?: number;
  reason?: string;
}

export interface CreateOrderReviewBody {
  orderId: string;
  rating: number;
  comment: string;
}

export interface OrderResponse {
  orderId: string;
  cityCode: CityCode;
  addressProvince: string;
  addressCity: string;
  addressDistrict: string;
  detailAddress: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: string;
  scheduledTimeSlot: ScheduledTimeSlot;
  customerId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  unit: string;
  priceRuleId: string;
  priceText: string;
  priceType: PriceType;
  basePrice: number;
  currency: string;
  totalAmount: number;
  quoteSnapshot: {
    priceRuleId: string;
    skuId: string;
    quantity: number;
    currency: string;
    priceText: string;
    priceType: PriceType;
    unitAmount: number;
    totalAmount: number;
    breakdown: PriceQuoteBreakdownResponse;
    skuProfile: ServiceSkuProfileResponse | null;
    standards: ServiceStandardResponse[];
    pricingSource?: "public" | "enterprise" | "marketing";
    calculationVersion?: 1;
    minorUnit?: 2;
    grossAmountMinor?: number;
    discountAmountMinor?: number;
    netAmountMinor?: number;
    marketingDecision?: {
      decisionId: string;
      decisionRevision: number;
      ruleRevisionId: string;
      ruleContentHash: string;
      couponDefinitionId: string;
      grantId: string;
      reservationId: string;
      redemptionId: string;
      requestFingerprint: string;
      issuedAt: string;
      expiresAt: string;
      acceptedAt: string;
    } | null;
  } | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentOrderResponse {
  paymentOrderId: string;
  orderId: string;
  cityCode: CityCode;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerTradeNo: string | null;
  metadata: {
    orderId: string;
    cityCode: CityCode;
    skuId: string;
    priceRuleId: string;
    customerId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface RefundRequestResponse {
  refundId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  fulfillmentId: string;
  paymentOrderId: string;
  amount: number;
  currency: "CNY";
  reason: string | null;
  status: RefundRequestStatus;
  requestedAt: string;
  approvedAt: string | null;
  approvedByAdminId: string | null;
}

export interface OrderReviewResponse {
  reviewId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  workerId: string;
  fulfillmentId: string;
  rating: number;
  comment: string;
  status: OrderReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export function createCustomerOrderApi(client: ApiClient) {
  return {
    ...createRequesterSupportApi(client),
    ...createNotificationApi(client, "customer"),
    ...createCustomerReviewApi(client),
    ...createCustomerMarketingApi(client),
    getProfile() {
      return client.get<{ ok: true; profile: CustomerProfile }>("/api/customer/profile");
    },
    updateProfile(body: UpdateCustomerProfileRequest) {
      return client.post<{ ok: true; profile: CustomerProfile }>("/api/customer/profile", body);
    },
    listAddresses() {
      return client.get<{ ok: true; addresses: CustomerAddress[] }>("/api/customer/addresses");
    },
    createAddress(body: SaveCustomerAddressRequest) {
      return client.post<{ ok: true; address: CustomerAddress }>("/api/customer/addresses", body);
    },
    updateAddress(addressId: string, body: SaveCustomerAddressRequest) {
      return client.post<{ ok: true; address: CustomerAddress }>(
        `/api/customer/addresses/${encodeURIComponent(addressId)}`,
        body,
      );
    },
    deleteAddress(addressId: string) {
      return client.post<{ ok: true; addressId: string; deleted: true }>(
        `/api/customer/addresses/${encodeURIComponent(addressId)}/delete`,
        {},
      );
    },
    getCatalog() {
      return client.get<{ ok: true; catalog: CatalogSnapshotResponse }>("/api/catalog");
    },
    getPriceQuote(skuId: string) {
      const query = new URLSearchParams({ skuId }).toString();
      return client.get<{ ok: true; quote: PriceQuoteResponse }>(`/api/pricing/quote?${query}`);
    },
    createOrder(body: CreateOrderBody) {
      return client.post<{ ok: true; order: OrderResponse }>("/api/orders", body, { validate: validateOrderResponse });
    },
    getOrder(orderId: string) {
      return client.get<{ ok: true; order: OrderResponse }>(`/api/orders/${orderId}`, { validate: validateOrderResponse });
    },
    listOrders(query: { cursor?: string; limit?: number } = {}) {
      const params = new URLSearchParams();
      if (query.cursor) params.set("cursor", query.cursor);
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      const suffix = params.size > 0 ? `?${params.toString()}` : "";
      return client.get<{ ok: true; orders: OrderResponse[]; nextCursor: string | null }>(
        `/api/customer/orders${suffix}`,
        { validate: validateCustomerOrderListResponse },
      );
    },
    confirmService(orderId: string) {
      return client.post<{ ok: true; order: OrderResponse }>(
        `/api/orders/${encodeURIComponent(orderId)}/confirm-service`,
        {},
        { validate: validateOrderResponse },
      );
    },
    createPaymentOrder(body: CreatePaymentOrderBody) {
      return client.post<{ ok: true; paymentOrder: PaymentOrderResponse }>(
        "/api/payments/orders",
        body,
        { validate: validatePaymentOrderResponse },
      );
    },
    mockPaySuccess(body: MockPaySuccessBody) {
      return client.post<{
        ok: true;
        paymentOrder: PaymentOrderResponse;
        orderId: string;
        idempotent: boolean;
      }>("/api/payments/mock-webhook", body, { validate: validatePaymentMutationResponse });
    },
    createRefundRequest(body: CreateRefundRequestBody) {
      return client.post<{
        ok: true;
        refund: RefundRequestResponse;
        idempotent: boolean;
      }>("/api/aftersale/refunds", body);
    },
    createOrderReverseRequest(
      orderId: string,
      body: {
        reverseType: OrderReverseTypeResponse;
        reason: string;
        requestedScheduledAt?: string;
        requestedTimeSlot?: ScheduledTimeSlot;
        idempotencyKey: string;
      },
    ) {
      return client.post<{ ok: true; reverseRequest: OrderReverseResponse; idempotent: boolean }>(
        `/api/orders/${encodeURIComponent(orderId)}/reverse-requests`,
        body,
      );
    },
    listOrderReverseRequests(orderId: string) {
      return client.get<{ ok: true; reverseRequests: OrderReverseResponse[] }>(
        `/api/orders/${encodeURIComponent(orderId)}/reverse-requests`,
      );
    },
    createAftersaleComplaint(body: {
      orderId: string;
      category: ComplaintCategoryResponse;
      priority?: ComplaintPriorityResponse;
      description: string;
      idempotencyKey: string;
    }) {
      return client.post<{ ok: true; complaint: AftersaleComplaintResponse; idempotent: boolean }>(
        "/api/aftersale/complaints",
        body,
      );
    },
    listAftersaleComplaints(orderId?: string) {
      const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
      return client.get<{ ok: true; complaints: AftersaleComplaintResponse[] }>(
        `/api/aftersale/complaints${query}`,
      );
    },
    getAftersaleComplaint(complaintId: string) {
      return client.get<{ ok: true; detail: AftersaleComplaintDetailResponse }>(
        `/api/aftersale/complaints/${encodeURIComponent(complaintId)}`,
      );
    },
    addAftersaleComplaintNote(complaintId: string, content: string) {
      return client.post<{ ok: true }>(
        `/api/aftersale/complaints/${encodeURIComponent(complaintId)}/notes`,
        { content },
      );
    },
    getOrderFulfillmentEvidence(orderId: string): Promise<OrderFulfillmentEvidenceResponse> {
      return client.get<OrderFulfillmentEvidenceResponse>(
        `/api/customer/orders/${encodeURIComponent(orderId)}/fulfillment-evidence`,
      );
    },
    decideFulfillmentConfirmation(
      fulfillmentId: string,
      body: DecideFulfillmentConfirmationInput,
    ): Promise<DecideFulfillmentConfirmationResponse> {
      return client.post<DecideFulfillmentConfirmationResponse>(
        `/api/customer/fulfillments/${encodeURIComponent(fulfillmentId)}/customer-confirmation`,
        body,
      );
    },
    createOrderReview({ orderId, ...body }: CreateOrderReviewBody) {
      return client.post<{
        ok: true;
        review: OrderReviewResponse;
        idempotent: boolean;
      }>(`/api/orders/${encodeURIComponent(orderId)}/reviews`, body);
    },
  };
}

/** Phase 4 customer API helpers — pass city headers via createApiClient */
export const customerApi = {
  forClient: createCustomerOrderApi,
};
