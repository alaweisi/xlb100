import type { CityCode, WorkerDispatchEligibility } from "@xlb/types";
import {
  workerCertificationRepository,
  WorkerCertificationRepository,
} from "../workerCertification/workerCertificationRepository.js";
import {
  qualificationRepository,
  QualificationRepository,
} from "../qualification/qualificationRepository.js";
import { matchWorkerToSkuRules } from "./serviceQualificationMatcher.js";

export class WorkerDispatchEligibilityService {
  constructor(
    private readonly certRepository: WorkerCertificationRepository = workerCertificationRepository,
    private readonly qualRepository: QualificationRepository = qualificationRepository,
  ) {}

  async computeEligibility(
    workerId: string,
    cityCode: CityCode,
    skuId: string,
  ): Promise<WorkerDispatchEligibility> {
    const stored = await this.qualRepository.findQualification(
      workerId,
      cityCode,
      skuId,
    );
    if (stored) {
      const reasons = stored.isEligible
        ? []
        : ["Worker qualification record indicates not eligible"];
      return {
        workerId,
        cityCode,
        skuId,
        isEligible: stored.isEligible,
        reasons,
      };
    }

    const approvedCerts = await this.certRepository.listApprovedByWorker(
      workerId,
      cityCode,
    );
    const rules = await this.qualRepository.listEnabledRulesForSku(cityCode, skuId);
    const match = matchWorkerToSkuRules(approvedCerts, rules);

    const reasons =
      match.missingCertTypes.length > 0
        ? match.missingCertTypes.map(
            (certType) => `Missing approved certification: ${certType}`,
          )
        : [];

    return {
      workerId,
      cityCode,
      skuId,
      isEligible: match.isEligible,
      reasons,
    };
  }
}

export const workerDispatchEligibilityService =
  new WorkerDispatchEligibilityService();
