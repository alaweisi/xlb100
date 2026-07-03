import type { CityCode } from "./city.js";
import type { DispatchTaskStatus } from "./dispatch.js";

export interface WorkerTaskPoolItem {
  dispatchTaskId: string;
  cityCode: CityCode;
  orderId: string;
  skuId: string;
  amount: number;
  streamName: string;
  status: DispatchTaskStatus;
  createdAt: string;
}
