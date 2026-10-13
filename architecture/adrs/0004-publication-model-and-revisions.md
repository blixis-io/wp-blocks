# ADR 0004: Publication model and revisions

- Status: Accepted (owner decision 2026-10-14); details reviewed by Codex, findings applied
- Date: 2026-10-14
- Issues: #7, #101, #112, #46, #121
- Deciders: owner
- Reviewers: Codex (see Review log)

## Context
Owner decision: locale publishing must not automatically publish pending shared-layout changes. Structure/layout, locale content, appearance styling and published revisions are separate concerns. Publishing Dutch must not publish pending English content or unpublished layout changes. Requirements: explicit publication states and revision references, a stable published shared-layout revision, locale publications referencing a compatible layout revision, warn/block on incompatibility, never silently publish unrelated drafts, independent locale publishing where technically possible, shared structural changes published by an explicit action, rollback preserved. The initial UI may be simplified; the data model may not.

WordPress has one post status per post; locale-specific publication must therefore be modelled by the plugin.

## Decision
### 1. Three revision streams
| Stream | Contents | Counter |
|---|---|---|
| **Layout** | element tree, element ids/types/invariant props, style rules (all modes/breakpoints), global classes | `layoutRevision` (working), `publishedLayoutRevision` |
| **Locale content** | one stream per locale: `TranslationEntry` values and statuses | `contentRevision[locale]` (working), `publishedContentRevision[locale]` |
| **Design tokens** | site-wide, versioned option | `tokenVersion` |

Appearance (light/dark) styling is part of **Layout** (sparse style rules), not a separate stream, because modes share the tree; it publishes only with an explicit layout publish. **The default locale is an ordinary locale stream** (ADR 0003): its text publishes through `publishLocale(defaultLocale)` and never carries pending layout. **Design tokens are live site-wide appearance**: changing a token updates every published page by design (that is their purpose); token changes require preview and confirmation, keep a short history for undo, and bump `tokenVersion` (cache invalidation only). Snapshots therefore do **not** pin tokens. Global classes, in contrast, are copied into each LayoutSnapshot by value (ADR 0003).

### 2. Immutable snapshots
- `publishLayout()` writes an immutable **LayoutSnapshot** `L{n}` (tree, invariant props, style rules, referenced global class definitions by value) and sets `publishedLayoutRevision = n`.
- `publishLocale(locale)` writes an immutable **LocaleSnapshot** `{locale, content revision, baseLayout: L{k}, sourceContentRevision}` containing only that locale's resolved translation entries (`sourceContentRevision` = the default-locale snapshot its `sourceHash` values were compared against). It **never** creates or advances a LayoutSnapshot.
- Publication is two-phase: write immutable snapshot(s), then advance the pointer row atomically (ADR 0003 §3). A failure between phases never changes live output.
- Public rendering for `(post, locale)` = `LayoutSnapshot[ LocaleSnapshot[locale].baseLayout ]` + that LocaleSnapshot. It never reads working data.

### 3. Compatibility rules
A LocaleSnapshot is *compatible* with layout `L{m}` iff every element id it references exists in `L{m}` with the same `type` and the property is still registered translatable. Staleness is a separate check: for non-default locales each entry's `sourceHash` is compared with the hash of the **default-locale snapshot named by the LocaleSnapshot's `sourceContentRevision`** (at publish time: the currently published default-locale snapshot; in the editor: the working default-locale stream, which is what marks entries `stale`). Stale entries may be published only with explicit confirmation. Rendering a non-default locale uses its own snapshot for translated values and the *currently published* default-locale snapshot for fallback text; `sourceContentRevision` snapshots are retained while referenced (§5).
- `publishLocale(locale)` chooses `baseLayout` = current `publishedLayoutRevision`. If working translations reference elements missing from, or incompatible with, that layout, publish is **blocked** for those entries with a list (or the author may publish with those entries excluded and falling back per fallback policy; never silently).
- **Pending-change detection.** Layout is `published-with-pending-changes` if `layoutRevision` ≠ `publishedLayoutRevision`, or if any global class referenced by the working layout has a newer `classVersion` than the version recorded in the working layout's `classRefs` (class edits mark every referencing layout pending without touching their rows). The site-wide class list also carries a `classListVersion` that bumps on **reorder or deletion** (which change precedence); a layout whose recorded `classListVersion` is older is pending too. `publishLayout()` writes the then-current `classRefs` and `classListVersion` into the new working layout row (same CAS as the layout write), so the layout is no longer pending after a successful publish.
- `publishLayout()` computes, for each published locale, whether its LocaleSnapshot stays compatible with the new layout. If not, the action shows impacted locales and requires explicit confirmation; incompatible locales keep rendering their previous layout snapshot `L{k}` until republished (rendering a pinned older layout is allowed; layout snapshots are retained while referenced). Elements added in the new layout have no translation yet and use fallback.
- Deleting an element in a layout publish never deletes translations; entries become `orphaned` (kept, hidden, restorable).

### 4. States
Per locale: `unpublished | published | published-with-pending-changes`. Layout: `unpublished | published | published-with-pending-changes`. The editor must always display which of these a user's action will publish. Autosaves write working data only and carry `{author, locale}`; they never publish.

### 5. Rollback
History is append-only: rolling back republishes an old snapshot under a new revision number. **A locale rollback restores the pair `(baseLayout, LocaleSnapshot)` atomically**, so the locale returns to exactly the layout it was published against; it does not silently adopt the current layout. A **layout rollback** shows the same impact report as a layout publish and re-checks every published locale's compatibility. Retention: every layout snapshot and locale snapshot referenced by any published pointer, or by a rollback pair within the retention window, is kept; plus a bounded ring (default 20 per stream). Pruning never removes a referenced snapshot (including default-locale snapshots named by `sourceContentRevision`) and is itself covered by tests.

### 6. Concurrency
All writes carry the expected working revision for the stream they touch; mismatch returns 409 with both revisions. Locale streams do not conflict with each other; layout writes conflict with layout writes.

### 7. Initial UI simplification (allowed)
Free 1.0 may expose one "Publish" button that publishes pending layout plus the *current* locale — only after displaying exactly what will go live, and never touching other locales' content. It runs a **combined preflight** (compatibility, staleness, CAS expectations for both streams) and then advances the single `_blixis_published` pointer row once, containing both new pointers; if preflight or the atomic update fails, nothing changes live. Partial success is not possible for the shortcut. The API and storage must already be separate.

## Alternatives considered
- *Single publish for everything:* violates owner decision.
- *Per-locale copy of the tree:* ids drift, doubles storage; rejected (ADR 0003).
- *Always render newest layout with older translations:* silently changes live pages; rejected.

## Consequences
- More storage (snapshots) and more states to test; mitigated by retention rules.
- Rendering needs a pinned-layout lookup; cache keys include `(post, locale, layoutRev, localeRev, publishedDefaultLocaleRev (non-default locales), tokenVersion)`.
- Core WordPress "Update/Publish" semantics only gate the post as a whole (e.g. draft vs published); per-locale visibility is plugin-controlled and must be enforced in the renderer and REST preview.

## Test strategy
- Publish Dutch with pending English edits → English live output unchanged (byte-compare).
- Publish Dutch with unpublished layout change → Dutch live output uses published layout.
- Layout publish removing an element used by a Dutch entry → impact report, entry orphaned, Dutch pinned until republish.
- Stale detection after source edit (BWB-105); rollback of each snapshot kind; 409 behaviour; autosave never publishes; incompatible publish blocked with listing; no mixed-locale cache poisoning.

## Rollback
This ADR can be amended only by superseding ADR; data written under it is append-only and forward-migratable.

## Open questions
- Interaction with WordPress post status (draft/private/scheduled) per locale.

## Review log
- 2026-10-14 orchestrator draft from owner decision.
- 2026-10-14 Codex review: Blocker 3 accepted (default locale is a stream); Major 4 accepted (rollback restores the pair atomically, pruning retains referenced snapshots); Major 5 accepted (two-phase publish, atomic pointer); Major 9 accepted by choosing "tokens deliberately update all published pages" and removing the token pin. Owner decision itself unchanged.
- 2026-10-14 Codex re-review (`coordination/reviews/P0-ADR-REREVIEW-codex-response.md`): 10 of 12 earlier findings resolved, 2 partly (post-meta atomicity stays conditional on the BWB-040 spike; PHP floor increase handled via `Requires PHP`). New findings applied here: source-comparison target and retention (blocker), global-class pending detection via `classVersion`/`classRefs`, combined-publish preflight with single atomic pointer advance, determinism inputs named.
- 2026-10-14 Codex final check (`coordination/reviews/P0-ADR-FINAL-codex-response.md`): 4 earlier defects resolved; 3 further majors applied (classRefs refresh on publish, `classListVersion` for reorder/delete, default-locale revision in cache key). Not re-reviewed after this edit; the BWB-040 spike must test pending detection.
