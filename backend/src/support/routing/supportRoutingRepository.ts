import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import type { CityCode, SupportTicketType } from "@xlb/types";

type RoutingGroupRow = RowDataPacket & {
  skill_group_id: string;
  matched_types_json: string | SupportTicketType[];
  matched_languages_json: string | string[];
  priority_weight: number | string;
  is_default: number | boolean;
};

export type RoutingDecision = {
  skillGroupId: string | null;
  matchKind: "exact_language" | "language_neutral" | "city_default" | "unassigned";
};

function parseArray<T>(value: string | T[]): T[] {
  return Array.isArray(value) ? value : JSON.parse(value) as T[];
}

export class SupportRoutingRepository {
  async loadActiveGroups(
    connection: PoolConnection,
    cityCode: CityCode,
  ): Promise<Array<{
    skillGroupId: string;
    matchedTypes: SupportTicketType[];
    matchedLanguages: string[];
    priorityWeight: number;
    isDefault: boolean;
  }>> {
    const [rows] = await connection.query<RoutingGroupRow[]>(
      `SELECT skill_group_id,matched_types_json,matched_languages_json,priority_weight,is_default
       FROM support_skill_groups
       WHERE city_code=? AND is_active=1
       ORDER BY priority_weight DESC,skill_group_id ASC`,
      [cityCode],
    );
    return rows.map((row) => ({
      skillGroupId: row.skill_group_id,
      matchedTypes: parseArray<SupportTicketType>(row.matched_types_json),
      matchedLanguages: parseArray<string>(row.matched_languages_json),
      priorityWeight: Number(row.priority_weight),
      isDefault: Boolean(row.is_default),
    }));
  }
}

export const supportRoutingRepository = new SupportRoutingRepository();
