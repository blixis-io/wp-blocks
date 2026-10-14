# Accessibility and Performance Baseline (P0)

Status: Draft for review · Issue: #10 (BWB-010) · Standards: WCAG 2.2 Level AA (PRD NFR-003), ARIA Authoring Practices for composite widgets.

## 1. Scope
- **Editor** (application chrome): tree, inspector, canvas controls, dialogs, wizard, toolbars.
- **Generated site output**: semantic HTML and default theme UI in both appearance modes and all content locales.
- **Documentation site** (P10).
Editor chrome appearance (light/dark) and website appearance are tested independently; each is tested in both modes.

## 2. Requirements
1. **Keyboard**: every function reachable and operable by keyboard; visible focus (WCAG 2.4.7, and 2.4.11 Focus Not Obscured (Minimum), AA; 2.4.13 Focus Appearance is AAA and is an optional higher target); no keyboard traps; documented shortcuts that never shadow text entry.
2. **Drag and drop** has two separate alternatives, each tested on its own: (a) keyboard reorder (WCAG 2.1.1) and (b) a single-pointer, non-dragging way to move an element, e.g. click/tap menu "Move up / down / into…" (WCAG 2.5.7 Dragging Movements, AA) (BWB-064).
3. **Targets** at least 24×24 CSS px or spaced (WCAG 2.5.8).
4. **Structure tree** uses correct tree semantics, announces level/position/expanded state; focus preserved after reorder.
5. **Forms/inspector**: programmatic labels, units, error text associated with fields, consistent help (WCAG 3.2.6), no redundant entry (3.3.7).
6. **Contrast**: text ≥ 4.5:1, large text and UI components/focus indicators ≥ 3:1 in light and dark; presets validated at definition time (BWB-032); user-chosen colours show a warning, never a silent failure.
7. **Motion**: respect `prefers-reduced-motion`; no auto-playing essential content; animation off by default for new elements.
8. **Language and direction**: correct `lang`/`dir` per locale, per-element `lang` for mixed content where needed, RTL-ready logical CSS (FR-058).
9. **Images**: alt text required or explicit "decorative"; alt text is translatable (FR-056).
10. **Screen reader announcements** for save/publish status, conflicts, validation errors and locale/mode changes via polite live regions.
11. **No JavaScript** on public pages is required for content and readable default light/dark (FR-065).
12. **Zoom/reflow**: usable at 200% zoom and 320 CSS px width for public pages; editor supports 200% zoom.

## 3. Verification
| Layer | Tooling | Gate |
|---|---|---|
| Automated | axe-core via Playwright and React Testing Library on editor screens and fixture pages in {light, dark} × {en, nl, an RTL fixture} | per PR: fail on any finding mapped to a WCAG A/AA criterion unless a reviewed exception record exists; axe severity is used for triage only |
| Contrast | computed-style contrast checks over generated fixtures (`tests/fixtures`) | per PR |
| Manual | keyboard-only pass and screen reader pass (VoiceOver + one of NVDA/JAWS) on release candidate; recorded separately from automated results | release gate (BWB-066, BWB-073) |
| Exceptions | documented with WCAG criterion, impact, workaround and owner issue | reviewed each release |

Automated checks never replace the manual pass; "no known blocking keyboard path" (PRD §10) is the MVP exit criterion.

## 4. Performance baseline (budgets are proposals, to be measured)
No numbers are fixed before measurement. P1/BWB-069 establishes baselines on representative fixtures; until then these are the **rules**:
- Public pages load no editor JavaScript and no React runtime (PRD NFR-001); the Free builder adds no render-blocking JavaScript on public pages.
- Generated CSS is deterministic, cacheable, scoped, and measured per fixture (size recorded in CI, regressions flagged).
- Dark-mode duplication for `auto` is measured; if it exceeds the agreed budget it is optimised before 1.0 (ADR 0005).
- Editor interaction budget: selection, inspector edit and drag feedback should stay within one frame budget on a mid-range device; target values to be agreed after the BWB-049 spike and recorded here.
- Lab targets (e.g. LCP, INP, CLS at p75) are set from measured baselines and enforced in nightly runs (`TESTING.md`).

## 5. Roles
Accessibility and performance issues use labels `accessibility` and `area:*`; accessibility defects found in release candidates block release unless an exception is recorded.
