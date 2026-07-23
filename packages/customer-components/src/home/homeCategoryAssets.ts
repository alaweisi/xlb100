const CATEGORY_ASSET_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => {
      const sequence = String(index + 1).padStart(2, "0");
      return [`cat_${sequence}`, `/assets/customer/service-categories/cat-${sequence}-v1.png`];
    }),
  ),
);

/** Versioned, closed mapping from official Catalog category keys to approved art. */
export function resolveHomeCategoryAsset(categoryId: string): string | null {
  return CATEGORY_ASSET_BY_ID[categoryId] ?? null;
}
