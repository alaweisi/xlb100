import type { PoolConnection } from "mysql2/promise";
import type { CityCode, SupportTicketType } from "@xlb/types";
import {
  supportRoutingRepository, type RoutingDecision, type SupportRoutingRepository,
} from "./supportRoutingRepository.js";

export class SupportRoutingService {
  constructor(private readonly repository: SupportRoutingRepository = supportRoutingRepository) {}

  async selectSkillGroup(connection: PoolConnection, input: {
    cityCode: CityCode;
    type: SupportTicketType;
    preferredLanguage: string | null;
  }): Promise<RoutingDecision> {
    const groups = await this.repository.loadActiveGroups(connection, input.cityCode);
    const typeGroups = groups.filter((group) => group.matchedTypes.includes(input.type));
    const language = input.preferredLanguage?.toLowerCase() ?? null;

    if (language) {
      const exact = typeGroups.find((group) => group.matchedLanguages
        .some((candidate) => candidate.toLowerCase() === language));
      if (exact) return { skillGroupId: exact.skillGroupId, matchKind: "exact_language" };
    }

    const neutral = typeGroups.find((group) => group.matchedLanguages.length === 0);
    if (neutral) return { skillGroupId: neutral.skillGroupId, matchKind: "language_neutral" };

    const fallback = groups.find((group) => group.isDefault && group.matchedLanguages.length === 0);
    if (fallback) return { skillGroupId: fallback.skillGroupId, matchKind: "city_default" };
    return { skillGroupId: null, matchKind: "unassigned" };
  }
}

export const supportRoutingService = new SupportRoutingService();
