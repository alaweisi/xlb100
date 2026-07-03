import type { CityCode, Fulfillment } from "@xlb/types";
import {
  fulfillmentRepository,
  FulfillmentRepository,
} from "./fulfillmentRepository.js";

export class FulfillmentNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(fulfillmentId: string) {
    super(`Fulfillment not found: ${fulfillmentId}`);
    this.name = "FulfillmentNotFoundError";
  }
}

export class FulfillmentService {
  constructor(
    private readonly repository: FulfillmentRepository = fulfillmentRepository,
  ) {}

  async getFulfillmentForWorker(
    fulfillmentId: string,
    cityCode: CityCode,
    workerId: string,
  ): Promise<Fulfillment> {
    const fulfillment = await this.repository.findByIdForWorker(
      fulfillmentId,
      cityCode,
      workerId,
    );
    if (!fulfillment) {
      throw new FulfillmentNotFoundError(fulfillmentId);
    }
    return fulfillment;
  }

  async listFulfillmentsForWorker(
    workerId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment[]> {
    return this.repository.listByWorker(workerId, cityCode);
  }

  async findByDispatchTaskId(
    dispatchTaskId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment | null> {
    return this.repository.findByDispatchTaskId(dispatchTaskId, cityCode);
  }

  async findByAcceptanceId(
    acceptanceId: string,
    cityCode: CityCode,
  ): Promise<Fulfillment | null> {
    return this.repository.findByAcceptanceId(acceptanceId, cityCode);
  }
}

export const fulfillmentService = new FulfillmentService();
