export const TENCENT_CLOUD_TEST_ORIGIN = "http://123.207.198.136";

const PROFILES = new Set(["development", "test", "production"]);

function normalizedOrigin(value, label) {
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

export function resolveMobileEnvironment(profile, environment = process.env) {
  if (!PROFILES.has(profile)) {
    throw new Error(`Unsupported Customer Mobile environment: ${profile}`);
  }

  if (profile === "test") {
    const configured = environment.XLB_CUSTOMER_MOBILE_API_BASE_URL;
    if (
      configured !== undefined &&
      normalizedOrigin(configured, "XLB_CUSTOMER_MOBILE_API_BASE_URL") !==
        TENCENT_CLOUD_TEST_ORIGIN
    ) {
      throw new Error(
        `The test profile is pinned to ${TENCENT_CLOUD_TEST_ORIGIN}`,
      );
    }
    return Object.freeze({
      profile,
      apiBaseUrl: TENCENT_CLOUD_TEST_ORIGIN,
      publicBase: "./",
    });
  }

  const apiBaseUrl = normalizedOrigin(
    environment.XLB_CUSTOMER_MOBILE_API_BASE_URL,
    "XLB_CUSTOMER_MOBILE_API_BASE_URL",
  );
  if (!apiBaseUrl.startsWith("https://")) {
    throw new Error(`${profile} Customer Mobile API origin must use HTTPS`);
  }

  return Object.freeze({
    profile,
    apiBaseUrl,
    publicBase: "./",
  });
}
