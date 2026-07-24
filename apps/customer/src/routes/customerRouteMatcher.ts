import type { CustomerTemplateRouteContext } from "../platform/slices/index.js";
import {
  customerAppRouteAssembly,
  type CustomerPublishedRoute,
} from "./customerAppRegistry.js";

const MAX_PATH_LENGTH = 2_048;

export interface CustomerRouteMatch {
  readonly published: CustomerPublishedRoute;
  readonly route: CustomerTemplateRouteContext;
}

function decodePathSegment(segment: string): string | null {
  if (segment.length === 0 || segment.length > 512) return null;
  try {
    const decoded = decodeURIComponent(segment);
    if (
      decoded.length === 0 ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      [...decoded].some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
      })
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function pathnameSegments(pathname: string): readonly string[] | null {
  if (
    pathname === "/" ||
    (
      pathname.startsWith("/") &&
      pathname.length <= MAX_PATH_LENGTH &&
      !pathname.includes("?") &&
      !pathname.includes("#") &&
      !pathname.endsWith("/") &&
      !pathname.includes("//")
    )
  ) {
    if (pathname === "/") return Object.freeze([]);
    const decoded = pathname.slice(1).split("/").map(decodePathSegment);
    return decoded.every((segment): segment is string => segment !== null)
      ? Object.freeze(decoded)
      : null;
  }
  return null;
}

function patternSpecificity(pattern: string): number {
  return pattern.split("/").filter((segment) => segment !== "" && !segment.startsWith(":")).length;
}

function queryRecord(search: string): Readonly<Record<string, string>> {
  const query: Record<string, string> = Object.create(null) as Record<string, string>;
  const safeSearch = search.startsWith("?") ? search.slice(1) : search;
  for (const [key, value] of new URLSearchParams(safeSearch)) {
    query[key] = value;
  }
  return Object.freeze(query);
}

export function matchCustomerRoute(
  pathname: string,
  search = "",
  publishedRoutes: readonly CustomerPublishedRoute[] = customerAppRouteAssembly.routes,
): CustomerRouteMatch | null {
  const actualSegments = pathnameSegments(pathname);
  if (actualSegments === null) return null;

  const candidates = [...publishedRoutes].sort((left, right) =>
    patternSpecificity(right.pattern) - patternSpecificity(left.pattern)
  );
  for (const published of candidates) {
    const patternSegments = published.pattern === "/"
      ? []
      : published.pattern.slice(1).split("/");
    if (patternSegments.length !== actualSegments.length) continue;

    const params: Record<string, string> = Object.create(null) as Record<string, string>;
    let matches = true;
    for (let index = 0; index < patternSegments.length; index += 1) {
      const expected = patternSegments[index]!;
      const actual = actualSegments[index]!;
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = actual;
      } else if (expected !== actual) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    return Object.freeze({
      published,
      route: Object.freeze({
        pathname,
        pattern: published.pattern,
        params: Object.freeze(params),
        query: queryRecord(search),
      }),
    });
  }
  return null;
}
