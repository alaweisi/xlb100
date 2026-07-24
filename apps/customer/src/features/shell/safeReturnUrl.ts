const SAFE_DEFAULT_RETURN_URL = "/";

export function resolveSafeCustomerReturnUrl(
  candidate: string | null | undefined,
  origin: string,
): string {
  if (candidate === null || candidate === undefined || candidate.length === 0) {
    return SAFE_DEFAULT_RETURN_URL;
  }
  if (candidate.length > 2_048 || !/^https?:\/\//iu.test(origin)) {
    return SAFE_DEFAULT_RETURN_URL;
  }

  try {
    const url = new URL(candidate, origin);
    if (
      url.origin !== origin ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname === "/auth/login" ||
      url.pathname === "/customer" ||
      url.pathname.startsWith("/customer/")
    ) {
      return SAFE_DEFAULT_RETURN_URL;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return SAFE_DEFAULT_RETURN_URL;
  }
}

export function customerReturnUrlFromQuery(
  query: Readonly<Record<string, string>>,
  origin: string,
): string {
  return resolveSafeCustomerReturnUrl(query.returnTo ?? query.returnUrl, origin);
}
