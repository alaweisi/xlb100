import { MOBILE_PROFILES } from "./schema.mjs";

export function normalizeHttpOrigin(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) origin`);
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${label} must be an origin without credentials, path, query, or hash`);
  }
  return url.origin;
}

export function resolveMobileEnvironment(app, profileName, environment = process.env) {
  if (!MOBILE_PROFILES.includes(profileName)) {
    throw new Error(`Unsupported ${app.key} mobile environment: ${profileName}`);
  }

  const profile = app.environment.profiles[profileName];
  const variable = app.environment.apiBaseUrlVariable;
  let apiBaseUrl;
  if (profile.source === "fixed") {
    apiBaseUrl = normalizeHttpOrigin(profile.apiBaseUrl, `${profileName}.apiBaseUrl`);
    if (
      environment[variable] !== undefined &&
      normalizeHttpOrigin(environment[variable], variable) !== apiBaseUrl
    ) {
      throw new Error(`The ${profileName} profile is pinned to ${apiBaseUrl}`);
    }
  } else {
    apiBaseUrl = normalizeHttpOrigin(environment[variable], variable);
  }

  if (profile.requireHttps && !apiBaseUrl.startsWith("https://")) {
    throw new Error(`${profileName} ${app.key} mobile API origin must use HTTPS`);
  }

  return Object.freeze({
    profile: profileName,
    apiBaseUrl,
    publicBase: app.web.publicBase,
  });
}
