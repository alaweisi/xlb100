import { z } from "zod";

/** Canonical city_code: lowercase letters, digits, hyphen, underscore */
export const cityCodeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_-]+$/,
    "city_code must be lowercase alphanumeric with optional hyphen or underscore",
  );

export type CityCodeInput = z.infer<typeof cityCodeSchema>;
