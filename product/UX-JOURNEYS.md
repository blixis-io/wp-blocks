# Product UX Journeys and Prototype Acceptance (draft)

Status: **Draft, awaiting owner approval** · Issue: #9 (BWB-009) · Sources: `PRD.md` §6, `PRD-ADDENDUM-MULTILINGUAL-THEMES.md` §4, ADR 0004–0006, `engineering/ACCESSIBILITY-BASELINE.md`.
This document defines *behaviour and acceptance*, not visual design. Screens are described by purpose; a clickable prototype is a later deliverable (P5) and must satisfy the acceptance checks below.

Personas: **Agency developer (D)**, **Designer/site creator (C)**, **Site owner (O)**, **Translator (T)** (uses Free manual translation).
Global rules for every journey: keyboard-complete; editor language, editor appearance, content language and website appearance are four separate controls and none resets another; every irreversible or publishing action shows exactly what will go live.

## J1. First install and setup (O, C)
1. Activate theme → dismissible notice "Set up your design" (no forced redirect).
2. Wizard (resumable): choose preset or custom → colours (light and dark previews) → typography via WordPress Font Library → spacing/radius → site languages (default + others) → preview → apply.
3. Settings persist atomically; reactivation never overwrites them; Design System reopens later.
**Acceptance:** completes without code; abandoning mid-way and returning resumes; a user without `edit_theme_options` cannot reach it; contrast warnings appear for failing colour pairs; no settings change on reactivation (E2E scenario 1).

## J2. Create and edit a page (C, D)
Open the builder from a page → insert Section/Container/Heading/Text/Image/Button → select via tree or canvas → edit in inspector → switch desktop/tablet/mobile → undo/redo → autosave → Publish → view frontend.
**Acceptance:** each step possible by keyboard; the inspector shows inherited vs overridden values per breakpoint; undo/redo is granular and survives autosave; publish result matches preview (parity fixtures); two-tab conflict offers recovery of the user's draft (E2E 2, 3, 4).

## J3. Translate content manually (T, C)
Switch content language (e.g. EN→NL) → source text shown read-only beside the editable field → status chip (missing/draft/translated/reviewed/stale) → save → publish the locale.
**Acceptance:** editing Dutch never changes English; editing English marks Dutch `stale` without overwriting; missing fields show the fallback with a visible warning; publishing Dutch does not publish pending English or pending layout changes (ADR 0004); if the Translator role is in Free 1.0 (open question 1), a translator-only capability cannot change layout or other locales; until decided, the test uses users who can edit the post.

## J4. Website light/dark styling (C)
Choose website appearance (light/dark/auto) as default → edit global light/dark tokens → on an element toggle "editing: Light | Dark" → override a property in dark only (override indicator) → reset override → compare light and dark side by side.
**Acceptance:** same element IDs in both modes; override provenance visible (base/breakpoint/mode/mode+breakpoint); resolved values equal the ADR 0005 fixtures; changing editor chrome appearance does not change the preview; switching language never changes mode (FR-067).

## J5. Publish and roll back (O, D)
The user picks one named action — *Publish layout*, *Publish locale <X>*, or the combined shortcut *Publish layout + current locale* — and the panel lists exactly which revisions it will advance (layout revision, that locale's content revision), plus classes changed, stale translations and incompatible entries → confirm → live. No action advances more than one locale. Token (site-wide appearance) edits are a separate *Apply to site* confirmation because they go live without a layout publish (ADR 0004 §1). History lists snapshots → restore a locale pair or a layout (with impact report).
**Acceptance:** nothing goes live that the panel did not list; every other locale's live output is byte-identical before and after; a failed publish changes nothing live; rollback of a locale restores its layout reference with it (ADR 0004 §5).

## J6. Theme switch and add-on removal (O)
Switch to a non-Blixis theme → editor disabled with explanation, content still renders with the plugin fallback, JSON intact → switch back → editing resumes. Deactivate or let expire Plus/Pro → premium elements show generic fallback, no data loss, editing of Free content unaffected.
**Acceptance:** no blank page or fatal at any step; documents byte-identical before and after (E2E 5, 8).

## J7. Developer extends the builder (D)
Register a custom element with schema, defaults, controls and PHP renderer; validation rejects bad props; element appears in library.
**Acceptance:** documented example runs against a seeded WordPress fixture; unsafe props are rejected server-side (docs P10 will reuse it).

## Prototype acceptance (for BWB-049/050 onwards)
A prototype is accepted when J1–J6 can be walked end-to-end on seeded fixtures with the listed acceptance checks passing, J2–J5 keyboard-only, and the accessibility baseline automated checks green in both website modes and two content locales (EN, NL) plus one RTL fixture.

## Open questions for the owner
1. Is a dedicated **Translator** role in Free 1.0, or is manual translation limited to users who can edit the post?
2. Should the first release expose the single combined "Publish" shortcut (ADR 0004 §7) or the separate publish actions?
3. Preferred default for new sites: website appearance `auto` or `light`?
