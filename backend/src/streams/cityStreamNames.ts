import { cityCodeSchema } from "@xlb/validators";

const FORBIDDEN_STREAM_CITY_CODES = new Set([
  "__global__",
  "all",
  "global",
  "national",
]);

export class CityStreamNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CityStreamNameError";
  }
}

/** Returns city-scoped Redis stream name for dispatch orders */
export function getDispatchStreamName(cityCode: string): string {
  if (!cityCode || cityCode.trim().length === 0) {
    throw new CityStreamNameError("cityCode is required for dispatch stream");
  }

  const parsed = cityCodeSchema.safeParse(cityCode.trim().toLowerCase());
  if (!parsed.success) {
    throw new CityStreamNameError(parsed.error.issues[0]?.message ?? "invalid cityCode");
  }

  if (FORBIDDEN_STREAM_CITY_CODES.has(parsed.data)) {
    throw new CityStreamNameError(
      `national or global dispatch stream is forbidden: ${parsed.data}`,
    );
  }

  return `xlb:dispatch:${parsed.data}:orders`;
}

export const DEFAULT_DISPATCH_CONSUMER_GROUP = "xlb-dispatch-workers-v1";

export function getDispatchRetryHashName(streamName: string, groupName: string): string {
  return `${streamName}:consumer-retries:${groupName}`;
}
