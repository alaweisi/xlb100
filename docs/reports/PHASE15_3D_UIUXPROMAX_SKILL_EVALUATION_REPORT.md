# Phase 15.3D-SKILL-SPIKE - UI UX Pro Max Skill Evaluation

## Scope

This spike evaluates UI UX Pro Max as an auxiliary UI/UX review skill for Phase 15.3D Figma Pixel Alignment Repair.

It does not authorize the skill to replace Figma MCP, local Figma frame exports, or the route-to-frame pixel comparison workflow. It also does not authorize free redesign or direct edits to `apps/**` or `packages/**`.

## Precheck

- Starting HEAD: `c45c9c3182591ab4ea2e957924eec380eeb1d142`
- Branch: `main`
- Initial `git status --short`: clean
- Production: NO-GO
- Deploy: not performed
- Tag: not created

## Installation

UI UX Pro Max was not present in the OpenAI curated skill list. The installed source was the public GitHub repository `nextlevelbuilder/ui-ux-pro-max-skill`, path `.claude/skills/ui-ux-pro-max`.

Install command:

```powershell
python C:\Users\kong\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py --repo nextlevelbuilder/ui-ux-pro-max-skill --path .claude/skills/ui-ux-pro-max
```

Installed path:

```text
C:\Users\kong\.codex\skills\ui-ux-pro-max
```

The installation is outside this repository. It did not modify tracked project files, `package.json`, `pnpm-lock.yaml`, app source, backend source, deployment files, or production configuration.

Codex may need a restart before this user-level skill appears in the active skill list.

## Installed Files

The installation and first script executions created these local Codex user-directory files:

```text
C:\Users\kong\.codex\skills\ui-ux-pro-max\SKILL.md
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\app-interface.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\charts.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\colors.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\design.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\draft.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\google-fonts.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\icons.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\landing.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\motion.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\products.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\react-performance.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\styles.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\typography.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\ui-reasoning.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\ux-guidelines.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\_sync_all.py
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\angular.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\astro.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\flutter.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\html-tailwind.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\jetpack-compose.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\laravel.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\nextjs.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\nuxt-ui.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\nuxtjs.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\react-native.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\react.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\shadcn.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\svelte.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\swiftui.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\threejs.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\data\stacks\vue.csv
C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\core.py
C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\design_system.py
C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\search.py
C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\__pycache__\core.cpython-313.pyc
C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\__pycache__\design_system.cpython-313.pyc
```

No third-party skill files were created inside `G:\xlb100`; `.gitignore` did not need to change.

## Runtime Requirements

- Python: required for `scripts/search.py` and design-system generation helpers.
- Python version available in this environment: `Python 3.13.13`.
- npm/pnpm: not required for this installed skill path.
- CLI behavior: supported through direct Python script invocation.
- Repo package changes: none.
- Runtime dependency changes: none.

## Trial Commands

Design-system trial:

```powershell
python C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\search.py "home repair service mobile app Chinese customer worker admin Figma 390 phone shell" --design-system -p "XLB100 Phase 15 Pixel Repair" -f markdown
```

UX checklist trial:

```powershell
python C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\search.py "mobile bottom navigation safe area fixed CTA touch target" --domain ux -n 8
```

Worker dark-style trial:

```powershell
python C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\search.py "dark mobile dashboard service worker dispatch radar" --domain style -n 8
```

Customer warm-color trial:

```powershell
python C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\search.py "cream brown gold home service mobile app warm cards" --domain color -n 8
```

React implementation trial:

```powershell
python C:\Users\kong\.codex\skills\ui-ux-pro-max\scripts\search.py "React mobile shell fixed bottom navigation safe area layout shift" --stack react -n 8
```

No `--persist` command was run because that mode can create project-local design-system output, which is outside this spike's allowed scope.

## Suggestions Produced Under Figma Constraint

Useful review suggestions:

- Enforce minimum 44x44 touch targets for mobile controls.
- Add spacing between adjacent touch targets.
- Ensure fixed bottom navigation and CTAs never cover scrollable content.
- Account for `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)`.
- Prefer semantic HTML, especially `button` for actions and `nav` for navigation.
- Avoid rendering large lists without virtualization or pagination.
- Use lazy route loading only where it does not introduce first-screen instability.
- Treat dark worker surfaces as a contrast and hierarchy problem, not a decorative glow exercise.

Risky or drifting suggestions:

- The design-system trial selected a generic app-store landing pattern, which is not suitable for XLB100 route shells.
- The same trial selected an overall dark/OLED direction, which conflicts with the customer cream and brown-gold Figma direction.
- Generated dark style ideas can over-index on glow, cyber, or cinematic patterns. The worker app must stay aligned to the Figma worker blue and grab-hall frames.
- Color search returned some warm cream/brown candidates, but XLB100 already has Figma-derived tokens. These search results are references only and must not replace `#B85F2A`, `#FFFAF0`, `#2B2118`, `#08172B`, or `#191225`.

## Deviation Check

| Constraint | Result |
| --- | --- |
| Figma 390px mobile draft | Helpful only for review checks; design generation can drift from the 390px frame source. |
| Customer cream/brown-gold style | Color search can provide adjacent references, but generated design-system output drifted. Figma tokens remain authoritative. |
| Worker dark grab hall | Style search is partly useful for contrast/state review, but glow-heavy output must be constrained by worker Figma frames. |
| Admin design-source missing fact | The skill cannot resolve missing Admin Settlement/Governance frames. These routes remain `DESIGN_SOURCE_MISSING` for high-fidelity claims. |
| `packages/ui` component deposition principle | Useful for checklist-driven component review, but must not create one-off app-only styling or new runtime dependencies. |

## Adoptability

Conclusion: **Adopt with constraints**.

Allowed use in Phase 15.3D repair:

- Anti-slop checklist after Figma MCP screenshot comparison.
- Mobile safe-area, fixed-nav, touch-target, loading/empty/error, and accessibility review.
- React semantic markup and layout-shift review.
- Supplemental color/style sanity checks only after Figma tokens are locked.

Forbidden use:

- Replacing Figma MCP or local Figma PNG exports.
- Generating a new XLB100 design system from scratch.
- Running `--persist` inside the repository.
- Modifying `apps/**`, `packages/**`, backend, db, deploy, or infra through the skill.
- Introducing npm/pnpm runtime dependencies.
- Claiming high fidelity without frame-to-browser screenshot comparison.

Recommended workflow placement:

1. Figma MCP frame export.
2. Route-to-frame mapping.
3. Browser screenshot capture.
4. Pixel gap matrix.
5. UI UX Pro Max checklist review for touch, safe area, accessibility, and layout stability.
6. Manual code repair under existing `packages/ui` and Figma token constraints.
7. Build/typecheck/test and screenshot re-check.

## Keep / Remove

Recommendation: keep the user-level installation as a constrained reviewer.

Do not commit the installed skill files because they live under `C:\Users\kong\.codex\skills\ui-ux-pro-max`, not the repository.

Rollback command:

```powershell
Remove-Item -Recurse -Force C:\Users\kong\.codex\skills\ui-ux-pro-max
```

## Final Guardrails

- Figma MCP and `docs/design/figma/**` remain the source of truth.
- `08e8355` remains classified as rough polish, not high-fidelity completion.
- Admin Settlement/Governance remain blocked from high-fidelity claims until a Figma source exists.
- Production remains NO-GO.
