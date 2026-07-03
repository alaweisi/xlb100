import { isKnownCityCode } from "@xlb/config";
import { cityCodeSchema } from "@xlb/validators";
import { canonicalizeCityCode } from "./cityCanonicalizer.js";

export type ResolveCityCodeResult =
  | { ok: true; cityCode: string }
  | { ok: false; message: string };

export function resolveCityCode(raw: string): ResolveCityCodeResult {
  const cityCode = canonicalizeCityCode(raw);

  const parsed = cityCodeSchema.safeParse(cityCode);
  if (!parsed.success) {
    return { ok: false, message: "Invalid city_code format" };
  }

  if (!isKnownCityCode(cityCode)) {
    return { ok: false, message: `Unknown city_code: ${cityCode}` };
  }

  return { ok: true, cityCode };
}

export function requireCityCode(raw: string | undefined): ResolveCityCodeResult {
  if (!raw || raw.trim().length === 0) {
    return { ok: false, message: "city_code is required" };
  }
  return resolveCityCode(raw);
}
