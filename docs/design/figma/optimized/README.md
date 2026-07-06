# Phase 15.0D Codex Design Render Optimization

This directory contains the product-grade render optimization pass for the Phase 15 Figma snapshot.

The files here are implementation guidance only. They do not replace the Figma source, do not authorize free redesign, and do not implement app pages.

## Files

- `tokens.optimized.json`: semantic token recommendations based on Figma facts plus clearly marked Codex Design suggestions.
- `component-render-rules.md`: rendering rules for current and missing `@xlb/ui` components.
- `page-render-strategy.md`: customer, worker, and admin page shell strategy.
- `render-performance-guidelines.md`: browser rendering and performance constraints for Phase 15 implementation.

## Boundary

- Do not modify `apps/**` from this phase.
- Do not modify `packages/ui/**` from this phase.
- Do not deploy.
- Do not tag.
- Production remains NO-GO.
