import type { CityCode, RequestContext } from "@xlb/types";
import {
  workerRepository,
  WorkerRepository,
} from "./workerRepository.js";

export class WorkerNotFoundError extends Error {
  constructor(workerId: string) {
    super(`Worker not found: ${workerId}`);
    this.name = "WorkerNotFoundError";
  }
}

export class WorkerCityBindingError extends Error {
  constructor(workerId: string, cityCode: CityCode) {
    super(`Worker ${workerId} is not bound to city ${cityCode}`);
    this.name = "WorkerCityBindingError";
  }
}

export class WorkerService {
  constructor(private readonly repository: WorkerRepository = workerRepository) {}

  async assertWorkerBoundToCity(
    workerId: string,
    cityCode: CityCode,
  ): Promise<void> {
    const profile = await this.repository.findProfileById(workerId);
    if (!profile || profile.status !== "active") {
      throw new WorkerNotFoundError(workerId);
    }

    const binding = await this.repository.findCityBinding(workerId, cityCode);
    if (!binding) {
      throw new WorkerCityBindingError(workerId, cityCode);
    }
  }

  async requireWorkerUserId(context: RequestContext): Promise<string> {
    if (!context.userId) {
      throw new WorkerNotFoundError("missing");
    }
    return context.userId;
  }
}

export const workerService = new WorkerService();
