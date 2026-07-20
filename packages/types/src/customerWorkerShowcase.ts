/**
 * Customer-facing, read-only worker capability summary.
 *
 * This contract intentionally excludes worker ids, phone numbers, locations,
 * contact actions, booking actions, and dispatch availability. Customers book
 * SKUs; the platform remains responsible for worker assignment.
 */
export interface CustomerWorkerShowcaseItem {
  showcaseId: string;
  displayName: string;
  skillCategoryNames: string[];
  averageRating: number | null;
  ratingCount: number;
  certificationLabel: "平台认证" | "平台入驻";
}

export interface CustomerWorkerShowcaseResponse {
  ok: true;
  items: CustomerWorkerShowcaseItem[];
  disclosure: string;
}
