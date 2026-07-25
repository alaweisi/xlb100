import { describe, expect, it, vi } from "vitest";
import type { ApiClient, ApiRequestOptions } from "../../packages/api-client/src/createApiClient.js";
import {
  createDashboardApi,
  validateDashboardRealtimeResponse,
} from "../../packages/api-client/src/dashboard.js";
import type { RequestContext } from "../../packages/types/src/index.js";
import {
  DashboardService,
  DashboardServiceError,
} from "../../backend/src/dashboard/dashboardService.js";
import {
  createToken,
  verifyToken,
} from "../../backend/src/auth/tokenAuth.js";
import type {
  DashboardAggregateRows,
  DashboardRepository,
} from "../../backend/src/dashboard/dashboardRepository.js";

const observedAt = new Date("2026-07-26T08:00:00.000Z");

function aggregates(): DashboardAggregateRows {
  return {
    observedAt,
    orders: { today: 128 },
    payments: {
      paidAmountToday: "26880.00",
      paidToday: 96,
      failedToday: 4,
      totalToday: 100,
    },
    fulfillment: {
      pendingDispatch: 8,
      pendingAcceptance: 3,
      serviceActive: 24,
      completedToday: 72,
      longestPendingSeconds: 3_800,
    },
    aftersale: {
      untriaged: 2,
      active: 5,
      urgentOrCritical: 1,
      pendingRepair: 3,
      oldestUrgentSeconds: 1_200,
    },
    support: {
      queueingConversations: 3,
      onlineAgents: 12,
      oldestWaitSeconds: 180,
      resolvedToday: 46,
      slaBreached: 0,
    },
    pulse: [{
      bucketStart: new Date("2026-07-26T07:55:00.000Z"),
      ordersCreated: 7,
      paymentsPaid: 6,
      fulfillmentsCompleted: 4,
    }],
    cities: [{
      cityCode: "hangzhou",
      cityName: "杭州",
      ordersToday: 128,
      overdueCount: 2,
      urgentComplaintCount: 1,
      supportQueueCount: 3,
    }],
  };
}

function context(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    traceId: "trace-dashboard",
    requestStartedAt: "2026-07-26T08:00:00.000Z",
    appType: "dashboard",
    role: "operator",
    userId: "admin-1",
    ...overrides,
  };
}

describe("Dashboard realtime contract", () => {
  it("builds a read-only, privacy-safe operations snapshot", async () => {
    const repository = {
      read: vi.fn().mockResolvedValue(aggregates()),
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    const snapshot = await service.realtime(context());

    expect(repository.read).toHaveBeenCalledWith(undefined);
    expect(snapshot).toMatchObject({
      contractVersion: "1",
      scope: { kind: "all", label: "全国" },
      refreshAfterSeconds: 15,
      staleAfterSeconds: 45,
      disconnectedAfterSeconds: 120,
      privacy: {
        containsPersonalData: false,
        exactWorkerLocationIncluded: false,
        messageContentIncluded: false,
      },
      headline: {
        ordersToday: 128,
        paidAmountToday: "26880.00",
        paymentSuccessRate: 96,
      },
    });
    expect(snapshot.attention).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "aftersale-urgent", severity: "critical" }),
      expect.objectContaining({ id: "dispatch-wait", severity: "warning" }),
    ]));
    expect(snapshot.cities[0]).toMatchObject({ cityName: "杭州", state: "critical" });
    expect(JSON.stringify(snapshot)).not.toMatch(/phone|address|customerName|messageContent[^I]/i);
  });

  it("denies identities that are not issued for the Dashboard app", async () => {
    const repository = {
      read: vi.fn().mockResolvedValue(aggregates()),
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await expect(
      service.realtime(context({ appType: "admin" })),
    ).rejects.toMatchObject<Partial<DashboardServiceError>>({ statusCode: 403 });
    expect(repository.read).not.toHaveBeenCalled();
  });

  it("issues a dashboard-bound token and rejects incompatible roles", () => {
    const verified = verifyToken(createToken("admin-1", "operator", "dashboard"));
    expect(verified).toMatchObject({
      ok: true,
      payload: { sub: "admin-1", role: "operator", appType: "dashboard" },
    });
    expect(() => createToken("customer-1", "customer", "dashboard")).toThrow(
      "invalid subject",
    );
  });

  it("maps aggregate source failures to a truthful unavailable state", async () => {
    const repository = {
      read: vi.fn().mockRejectedValue(new Error("database offline")),
    } as unknown as DashboardRepository;
    const service = new DashboardService(repository);

    await expect(service.realtime(context())).rejects.toMatchObject({
      statusCode: 503,
      message: "Dashboard aggregate source is unavailable",
    });
  });

  it("wires the client validator and city-scoped route", async () => {
    const get = vi.fn().mockResolvedValue(undefined);
    const client = {
      get,
      post: vi.fn(),
      postBinary: vi.fn(),
    } as unknown as ApiClient;
    const api = createDashboardApi(client);

    await api.getRealtimeSnapshot("hangzhou");

    expect(get).toHaveBeenCalledWith(
      "/api/dashboard/realtime?cityCode=hangzhou",
      expect.objectContaining({ validate: validateDashboardRealtimeResponse }),
    );
    const options = get.mock.calls[0]![1] as ApiRequestOptions<unknown>;
    expect(() => options.validate?.({ ok: true, snapshot: {} })).toThrow();
    const response = await new DashboardService({
      read: vi.fn().mockResolvedValue(aggregates()),
    } as unknown as DashboardRepository).realtime(context());
    expect(() => options.validate?.({ ok: true, snapshot: response })).not.toThrow();
    expect(() => options.validate?.({
      ok: true,
      snapshot: {
        ...response,
        privacy: { ...response.privacy, containsPersonalData: true },
      },
    })).toThrow("no-personal-data");
  });
});
