import type { ServiceQualificationRule, WorkerCertification } from "@xlb/types";

export interface SkuQualificationMatch {
  isEligible: boolean;
  sourceCertificationId: string | null;
  missingCertTypes: string[];
}

export function matchWorkerToSkuRules(
  approvedCerts: WorkerCertification[],
  rules: ServiceQualificationRule[],
): SkuQualificationMatch {
  const requiredRules = rules.filter((rule) => rule.isRequired && rule.isEnabled);
  if (requiredRules.length === 0) {
    return {
      isEligible: true,
      sourceCertificationId: approvedCerts[0]?.certificationId ?? null,
      missingCertTypes: [],
    };
  }

  const approvedByType = new Map<string, WorkerCertification>();
  for (const cert of approvedCerts) {
    if (cert.status === "approved") {
      approvedByType.set(cert.certType, cert);
    }
  }

  const missingCertTypes: string[] = [];
  let sourceCertificationId: string | null = null;

  for (const rule of requiredRules) {
    const cert = approvedByType.get(rule.requiredCertType);
    if (!cert) {
      missingCertTypes.push(rule.requiredCertType);
      continue;
    }
    if (!sourceCertificationId) {
      sourceCertificationId = cert.certificationId;
    }
  }

  return {
    isEligible: missingCertTypes.length === 0,
    sourceCertificationId,
    missingCertTypes,
  };
}
