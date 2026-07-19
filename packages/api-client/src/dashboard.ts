import type { DashboardOperationsResponse } from "@xlb/types";
import type { ApiClient } from "./createApiClient.js";

export function createDashboardApi(client: ApiClient) {
  return {
    getOperations(): Promise<DashboardOperationsResponse> {
      return client.get<DashboardOperationsResponse>("/api/internal/dashboard/operations");
    },
  };
}
