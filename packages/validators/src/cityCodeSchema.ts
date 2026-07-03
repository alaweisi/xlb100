import { z } from "zod";

/** Reserved markers — valid format but not business cities */
export const RESERVED_CITY_CODES = ["__global__"] as const;

/** Canonical city_code: lowercase letters, digits, hyphen, underscore */
export const cityCodeSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^[a-z0-9_-]+$/,
    "city_code must be lowercase alphanumeric with optional hyphen or underscore",
  )
  .refine(
    (code) => !RESERVED_CITY_CODES.includes(code as (typeof RESERVED_CITY_CODES)[number]),
    "city_code is reserved and cannot be used as a business city",
  );

export type CityCodeInput = z.infer<typeof cityCodeSchema>;
