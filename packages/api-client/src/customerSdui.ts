import type {
  CreateCustomerSduiDraftRequest,
  CustomerSduiKillSwitchEnvelope,
  CustomerSduiManifestEnvelope,
  CustomerSduiPageId,
  CustomerSduiRevisionEnvelope,
  PublishCustomerSduiRevisionRequest,
  ReviewCustomerSduiRevisionRequest,
  RollbackCustomerSduiRevisionRequest,
  SetCustomerSduiKillSwitchRequest,
  UnpublishCustomerSduiRevisionRequest,
  UpdateCustomerSduiDraftRequest,
} from "@xlb/types";
import type { ApiClient, ApiRequestOptions } from "./createApiClient.js";

export interface CustomerSduiApi {
  getPublishedManifest(
    pageId: CustomerSduiPageId,
    input: { appVersion: string; locale: string },
    options?: ApiRequestOptions<CustomerSduiManifestEnvelope>,
  ): Promise<CustomerSduiManifestEnvelope>;
  createDraft(pageId: CustomerSduiPageId, request: CreateCustomerSduiDraftRequest): Promise<CustomerSduiRevisionEnvelope>;
  updateDraft(pageId: CustomerSduiPageId, revisionId: string, request: UpdateCustomerSduiDraftRequest): Promise<CustomerSduiRevisionEnvelope>;
  review(pageId: CustomerSduiPageId, revisionId: string, request: ReviewCustomerSduiRevisionRequest): Promise<CustomerSduiRevisionEnvelope>;
  publish(pageId: CustomerSduiPageId, revisionId: string, request: PublishCustomerSduiRevisionRequest): Promise<CustomerSduiRevisionEnvelope>;
  unpublish(pageId: CustomerSduiPageId, revisionId: string, request: UnpublishCustomerSduiRevisionRequest): Promise<CustomerSduiRevisionEnvelope>;
  rollback(pageId: CustomerSduiPageId, revisionId: string, request: RollbackCustomerSduiRevisionRequest): Promise<CustomerSduiRevisionEnvelope>;
  setKillSwitch(pageId: CustomerSduiPageId, request: SetCustomerSduiKillSwitchRequest): Promise<CustomerSduiKillSwitchEnvelope>;
}

function pagePath(pageId: CustomerSduiPageId): string {
  return encodeURIComponent(pageId);
}

function revisionPath(revisionId: string): string {
  return encodeURIComponent(revisionId);
}

export function createCustomerSduiApi(client: ApiClient): CustomerSduiApi {
  const mutationOptions = { retry: "idempotent" as const };
  return {
    getPublishedManifest: (pageId, input, options) => {
      const query = new URLSearchParams({ appVersion: input.appVersion, locale: input.locale });
      return client.get<CustomerSduiManifestEnvelope>(
        `/api/customer/sdui/pages/${pagePath(pageId)}/manifest?${query.toString()}`,
        options,
      );
    },
    createDraft: (pageId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions`, request, mutationOptions,
    ),
    updateDraft: (pageId, revisionId, request) => client.patch<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}`,
      request, mutationOptions,
    ),
    review: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/review`,
      request, mutationOptions,
    ),
    publish: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/publish`,
      request, mutationOptions,
    ),
    unpublish: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/unpublish`,
      request, mutationOptions,
    ),
    rollback: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/rollback`,
      request, mutationOptions,
    ),
    setKillSwitch: (pageId, request) => client.post<CustomerSduiKillSwitchEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/kill-switch`, request, mutationOptions,
    ),
  };
}
