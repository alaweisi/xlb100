/** Canonical city identifier — lowercase alphanumeric, hyphen, underscore */
export type CityCode = string;

/** Known city codes seeded in db/seed/cities.seed.sql (Phase 1) */
export type KnownCityCode = "hangzhou" | "shanghai" | "beijing";
