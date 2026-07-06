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

This snapshot is an implementation input, not a generated UI implementation. Phase 15.2 page construction must use this local snapshot and Figma MCP as source of truth. Codex must not freely redesign customer, worker, or admin pages from memory.

Do not commit Figma access tokens, MCP credentials, private asset URLs, or short-lived screenshot URLs.
