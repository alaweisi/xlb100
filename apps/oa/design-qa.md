# OA Design QA

## Evidence

- Visual source: `G:\Agents\codex\generated_images\019f9882-85d5-76c1-9824-7fe6964c18cf\call_G76TlqLfxmVP7liZlm5C4z5F.png`
- Workbench: `G:\xlb100\apps\oa\artifacts\01-oa-workbench-1440x1024.png`
- Organization administration: `G:\xlb100\apps\oa\artifacts\02-oa-organization-1440x1024.png`
- Admin capabilities: `G:\xlb100\apps\oa\artifacts\03-oa-capabilities-1440x1024.png`
- OA-to-Admin handoff: `G:\xlb100\apps\oa\artifacts\04-oa-admin-handoff-1440x1024.png`
- Source/implementation comparison: `G:\xlb100\apps\oa\artifacts\oa-workbench-reference-comparison.png`
- CSS viewport: `1440 × 1024`; device scale factor: `1`.
- Browser run: Chromium, real local OA OTP/session/database flow, `2/2` scenarios passed.

## Comparison result

The implementation preserves the source's dark command navigation, scoped top bar,
work queue, selected-item detail and live branch activity rail. It intentionally
uses the approved task/approval contracts instead of reproducing source-only
workflow stages, attachments or actions that have no repository fact source.
Information density is lower than the source, but the primary hierarchy and
three-pane operating model remain aligned at the required viewport.

Organization administration follows the same surface, border, purple action and
status language. It exposes real organization, role, member and delegation data,
including version and audit-sensitive controls. The capability grid is deliberately
lighter: its job is secure navigation into the existing Admin domain, not a second
copy of Admin business state.

## Audit steps

1. **Authenticated entry — healthy.** Real local OTP signs in `admin_global`;
   the workbench and authorized city scopes load without browser errors.
2. **Workbench triage — healthy.** Queue selection, detail, action reason and
   branch activity are visible without horizontal overflow.
3. **Organization and authorization — healthy.** Summary, organization selector,
   branch creation, roles, members and delegation ledger render from server data.
4. **Domain capability handoff — healthy.** A 60-second single-use ticket opens
   Admin on the selected city, hydrates effective permissions and renders the
   allowed Platform Operations page.
5. **Responsive boundary — healthy at acceptance viewport.** Every retained
   screenshot is exactly `1440 × 1024`; document width does not exceed the viewport.
6. **Dashboard companion check — healthy.** The same run confirms the realtime
   wallboard remains readable and privacy-labelled at `1440 × 1024`.

## Findings and fixes

- Fixed missing OA design-token variables that removed borders/backgrounds from
  the organization-management cards.
- Prevented Admin from briefly presenting a false permission-denied state while
  an OA delegated session was still hydrating.
- Prevented React Strict Mode from exchanging the same single-use handoff ticket
  twice.
- Made the Admin content grid start-aligned so guardrails and domain cards retain
  their intended intrinsic height.
- No unresolved P0, P1 or P2 visual findings remain.

## Accessibility evidence boundary

The browser flow validates labelled login controls, semantic headings, button/link
roles, focusable native form controls and visible status messages. Screenshot
inspection confirms readable contrast and no clipping at the acceptance viewport.
This is not a full assistive-technology or manual screen-reader certification.

## Final result

`passed`
