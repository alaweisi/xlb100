# Phase 15.3D-SKILL-SPIKE-2 - HyperFrames Evaluation

## Scope

This spike evaluates the locally installed HyperFrames skill as an auxiliary tool for Phase 15.3D Figma Pixel Alignment Repair.

This is not a UI implementation phase. It does not authorize HyperFrames to modify `apps/**`, `packages/**`, backend, db, deploy, infra, production configuration, or tags.

## Precheck

- Starting HEAD: `7f3d444df3abc7232f81509fa02c4d59c4eab606`
- Branch: `main`
- Initial `git status --short`: clean
- Production: NO-GO
- Deploy: not performed
- Tag: not created

## Installed Skill

HyperFrames was installed in the Codex user skill directory before this evaluation.

Install command:

```powershell
python C:\Users\kong\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py --repo heygen-com/hyperframes --path skills/hyperframes
```

Installed path:

```text
C:\Users\kong\.codex\skills\hyperframes
```

Installed files:

```text
C:\Users\kong\.codex\skills\hyperframes\SKILL.md
```

Repository impact:

- No app files changed.
- No `packages/**` files changed.
- No backend/db/deploy/infra files changed.
- No `package.json` or lockfile changed.
- No production files changed.
- No `.gitignore` change required.

## Runtime Readiness

HyperFrames is primarily a video and animation authoring system. The installed entry skill states that HyperFrames renders video from HTML compositions, with seekable animation runtime and media ownership.

Local runtime checks:

```text
node -v   => v24.14.0
npm -v    => 11.9.0
ffmpeg    => 8.1.1
```

This machine has the basic Node/FFmpeg prerequisites for future HyperFrames rendering experiments.

However, this evaluation did not run `npx hyperframes init`, `npx hyperframes render`, or any command that would scaffold a project or write runtime assets into this repository.

## Skill Capabilities Observed

The installed `hyperframes` skill is an entry router for video/animation workflows. It references these domain skills:

- `/hyperframes-core`
- `/hyperframes-animation`
- `/hyperframes-keyframes`
- `/hyperframes-creative`
- `/hyperframes-media`
- `/media-use`
- `/hyperframes-cli`
- `/hyperframes-registry`
- `/figma`
- `/product-launch-video`
- `/website-to-video`
- `/faceless-explainer`
- `/pr-to-video`
- `/embedded-captions`
- `/talking-head-recut`
- `/motion-graphics`
- `/music-to-video`
- `/slideshow`
- `/general-video`
- `/remotion-to-hyperframes`

Only the entry `hyperframes` skill is installed locally. The domain skills above are not currently present under `C:\Users\kong\.codex\skills`.

## Fit For Phase 15.3D Pixel Repair

Phase 15.3D requires:

1. Figma MCP frame export.
2. Route to Figma frame mapping.
3. Browser screenshot capture.
4. Pixel gap matrix.
5. Targeted CSS/layout/component repair.
6. Build/typecheck/test.
7. Staging deployment only when explicitly requested.

HyperFrames does not directly solve the central problem above. Its core purpose is HTML-to-video composition, motion graphics, product videos, website tours, captions, and animated decks.

It can be useful later for:

- Product launch videos.
- UAT demo videos.
- Animated release notes.
- Website route tour videos.
- Motion graphics for marketing.
- PR/change explainer videos.

It is not a substitute for:

- Figma MCP.
- Local Figma PNG exports.
- Browser screenshots.
- Pixel comparison against Figma.
- `packages/ui` route shell repair.
- Manual visual QA of customer/worker/admin pages.

## Figma Constraint Check

| Constraint | HyperFrames Result |
| --- | --- |
| Figma 390px mobile draft | No direct pixel alignment feature observed in the entry skill. |
| C端奶油/棕金风格 | Not addressed by entry skill; would require separate creative/video workflow and must not override Figma tokens. |
| W端深色接单大厅 | Not addressed by entry skill for static UI repair. Could be useful for a future animated demo only. |
| Admin design source missing | Cannot resolve missing Settlement/Governance Figma frames. |
| `packages/ui` component deposition | Not relevant to UI component implementation; should not write app/package code. |
| Browser route screenshot comparison | Not provided by installed entry skill. |

## Risk Assessment

Risks if used incorrectly:

- It may redirect the team toward video or animation deliverables while the current blocker is static UI fidelity.
- Running `npx hyperframes init` may scaffold project files if executed inside the repo.
- Installing all domain skills may add many user-level skills that are unrelated to Phase 15.3D.
- Figma import language in the entry skill can be misread as "use HyperFrames instead of Figma MCP"; this is not acceptable for XLB100.
- Motion/marketing polish could mask the unresolved fact that `08e8355` is only rough polish and not Figma high fidelity.

## Recommendation

Conclusion for Phase 15.3D Figma Pixel Alignment Repair: **Reject as a pixel repair tool**.

Conclusion for future non-blocking media work: **Keep installed for later video/demo experiments**.

Recommended use:

- Do not use HyperFrames in Phase 15.3E UI pixel repair implementation.
- Keep it out of the customer/worker/admin UI build path.
- Consider it only after UI fidelity is repaired, for staging/UAT demo videos or product walkthrough clips.

## Allowed Future Workflow

If HyperFrames is used later, use a separate media phase with explicit approval:

1. Confirm the deliverable is a video, animation, slideshow, or demo clip.
2. Confirm whether additional HyperFrames domain skills must be installed.
3. Use an isolated output directory outside app source.
4. Do not alter business UI implementation.
5. Do not modify production.
6. Do not claim UI high fidelity from a video output.

## Rollback

Remove the local user-level installation with:

```powershell
Remove-Item -Recurse -Force C:\Users\kong\.codex\skills\hyperframes
```

## Final Guardrails

- Figma MCP and `docs/design/figma/**` remain the visual source of truth.
- Phase 15.3E should proceed with Figma frame to browser screenshot repair, not HyperFrames.
- Production remains NO-GO.
- Deploy remains not performed.
- Tags remain not created.
