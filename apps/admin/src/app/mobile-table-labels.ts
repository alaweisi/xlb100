const ADMIN_TABLE_SELECTOR = ".admin-mobile-content table";
let generatedTableSequence = 0;

function normalizedLabel(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "table";
}

/**
 * Adds mobile field labels and explicit header associations to native admin
 * tables. `@xlb/ui` tables already ship these attributes; leaving existing
 * values intact lets a page provide a more specific business label.
 */
export function labelAdminMobileTables(root: ParentNode = document): void {
  root.querySelectorAll<HTMLTableElement>(ADMIN_TABLE_SELECTOR).forEach((table) => {
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
    if (headers.length === 0) return;

    if (!table.dataset.mobileTableId) {
      generatedTableSequence += 1;
      table.dataset.mobileTableId = `admin-mobile-table-${generatedTableSequence}`;
    }
    const tableId = table.id || table.dataset.mobileTableId;
    headers.forEach((header, headerIndex) => {
      if (!header.id) header.id = `${safeIdPart(tableId)}-column-${headerIndex + 1}`;
      if (!header.scope) header.scope = "col";
    });

    table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
      Array.from(row.cells).forEach((cell, cellIndex) => {
        const header = headers[cellIndex];
        if (!header) return;
        const label = normalizedLabel(header.textContent || header.getAttribute("aria-label"));
        if (label && !cell.dataset.label) cell.dataset.label = label;
        if (!cell.headers) cell.headers = header.id;
      });
    });
  });
}

/** Keeps lazy routes and asynchronously refreshed native tables labelled. */
export function observeAdminMobileTables(root: ParentNode = document): () => void {
  labelAdminMobileTables(root);
  if (typeof MutationObserver === "undefined") return () => undefined;

  const observer = new MutationObserver(() => labelAdminMobileTables(root));
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
