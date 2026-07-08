import type { CityCode, RequestContext, WorkerTaskPoolItem } from "@xlb/types";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";
import {
  dispatchRepository,
  DispatchRepository,
} from "../dispatch/dispatchRepository.js";

export class TaskPoolService {
  constructor(
    private readonly dispatch: DispatchRepository = dispatchRepository,
  ) {}

  async listAvailableTasksForWorker(
    context: RequestContext,
    cityCode: CityCode,
    workerId: string,
    limit = 100,
  ): Promise<WorkerTaskPoolItem[]> {
    assertCityScopedContext(context);
    if (context.cityCode !== cityCode) {
      throw new Error("city_code mismatch in task pool query");
    }

    const tasks = await this.dispatch.listAvailableTasksForWorker(
      context,
      cityCode,
      workerId,
      limit,
    );
    return tasks.map((task) => ({
      dispatchTaskId: task.dispatchTaskId,
      cityCode: task.cityCode,
      orderId: task.orderId,
      skuId: task.skuId,
      amount: task.amount,
      streamName: task.streamName,
      status: task.status,
      createdAt: task.createdAt,
    }));
  }
}

export const taskPoolService = new TaskPoolService();
