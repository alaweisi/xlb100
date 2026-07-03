import type { CityCode, WorkerCertification } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { submitWorkerCertificationSchema } from "@xlb/validators";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import {
  workerService,
} from "../../worker/workerService.js";
import { generateCertificationId } from "../../events/eventIds.js";
import {
  workerCertificationRepository,
  WorkerCertificationRepository,
} from "./workerCertificationRepository.js";

export class CertificationValidationError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "CertificationValidationError";
  }
}

export class CertificationNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(certificationId: string) {
    super(`Certification not found: ${certificationId}`);
    this.name = "CertificationNotFoundError";
  }
}

export class WorkerCertificationService {
  constructor(
    private readonly repository: WorkerCertificationRepository = workerCertificationRepository,
  ) {}

  async submitCertification(
    context: RequestContext,
    body: unknown,
  ): Promise<WorkerCertification> {
    const cityCode = assertCityScopedContext(context);
    if (!context.userId) {
      throw new CertificationValidationError("Missing worker userId");
    }

    const parsed = submitWorkerCertificationSchema.safeParse(body);
    if (!parsed.success) {
      throw new CertificationValidationError(parsed.error.message);
    }

    await workerService.assertWorkerBoundToCity(context.userId, cityCode);

    return this.repository.insert({
      certificationId: generateCertificationId(),
      workerId: context.userId,
      cityCode,
      certType: parsed.data.certType,
      certName: parsed.data.certName,
    });
  }

  async getCertification(
    certificationId: string,
    cityCode: CityCode,
  ): Promise<WorkerCertification> {
    const cert = await this.repository.findById(certificationId, cityCode);
    if (!cert) {
      throw new CertificationNotFoundError(certificationId);
    }
    return cert;
  }

  async listApprovedCertifications(
    workerId: string,
    cityCode: CityCode,
  ): Promise<WorkerCertification[]> {
    return this.repository.listApprovedByWorker(workerId, cityCode);
  }
}

export const workerCertificationService = new WorkerCertificationService();

export {
  WorkerNotFoundError,
  WorkerCityBindingError,
} from "../../worker/workerService.js";
