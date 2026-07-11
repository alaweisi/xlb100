# Phase 15.3F-SKILL-SPIKE Impeccable Evaluation Report

## Scope

- Phase: `15.3F-SKILL-SPIKE - Impeccable Evaluation`.
- Tool evaluated: `pbakaus/impeccable`.
- Purpose: assess whether Impeccable can improve Codex UI construction quality for XLB100 as a Figma Pixel Repair reviewer, anti-slop checker, layout/typeset/polish aid.
- Hard boundary: Impeccable must not replace Figma MCP, must not freely redesign, and must not directly edit XLB100 UI pages.
- Production: `NO-GO`.
- Tags: not created.

## Opening State

- `git status --short`: clean.
- `git rev-parse HEAD`: `b722b4430b922f9938b7d23b89fab7a867bba517`.
- `git branch --show-current`: `main`.
- Phase premise: Phase 15.3E-VERIFY was `PARTIAL GO`; Customer / Worker may enter constrained Pixel Repair only after `WorkflowUiBinding` / `ActionContract` adapters. Admin Settlement / Governance remain `DESIGN_SOURCE_MISSING`.

## Source Review

- GitHub / docs describe Impeccable as a frontend design skill with `/impeccable audit`, `/impeccable critique`, `/impeccable polish`, `/impeccable layout`, `/impeccable typeset`, and a deterministic detector.
- Documented installation path:
  - `npx impeccable install`
  - Codex project-local install writes `.agents/skills/impeccable` and `.codex/hooks.json`.
  - Codex hook must be approved through `/hooks` after installation.
- Documented detector path:
  - `npx impeccable detect <file-or-dir-or-url>`
  - URL scanning requires `puppeteer`.

## Installation / Write Audit

### Initial CLI Probe

- Command: `npx impeccable --help`
- Effect: downloaded npm CLI into npm cache only.
- Observed package log: `impeccable@3.2.0`.
- Project file writes: none.

### Incorrect Help Probe Behavior

- Command attempted: `npx impeccable install --help`
- Observed behavior: the command did not behave like a passive help-only command; it followed default interactive install choices and wrote project-local files.
- Temporary XLB100 writes:
  - `.cursor/hooks.json`
  - `.cursor/skills/impeccable/`
  - `.github/hooks/`
  - `.github/skills/`
- Remediation: removed only those newly generated Impeccable files. Existing `.cursor/rules`, `.cursor/skills/xlb-*`, and `.github/workflows` were preserved.

### Isolated Codex Install

- Isolated location: `C:\Users\kong\.codex\impeccable-eval\xlb100-spike`.
- Command: `npx impeccable install --providers=codex --scope=project`.
- Result:
  - Installed skill into `C:\Users\kong\.codex\impeccable-eval\xlb100-spike\.agents\skills\impeccable`.
  - Installed hook into `C:\Users\kong\.codex\impeccable-eval\xlb100-spike\.codex\hooks.json`.
  - `npx impeccable check`: PASS, skills up to date, installed skill version `3.9.1`.
- XLB100 project writes from isolated install: none.

## Installed Files / Hook Shape

Isolated install wrote:

- `.agents/skills/impeccable/SKILL.md`
- `.agents/skills/impeccable/reference/*.md`
- `.agents/skills/impeccable/scripts/*.mjs`
- `.agents/skills/impeccable/agents/impeccable_asset_producer.toml`
- `.agents/skills/impeccable/agents/impeccable_manual_edit_applier.toml`
- `.codex/hooks.json`

Hook content:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|apply_patch",
        "hooks": [
          {
            "type": "command",
            "command": "node \".agents/skills/impeccable/scripts/hook.mjs\"",
            "timeout": 5,
            "statusMessage": "Checking UI changes"
          }
        ]
      }
    ]
  }
}
```

Codex approval:

- Required if installed into XLB100 because Codex requires `/hooks` approval for project hooks.
- Not requested or approved in this spike because no XLB100 hook was retained.

Active skills / hooks:

- Current XLB100 Codex session active skills did not include `impeccable`.
- Isolated install proves the Codex skill payload and hook manifest are structurally present.
- Normal activation would require installing into XLB100 or user-wide skill directories and restarting/reloading Codex; project hook display also requires `/hooks` approval.

## Trial Runs

### Static Detector

Commands:

- `npx impeccable detect --json apps/customer/src/app/App.tsx apps/worker/src/app/App.tsx packages/ui/src/components/index.tsx`
- `npx impeccable detect --json apps/customer/dist/index.html apps/worker/dist/index.html`

Result:

- Both returned `[]`.
- Interpretation: the deterministic detector did not find issues in the current TSX/static HTML scan. It also did not deeply understand XLB's Figma frame alignment or route workflow constraints.

### URL Detector

Command attempted against local preview URLs:

- `npx impeccable detect --json http://127.0.0.1:4174/customer/`
- `npx impeccable detect --json http://127.0.0.1:4175/worker/`

Result:

- BLOCKED: `puppeteer is required for URL scanning. Install: npm install puppeteer`.
- Decision: did not add `puppeteer` to the project because new project runtime/development dependencies are forbidden in this spike.

### Skill Context Script

Command:

- `node .agents\skills\impeccable\scripts\context.mjs --target G:\xlb100\apps\customer\src\app\App.tsx`

Result:

- `NO_PRODUCT_MD`
- It resolved:
  - target path: `G:\xlb100\apps\customer\src\app\App.tsx`
  - project root: `G:\xlb100\apps\customer`
  - repo root: `G:\xlb100`
  - no `PRODUCT.md`
  - no `DESIGN.md`

Implication:

- Impeccable's normal flow wants `PRODUCT.md` / `DESIGN.md` design context.
- XLB100 must not allow those files to override `docs/design/figma/**`, `CONTRACT_WORKFLOW_UI_BINDING.md`, runtime theming contract, or Phase 15 reports.

## Capability Evaluation

| Concern | Can Impeccable Help? | Evidence / Limit |
|---|---|---|
| AI template feel | YES, as reviewer | Skill guidance and audit reference explicitly check AI slop tells, overused palettes, generic card grids, and generic typography. |
| Cards inside cards | YES, as reviewer/hook | Skill guidance explicitly bans nested cards; hook can flag UI edits if installed and approved. |
| Typography hierarchy | YES, as reviewer | `reference/typeset.md` checks font choice, hierarchy, scale, readability, consistency, and product-vs-brand typography register. |
| Mobile safe area | PARTIAL | Audit/adapt guidance covers responsive and touch targets; it does not know XLB bottom-nav/safe-area rules unless given XLB context. |
| Bottom navigation occlusion | PARTIAL | Responsive audit can look for viewport issues, but deterministic static scan did not report anything for current C/W sources. Browser URL scan would require Puppeteer. |
| Engineering-flavored copy | YES, as reviewer | `clarify` / `audit` can flag unclear UX copy, but it must be constrained by XLB workflow/not-wired copy rules. |
| Figma style deviation | PARTIAL | It can critique generic visual drift, but it cannot compare against Figma MCP frames or local frame PNGs by itself. |
| Runtime theming discipline | PARTIAL | Audit can flag hard-coded colors; it does not understand XLB's rule that activeTheme must never affect business behavior unless we supply that contract. |

## Explicit Non-Capabilities

Impeccable cannot solve:

- Missing Figma frames.
- Admin Settlement / Governance `DESIGN_SOURCE_MISSING`.
- Missing backend `availableActions`.
- Missing `WorkflowUiBinding` adapters.
- Backend workflow authority, city_scope, audit, idempotency, or permission rules.
- Pixel comparison against Figma MCP screenshots unless paired with separate screenshot comparison workflow.
- Production readiness.

## Risk Assessment

- Project install risk: high. `npx impeccable install --help` unexpectedly wrote project files. Future use should prefer isolated install or explicit noninteractive flags.
- Context-source risk: medium/high. `NO_PRODUCT_MD` flow encourages creating `PRODUCT.md` / `DESIGN.md`; XLB100 already has authoritative Figma and contract docs.
- Hook risk: medium. Codex hook runs after `Edit|Write|apply_patch`; useful as a guard, but it needs `/hooks` approval and may produce noise during non-UI documentation edits unless scoped.
- Detector coverage risk: medium. Static `detect` produced no findings on current C/W TSX and dist HTML, so it should not be treated as proof of visual quality.
- Dependency risk: low if used only through `npx`/isolated install; URL scanning needs `puppeteer`, which should not be added to XLB100 for this spike.

## Recommendation

Decision: `Adopt with constraints`.

Allowed use in Phase 15.3F:

- Design review vocabulary after Figma MCP/local frame comparison.
- Anti-slop checklist for cards, typography hierarchy, generic palettes, touch targets, responsive density, and copy clarity.
- Optional deterministic detector via `npx impeccable detect` for source/static output.
- Optional isolated or user-wide skill use after explicit approval.

Forbidden use:

- Replacing Figma MCP or `docs/design/figma/**`.
- Creating a new freeform XLB design system through `/impeccable init`.
- Using `PRODUCT.md` / `DESIGN.md` as higher authority than Phase 15 contracts and Figma artifacts.
- Directly editing `apps/**` or `packages/**` through Impeccable in this spike.
- Installing `.agents`, `.codex/hooks.json`, `.cursor`, `.github`, or `.impeccable` into XLB100 without a dedicated approval step.
- Adding project `puppeteer` or other runtime/dev dependencies for Impeccable.

## Final Repository Impact

- XLB100 `.codex/hooks.json`: not present.
- XLB100 `.agents/skills`: not present.
- XLB100 `.impeccable`: not present.
- XLB100 `.cursor/hooks.json`: not present.
- XLB100 `.github/hooks` / `.github/skills`: not present.
- `.gitignore`: not modified because no project `.impeccable` files were retained.
- App/package/backend/db/deploy/infra changes: none.
- Production deploy: not performed.
- Tag: not created.

## Verification

- `git status --short`: clean before report edits.
- `Test-Path .codex`: `False`.
- `Test-Path .agents`: `False`.
- `Test-Path .impeccable`: `False`.
- `Test-Path .cursor\hooks.json`: `False`.
- `Test-Path .github\hooks`: `False`.
- `Test-Path .github\skills`: `False`.
- `rg -n "impeccable" .gitignore docs .cursor .github package.json pnpm-lock.yaml`: no matches before this report was added.
