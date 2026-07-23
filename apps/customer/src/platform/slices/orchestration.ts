export const CUSTOMER_ORCHESTRATION_LEVELS = ["L1", "L2", "L3"] as const;

export type OrchestrationLevel = typeof CUSTOMER_ORCHESTRATION_LEVELS[number];

export type CustomerOrchestrationPolicy =
  | {
      readonly level: "L1";
      readonly operationalManifest: "forbidden";
    }
  | {
      readonly level: "L2";
      readonly operationalManifest: "limited";
    }
  | {
      readonly level: "L3";
      readonly operationalManifest: "sdui";
    };

export function orchestrationPolicy(level: OrchestrationLevel): CustomerOrchestrationPolicy {
  switch (level) {
    case "L1":
      return Object.freeze({ level, operationalManifest: "forbidden" });
    case "L2":
      return Object.freeze({ level, operationalManifest: "limited" });
    case "L3":
      return Object.freeze({ level, operationalManifest: "sdui" });
  }
}
