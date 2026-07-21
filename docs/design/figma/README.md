# Phase 15 Figma Design Snapshot

This directory stores the local Phase 15.0C design intake snapshot exported from the user-provided Figma source.

## Source

- Figma file: `Untitled`
- Root node: `1:2`
- Source URL: `https://www.figma.com/design/WrIq7mTPz9zB5EJkftS3sY/Untitled?node-id=1-2&t=qQ8sSMGYxKB5zpJn-0`
- Read method: Figma MCP (`get_metadata`, `get_screenshot`, read-only `use_figma`)

## Contents

- `source.md`: source, permission, and export method record.
- `manifest.json`: Figma root, frame inventory, style/component inventory, and exported local PNGs.
- `tokens.json`: detected token evidence and unknown token fields.
- `components.json`: Figma component inventory mapped against `@xlb/ui`.
- `pages.json`: customer, worker, admin, dashboard, oa, and supporting frame classification.
- `frames/`: local PNG snapshots for key frames.
- `assets/`: reusable visual snapshot references.
- `reports/`: intake, component map, and render optimization plan.

## Boundary

This directory is a historical intake snapshot, not a current cross-app visual authority. In particular, the former `Customer / Home / Default` PNG has been removed and superseded by `docs/design/ui/references/customer-home-visual-truth.png`; all Customer Home and descendant Customer visual work starts from `docs/design/ui/CUSTOMER_HOME_VISUAL_TRUTH.md`. Worker and Admin records remain scoped to their own roles and must never be used as Customer visual input.

Do not commit Figma access tokens, MCP credentials, private asset URLs, or short-lived screenshot URLs.
