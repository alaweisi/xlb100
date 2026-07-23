import type {
  CreateCustomerSduiDraftRequest,
  CustomerSduiAuditListEnvelope,
  CustomerSduiAuditListQuery,
  CustomerSduiKillSwitchEnvelope,
  CustomerSduiKillSwitchReadEnvelope,
  CustomerSduiManifestEnvelope,
  CustomerSduiPageId,
  CustomerSduiRevisionEnvelope,
  CustomerSduiRevisionListEnvelope,
  CustomerSduiRevisionListQuery,
  CustomerSduiRevisionReadEnvelope,
  PublishCustomerSduiRevisionRequest,
  ReviewCustomerSduiRevisionRequest,
  RollbackCustomerSduiRevisionRequest,
  SetCustomerSduiKillSwitchRequest,
  UnpublishCustomerSduiRevisionRequest,
  UpdateCustomerSduiDraftRequest,
} from "@xlb/types";
import {
  customerSduiAuditListEnvelopeSchema,
  customerSduiKillSwitchEnvelopeSchema,
  customerSduiKillSwitchReadEnvelopeSchema,
  customerSduiManifestEnvelopeSchema,
  customerSduiRevisionEnvelopeSchema,
  customerSduiRevisionListEnvelopeSchema,
  customerSduiRevisionReadEnvelopeSchema,
} from "@xlb/validators";
import type { ApiClient, ApiRequestOptions, ApiResponseMetadata } from "./createApiClient.js";

type CustomerSduiReadOptions = Omit<
  ApiRequestOptions<CustomerSduiManifestEnvelope>,
  "validate" | "headers" | "notModifiedValue" | "onResponseMetadata"
>;

export interface CustomerSduiManifestCacheEntry {
  readonly etag: string;
  readonly envelope: CustomerSduiManifestEnvelope;
}

export interface CustomerSduiManifestReadResult {
  /**
   * Published manifests always carry an ETag. Safety/fallback envelopes
   * intentionally use no-store and therefore return null.
   */
  readonly etag: string | null;
  readonly envelope: CustomerSduiManifestEnvelope;
  readonly notModified: boolean;
}

export interface CustomerSduiApi {
  getPublishedManifest(
    pageId: CustomerSduiPageId,
    input: { appVersion: string; locale: string },
    options?: CustomerSduiReadOptions,
  ): Promise<CustomerSduiManifestEnvelope>;
  getPublishedManifestConditional(
    pageId: CustomerSduiPageId,
    input: { appVersion: string; locale: string },
    cached?: CustomerSduiManifestCacheEntry,
    options?: CustomerSduiReadOptions,
  ): Promise<CustomerSduiManifestReadResult>;
  listRevisions(
    pageId: CustomerSduiPageId,
    query?: CustomerSduiRevisionListQuery,
  ): Promise<CustomerSduiRevisionListEnvelope>;
  getRevision(pageId: CustomerSduiPageId, revisionId: string): Promise<CustomerSduiRevisionReadEnvelope>;
  getKillSwitch(pageId: CustomerSduiPageId): Promise<CustomerSduiKillSwitchReadEnvelope>;
  listAudits(
    pageId: CustomerSduiPageId,
    query?: CustomerSduiAuditListQuery,
  ): Promise<CustomerSduiAuditListEnvelope>;
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

function queryString(input: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function createCustomerSduiApi(client: ApiClient): CustomerSduiApi {
  const revisionMutationOptions = {
    retry: "idempotent" as const,
    validate: (value: unknown) => customerSduiRevisionEnvelopeSchema.parse(value),
  };
  const killSwitchMutationOptions = {
    retry: "idempotent" as const,
    validate: (value: unknown) => customerSduiKillSwitchEnvelopeSchema.parse(value),
  };
  return {
    getPublishedManifest: (pageId, input, options) => {
      const query = new URLSearchParams({ appVersion: input.appVersion, locale: input.locale });
      return client.get<CustomerSduiManifestEnvelope>(
        `/api/customer/sdui/pages/${pagePath(pageId)}/manifest?${query.toString()}`,
        {
          ...options,
          validate: (value) => customerSduiManifestEnvelopeSchema.parse(value),
        },
      );
    },
    getPublishedManifestConditional: async (pageId, input, cached, options) => {
      const query = new URLSearchParams({ appVersion: input.appVersion, locale: input.locale });
      let metadata: ApiResponseMetadata | undefined;
      const envelope = await client.get<CustomerSduiManifestEnvelope>(
        `/api/customer/sdui/pages/${pagePath(pageId)}/manifest?${query.toString()}`,
        {
          ...options,
          headers: cached ? { "If-None-Match": cached.etag } : undefined,
          notModifiedValue: cached?.envelope,
          onResponseMetadata: (value) => { metadata = value; },
          validate: (value) => customerSduiManifestEnvelopeSchema.parse(value),
        },
      );
      const notModified = metadata?.status === 304;
      const etag = metadata?.headers.etag ?? (notModified ? cached?.etag : undefined) ?? null;
      return { etag, envelope, notModified };
    },
    listRevisions: (pageId, query = {}) => client.get<CustomerSduiRevisionListEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions${queryString(query)}`,
      { validate: (value) => customerSduiRevisionListEnvelopeSchema.parse(value) },
    ),
    getRevision: (pageId, revisionId) => client.get<CustomerSduiRevisionReadEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}`,
      { validate: (value) => customerSduiRevisionReadEnvelopeSchema.parse(value) },
    ),
    getKillSwitch: (pageId) => client.get<CustomerSduiKillSwitchReadEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/kill-switch`,
      { validate: (value) => customerSduiKillSwitchReadEnvelopeSchema.parse(value) },
    ),
    listAudits: (pageId, query = {}) => client.get<CustomerSduiAuditListEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/audits${queryString(query)}`,
      { validate: (value) => customerSduiAuditListEnvelopeSchema.parse(value) },
    ),
    createDraft: (pageId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions`, request, revisionMutationOptions,
    ),
    updateDraft: (pageId, revisionId, request) => client.patch<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}`,
      request, revisionMutationOptions,
    ),
    review: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/review`,
      request, revisionMutationOptions,
    ),
    publish: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/publish`,
      request, revisionMutationOptions,
    ),
    unpublish: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/unpublish`,
      request, revisionMutationOptions,
    ),
    rollback: (pageId, revisionId, request) => client.post<CustomerSduiRevisionEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/revisions/${revisionPath(revisionId)}/rollback`,
      request, revisionMutationOptions,
    ),
    setKillSwitch: (pageId, request) => client.post<CustomerSduiKillSwitchEnvelope>(
      `/api/internal/customer-sdui/pages/${pagePath(pageId)}/kill-switch`, request, killSwitchMutationOptions,
    ),
  };
}
