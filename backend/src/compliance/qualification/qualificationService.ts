import type { CityCode } from "@xlb/types";
import {
  qualificationRepository,
  QualificationRepository,
} from "./qualificationRepository.js";
import { matchWorkerToSkuRules } from "../certMatcher/serviceQualificationMatcher.js";
import {
  workerCertificationRepository,
  WorkerCertificationRepository,
} from "../workerCertification/workerCertificationRepository.js";

export class QualificationService {
  constructor(
    private readonly repository: QualificationRepository = qualificationRepository,
    private readonly certRepository: WorkerCertificationRepository = workerCertificationRepository,
  ) {}

  async refreshQualificationsForWorker(
    workerId: string,
    cityCode: CityCode,
  ): Promise<void> {
    const approvedCerts = await this.certRepository.listApprovedByWorker(
      workerId,
      cityCode,
    );
    const rules = await this.repository.listEnabledRulesForCity(cityCode);
    const skuIds = [...new Set(rules.map((rule) => rule.skuId))];

    for (const skuId of skuIds) {
      const skuRules = rules.filter((rule) => rule.skuId === skuId);
      const match = matchWorkerToSkuRules(approvedCerts, skuRules);
      await this.repository.upsertQualification({
        workerId,
        cityCode,
        skuId,
        isEligible: match.isEligible,
        sourceCertificationId: match.sourceCertificationId,
      });
    }
  }
}

export const qualificationService = new QualificationService();
