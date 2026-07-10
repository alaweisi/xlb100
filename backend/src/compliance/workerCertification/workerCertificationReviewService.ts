import type { WorkerCertification, WorkerCertificationStatus } from "@xlb/types";
import type { RequestContext } from "@xlb/types";
import { rejectWorkerCertificationSchema } from "@xlb/validators";
import { assertAdminCanAccessCity } from "../../dal/adminQueryGuard.js";
import { isAdminScopedRole } from "../../city/cityScopeResolver.js";
import { assertCityScopedContext } from "../../dal/scopedExecutor.js";
import { assertCertificationTransition } from "./workerCertificationStateMachine.js";
import {
  workerCertificationRepository,
  WorkerCertificationRepository,
} from "./workerCertificationRepository.js";
import {
  workerCertificationService,
  CertificationNotFoundError,
  CertificationValidationError,
} from "./workerCertificationService.js";
import { qualificationService } from "../qualification/qualificationService.js";

export class CertificationReviewForbiddenError extends Error {
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = "CertificationReviewForbiddenError";
  }
}

export class WorkerCertificationReviewService {
  constructor(
    private readonly repository: WorkerCertificationRepository = workerCertificationRepository,
  ) {}

  async list(context: RequestContext, status?: WorkerCertificationStatus): Promise<WorkerCertification[]> {
    this.assertAdminReviewContext(context);
    const cityCode = assertCityScopedContext(context);
    await assertAdminCanAccessCity(context, cityCode);
    return this.repository.listByCity(cityCode, status);
  }

  async approve(
    context: RequestContext,
    certificationId: string,
  ): Promise<WorkerCertification> {
    this.assertAdminReviewContext(context);
    const cityCode = assertCityScopedContext(context);
    await assertAdminCanAccessCity(context, cityCode);

    const cert = await workerCertificationService.getCertification(
      certificationId,
      cityCode,
    );
    assertCertificationTransition(cert.status, "approved");

    const updated = await this.repository.updateStatus(
      certificationId,
      cityCode,
      "approved",
      context.userId!,
    );
    if (!updated) {
      throw new CertificationNotFoundError(certificationId);
    }

    await qualificationService.refreshQualificationsForWorker(
      cert.workerId,
      cityCode,
    );

    return updated;
  }

  async reject(
    context: RequestContext,
    certificationId: string,
    body: unknown,
  ): Promise<WorkerCertification> {
    this.assertAdminReviewContext(context);
    const cityCode = assertCityScopedContext(context);
    await assertAdminCanAccessCity(context, cityCode);

    const parsed = rejectWorkerCertificationSchema.safeParse(body);
    if (!parsed.success) {
      throw new CertificationValidationError(parsed.error.message);
    }

    const cert = await workerCertificationService.getCertification(
      certificationId,
      cityCode,
    );
    assertCertificationTransition(cert.status, "rejected");

    const updated = await this.repository.updateStatus(
      certificationId,
      cityCode,
      "rejected",
      context.userId!,
      parsed.data.reason,
    );
    if (!updated) {
      throw new CertificationNotFoundError(certificationId);
    }

    return updated;
  }

  private assertAdminReviewContext(context: RequestContext): void {
    if (context.appType !== "admin" || !isAdminScopedRole(context.role)) {
      throw new CertificationReviewForbiddenError(
        "Certification review requires admin app with operator role",
      );
    }
    if (!context.userId) {
      throw new CertificationReviewForbiddenError("Missing admin userId");
    }
  }
}

export const workerCertificationReviewService =
  new WorkerCertificationReviewService();

export { InvalidCertificationTransitionError } from "./workerCertificationStateMachine.js";
