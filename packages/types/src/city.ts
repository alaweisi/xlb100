/** Canonical city identifier — lowercase alphanumeric, hyphen, underscore */
export type CityCode = string;

/** Known city codes seeded in db/seed/001_cities.seed.sql (business cities only) */
export type KnownCityCode = "hangzhou" | "shanghai" | "beijing";
