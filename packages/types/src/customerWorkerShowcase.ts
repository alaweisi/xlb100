/**
 * Customer-facing, read-only worker capability summary.
 *
 * Worker ids, contact details, locations, booking actions and dispatch
 * availability are deliberately excluded from this customer contract.
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
