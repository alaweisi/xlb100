import type {
  CustomerSduiAuditAction,
  CustomerSduiAuditRecord,
  CustomerSduiKillSwitchState,
  CustomerSduiManifestDefinition,
  CustomerSduiPageId,
  CustomerSduiRevision,
  CustomerSduiRevisionStatus,
  RequestContext,
} from "@xlb/types";
import type {
  CustomerSduiAuditInput,
  CustomerSduiReplay,
  CustomerSduiRepository,
  CustomerSduiPageResult,
  CustomerSduiStore,
} from "../../backend/src/customerSdui/customerSduiRepository.js";

export function validCustomerSduiDefinition(manifestId = "customer.home.primary"): CustomerSduiManifestDefinition {
  return {
    schemaVersion: "1.0",
    componentContractVersion: "1.0",
    manifestId,
    pageId: "customer.home",
    dataSources: [
      { id: "current-location", dataKey: "customer.current_location", parameters: {} },
      { id: "notification-summary", dataKey: "customer.notification_summary", parameters: {} },
      { id: "service-categories", dataKey: "catalog.service_categories", parameters: { limit: 16 } },
    ],
    actions: [
      { id: "choose-location", actionKey: "location.open_picker" },
      { id: "open-notifications", actionKey: "notification.open_center" },
      { id: "submit-search", actionKey: "search.submit" },
      { id: "open-category", actionKey: "service.open_category" },
      { id: "open-services", actionKey: "service.open_all" },
      { id: "open-home", actionKey: "navigation.open_home" },
      { id: "open-support", actionKey: "navigation.open_support" },
      { id: "open-orders", actionKey: "navigation.open_orders" },
      { id: "open-profile", actionKey: "navigation.open_profile" },
      { id: "open-demand", actionKey: "demand.open_create" },
    ],
    components: [
      {
        id: "home-location", type: "location_header", contractVersion: "1.0", region: "header", order: 0,
        enabled: true, props: { subtitle: "安心到家，服务就在身边", showNotifications: true },
        dataBindings: [
          { slot: "location", dataRef: "current-location", required: true },
          { slot: "notifications", dataRef: "notification-summary", required: false },
        ],
        actionBindings: [
          { slot: "location", actionRef: "choose-location" },
          { slot: "notification", actionRef: "open-notifications" },
        ],
      },
      {
        id: "home-search", type: "search_bar", contractVersion: "1.0", region: "header", order: 1,
        enabled: true, props: { placeholder: "搜索全部上门服务", accessibleLabel: "搜索上门服务" },
        dataBindings: [], actionBindings: [{ slot: "submit", actionRef: "submit-search" }],
      },
      {
        id: "home-service-grid", type: "service_grid", contractVersion: "1.0", region: "content", order: 0,
        enabled: true, props: { title: "全部服务", columns: 4, maxItems: 16, showViewAll: true },
        dataBindings: [{ slot: "items", dataRef: "service-categories", required: true }],
        actionBindings: [
          { slot: "item", actionRef: "open-category" },
          { slot: "view-all", actionRef: "open-services" },
        ],
      },
      {
        id: "home-bottom-navigation", type: "bottom_navigation", contractVersion: "1.0", region: "footer", order: 0,
        enabled: true, props: { activeItem: "home", showDemandAction: true }, dataBindings: [],
        actionBindings: [
          { slot: "home", actionRef: "open-home" }, { slot: "support", actionRef: "open-support" },
          { slot: "orders", actionRef: "open-orders" }, { slot: "profile", actionRef: "open-profile" },
          { slot: "demand", actionRef: "open-demand" },
        ],
      },
    ],
    fallbackPolicy: {
      strategy: "last_known_good_then_builtin",
      builtinManifestId: "customer.home.builtin",
      maximumStaleSeconds: 86_400,
    },
  };
}

export function context(input: Partial<RequestContext> & Pick<RequestContext, "appType" | "role">): RequestContext {
  return {
    traceId: "00000000-0000-4000-8000-000000000099",
    requestStartedAt: "2026-07-23T00:00:00.000Z",
    cityCode: "hangzhou",
    userId: "operator-author",
    ...input,
  };
}

function key(city: string, page: string, revision: string): string { return `${city}|${page}|${revision}`; }
function pageKey(city: string, page: string): string { return `${city}|${page}`; }

export class MemoryCustomerSduiRepository implements CustomerSduiRepository, CustomerSduiStore {
  readonly revisions = new Map<string, CustomerSduiRevision>();
  readonly replays = new Map<string, CustomerSduiReplay>();
  readonly killSwitches = new Map<string, CustomerSduiKillSwitchState>();
  readonly audits: CustomerSduiAuditInput[] = [];
  failReads = false;
  private transactionTail: Promise<void> = Promise.resolve();

  async transaction<T>(fn: (store: CustomerSduiStore) => Promise<T>): Promise<T> {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = {
      revisions: structuredClone(this.revisions),
      replays: structuredClone(this.replays),
      killSwitches: structuredClone(this.killSwitches),
      audits: structuredClone(this.audits),
    };
    try {
      return await fn(this);
    } catch (error) {
      this.revisions.clear();
      snapshot.revisions.forEach((value, itemKey) => this.revisions.set(itemKey, value));
      this.replays.clear();
      snapshot.replays.forEach((value, itemKey) => this.replays.set(itemKey, value));
      this.killSwitches.clear();
      snapshot.killSwitches.forEach((value, itemKey) => this.killSwitches.set(itemKey, value));
      this.audits.splice(0, this.audits.length, ...snapshot.audits);
      throw error;
    } finally {
      release();
    }
  }
  async findReplay(input: { cityCode: string; pageId: CustomerSduiPageId; operation: string; actorId: string; idempotencyHash: string }): Promise<CustomerSduiReplay | null> {
    return this.replays.get(`${input.cityCode}|${input.pageId}|${input.operation}|${input.actorId}|${input.idempotencyHash}`) ?? null;
  }
  async insertReplay(input: { mutationId: string; cityCode: string; pageId: CustomerSduiPageId; operation: string; actorId: string; idempotencyHash: string; requestFingerprint: string; response: unknown }): Promise<void> {
    this.replays.set(`${input.cityCode}|${input.pageId}|${input.operation}|${input.actorId}|${input.idempotencyHash}`, {
      requestFingerprint: input.requestFingerprint, response: structuredClone(input.response),
    });
  }
  async insertRevision(cityCode: string, revision: CustomerSduiRevision): Promise<void> {
    this.revisions.set(key(cityCode, revision.pageId, revision.revisionId), structuredClone(revision));
  }
  async findRevisionForUpdate(cityCode: string, pageId: CustomerSduiPageId, revisionId: string): Promise<CustomerSduiRevision | null> {
    return structuredClone(this.revisions.get(key(cityCode, pageId, revisionId)) ?? null);
  }
  async updateRevision(cityCode: string, revision: CustomerSduiRevision): Promise<boolean> {
    const itemKey = key(cityCode, revision.pageId, revision.revisionId);
    const current = this.revisions.get(itemKey);
    if (!current || current.version !== revision.version - 1) return false;
    this.revisions.set(itemKey, structuredClone(revision));
    return true;
  }
  async findPublishedForUpdate(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiRevision | null> {
    return (await this.listPublished(cityCode, pageId, new Date().toISOString()))[0] ?? null;
  }
  async getKillSwitchForUpdate(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiKillSwitchState | null> {
    return structuredClone(this.killSwitches.get(pageKey(cityCode, pageId)) ?? null);
  }
  async upsertKillSwitch(cityCode: string, state: CustomerSduiKillSwitchState, expectedVersion: number): Promise<boolean> {
    const itemKey = pageKey(cityCode, state.pageId);
    const current = this.killSwitches.get(itemKey);
    if ((current?.version ?? 1) !== expectedVersion) return false;
    this.killSwitches.set(itemKey, structuredClone(state));
    return true;
  }
  async insertAudit(input: CustomerSduiAuditInput): Promise<void> { this.audits.push(structuredClone(input)); }
  async listPublished(
    cityCode: string,
    pageId: CustomerSduiPageId,
    _resolvedAt: string,
  ): Promise<CustomerSduiRevision[]> {
    if (this.failReads) throw new Error("database unavailable");
    return [...this.revisions.entries()]
      .filter(([itemKey, revision]) => itemKey.startsWith(`${cityCode}|${pageId}|`) && revision.status === "published")
      .map(([, revision]) => structuredClone(revision));
  }
  async getKillSwitch(cityCode: string, pageId: CustomerSduiPageId): Promise<CustomerSduiKillSwitchState | null> {
    if (this.failReads) throw new Error("database unavailable");
    return structuredClone(this.killSwitches.get(pageKey(cityCode, pageId)) ?? null);
  }
  async listRevisions(input: {
    cityCode: string;
    pageId: CustomerSduiPageId;
    status?: CustomerSduiRevisionStatus;
    cursor?: string;
    limit: number;
  }): Promise<CustomerSduiPageResult<CustomerSduiRevision>> {
    const offset = Number(input.cursor ?? "0");
    const matches = [...this.revisions.entries()]
      .filter(([itemKey, revision]) =>
        itemKey.startsWith(`${input.cityCode}|${input.pageId}|`) &&
        (input.status === undefined || revision.status === input.status))
      .map(([, revision]) => structuredClone(revision))
      .sort((left, right) => right.audit.createdAt.localeCompare(left.audit.createdAt));
    return {
      items: matches.slice(offset, offset + input.limit),
      nextCursor: matches.length > offset + input.limit ? String(offset + input.limit) : null,
    };
  }
  async getRevision(
    cityCode: string,
    pageId: CustomerSduiPageId,
    revisionId: string,
  ): Promise<CustomerSduiRevision | null> {
    return structuredClone(this.revisions.get(key(cityCode, pageId, revisionId)) ?? null);
  }
  async listAudits(input: {
    cityCode: string;
    pageId: CustomerSduiPageId;
    revisionId?: string;
    action?: CustomerSduiAuditAction;
    cursor?: string;
    limit: number;
  }): Promise<CustomerSduiPageResult<CustomerSduiAuditRecord>> {
    const offset = Number(input.cursor ?? "0");
    const matches = this.audits
      .filter((audit) =>
        audit.cityCode === input.cityCode &&
        audit.pageId === input.pageId &&
        (input.revisionId === undefined || audit.revisionId === input.revisionId) &&
        (input.action === undefined || audit.action === input.action))
      .map((audit) => ({
        auditId: audit.auditId,
        pageId: audit.pageId,
        revisionId: audit.revisionId,
        action: audit.action,
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        reason: audit.reason,
        expectedVersion: audit.expectedVersion,
        actualVersion: audit.actualVersion,
        contentHashSha256: audit.contentHashSha256,
        traceId: audit.traceId,
        createdAt: audit.createdAt,
      }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return {
      items: matches.slice(offset, offset + input.limit),
      nextCursor: matches.length > offset + input.limit ? String(offset + input.limit) : null,
    };
  }
}
