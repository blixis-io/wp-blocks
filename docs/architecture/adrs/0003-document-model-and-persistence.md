# ADR 0003: Document model and persistence

- Status: Accepted (storage clause conditional on the BWB-040 spike, tracked in #40)
- Date: 2026-10-14
- Issues: #7 (BWB-007), #19, #20, #40, #104
- Deciders: owner, orchestrator
- Reviewers: Codex (see Review log)

## Context
`PRD-ADDENDUM` and `SCHEMAS-AND-APIS.md` sketch two incompatible document shapes (`PageDocument`: single root, translations map, mode styles; `BuilderDocument`: root array, flat breakpoint styles, no locale/mode). The first Codex review (`docs/coordination/reviews/BWB-007-codex-response.md`) confirmed the conflict and proposed a merged contract. Owner decisions of 2026-10-14 fix the publication model (ADR 0004), the style model (ADR 0005) and the Free tier scope (ADR 0007).

## Decision
### 1. One authoring document, separated concerns
The persisted unit is a **document envelope** with four independently versioned concerns, matching the owner's separation of structure, locale content, appearance styling and published revisions:

```ts
type LocaleId = string;      // WordPress locale id, e.g. "en_US", "nl_NL"
type ElementId = string;     // immutable, generated, unique per document
type PropertyId = string;    // registered property key, e.g. "text", "href", "alt"
type BreakpointId = string;  // registered; "base" is implicit
type Mode = "light" | "dark";
type State = "hover" | "focus" | "focus-visible" | "active";

interface ElementNode {
  id: ElementId;
  type: string;                      // namespaced: "blixis/heading"
  props: Record<PropertyId, unknown>;// INVARIANT values only (layout stream); translatable values live in translations[locale]
  classIds?: string[];               // global class ids; order is presentational, precedence comes from the class list (ADR 0005)
  style?: StyleRule[];               // sparse, see ADR 0005
  children: ElementNode[];
}

interface StyleRule {
  breakpoint?: BreakpointId;         // absent = base
  mode?: Mode;                       // absent = both modes
  state?: State;                     // absent = normal
  declarations: Record<string, string | number>; // allow-listed at validation time
}

interface TranslationEntry {
  values: Record<PropertyId, unknown>;
  sourceHash?: string;               // non-default locales: hash of the default-locale values this was made from
  status: "missing" | "draft" | "translated" | "reviewed" | "stale" | "orphaned"; // orphaned: element no longer in layout; kept, hidden, restorable
}

interface BuilderDocument {
  schemaVersion: number;
  documentId: string;                // stable, = post identity
  layoutRevision: number;            // working layout revision, bumps on structure/style change (ADR 0004)
  defaultLocale: LocaleId;
  locales: LocaleId[];
  root: ElementNode[];               // ordered top-level siblings; a virtual page root is added at render time
  classListVersion: number;           // site-wide class list version last synced
  classRefs: Record<string, number>;  // global class id -> classVersion this working layout was last synced with
  translations: Record<LocaleId, Record<ElementId, TranslationEntry>>; // includes defaultLocale
  metadata: { updatedAt: string; editorVersion: string };
}
```

- **Translations live outside the tree**, keyed by stable element and property IDs, never by source text. Only properties the registry marks `translatable` may appear; `invariant` (ids, type, structure, raw CSS) and `locale-specific` are classified by the element registry (FR-051).
- **The default locale is a normal locale stream.** Its translatable values are stored in `translations[defaultLocale]`, not in `props`, so publishing the default locale never publishes pending layout (resolves a contradiction found in review). New elements write their initial translatable defaults (from the element registry) into the *editing* locale stream; the "Publish" shortcut in ADR 0004 §7 covers layout plus current locale. Other locales' `sourceHash` is computed from the default-locale entry for the same element/property.
- **Global classes** are site-wide, stored in a versioned option (`blixis_global_classes`, ordered list; list order = precedence, ADR 0005). They are *not* in the document. A LayoutSnapshot copies the class definitions it references **by value**, so pinned layouts and rollbacks reproduce exactly; editing a global class bumps that class's `classVersion` (reordering or deleting classes bumps the list-level `classListVersion`, because list order is precedence), which marks every layout referencing it as having pending changes (ADR 0004 §3) and changes working previews immediately; published pages change only at their next layout publish (a bulk "republish pages using this class" action is a later feature). Design tokens, by contrast, are live site-wide appearance (ADR 0004 §1).
- **Rich text** is a structured, validated node list (not HTML strings) with its own nested stable ids; designed in BWB-104.
- **`auto` appearance** is a site/viewer preference resolved before CSS selection; it is not a stored style mode.
- Unknown element types, unknown properties and unknown top-level fields round-trip unchanged (`CODE-STANDARDS.md`); validation reports rather than drops them.
- The older shapes in `PRD-ADDENDUM` §3 and `SCHEMAS-AND-APIS.md` are **superseded** by this ADR; those documents now link here.

### 2. Validation and limits
Canonical contract in TypeScript with Zod/JSON Schema generated into committed JSON Schema; the PHP plugin validates against the same JSON Schema fixtures (`BWB-027`). Hard caps (initial, to be profiled): depth 32, nodes 5 000, envelope 2 MB, declarations per rule 64. Duplicate ids, cycles, illegal parents, unsafe CSS values are rejected server-side. Schema migrations are append-only with N-2 golden fixtures.

### 3. Persistence
- **Post meta first, one row per stream** so independent streams cannot overwrite each other: `_blixis_layout` (working layout), `_blixis_content_<locale>` (working content per locale), `_blixis_published` (pointers: `publishedLayoutRevision`, per-locale `{contentSnapshot, baseLayout}`), and immutable snapshot rows `_blixis_snap_layout_<n>`, `_blixis_snap_content_<locale>_<n>`. All are non-public, `show_in_rest=false`, accessed only through the plugin repository and `blixis/v1` REST (`edit_post` + nonce).
- **Write contract.** Each stream write is a compare-and-swap on that row (conditional `UPDATE … WHERE meta_value = <expected>` or equivalent serialised lock) using the stream's revision; mismatch → 409 with both revisions. Writes to different streams (English vs Dutch) never touch the same row. Publication order is: (1) write the immutable snapshot row(s); (2) advance the pointer row in one atomic update; (3) only then bump visible state. A crash after (1) leaves an unreferenced snapshot that garbage collection removes; the live page never changes until (2).
- **No custom table in P0/P1.** Revisit if measured payload, revision growth or write contention warrants it. If adopted, the table becomes the single writable source (no dual writable copies).
- **WordPress revisions/autosave.** Whether registered meta is restored by core revisions on WP 7.0 is unverified; the BWB-040 spike must prove (a) revision/autosave behaviour, (b) the CAS write contract, (c) interrupted-publish recovery. If core cannot restore meta reliably, the plugin keeps its own bounded revision ring (ADR 0004 §5) and does not rely on core behaviour. Post meta is accepted only if the spike passes.
- Design tokens: one versioned option (`blixis_design_system`) plus a short history for undo; global classes: `blixis_global_classes`.

## Alternatives considered
- *Single tree with inline per-locale props:* rejected; couples publication of locales to layout and bloats nodes.
- *One document per locale:* rejected; structure drifts, violates "same IDs across locales".
- *Custom table now:* rejected; premature, adds migration and multisite cost.
- *Gutenberg blocks as storage:* rejected; conflicts with element registry and parity goals.

## Consequences
- The registry becomes security-critical (it decides what may be translated and rendered).
- Large documents raise meta/revision payloads; caps and profiling are required.
- Migration from older sketches is trivially "none" (nothing implemented).

## Test strategy
Golden fixtures (valid/invalid/N-2), property-based tree tests (no cycles/duplicates after any command), round-trip with unknown data, TS/PHP validation parity, revision/autosave integration tests on supported WP versions, 409 conflict test with two tabs, size/depth cap tests, hostile translation payload tests.

## Rollback
`schemaVersion` plus append-only migrations; the previous envelope is retained in the revision ring until the next successful publish, so a failed migration can be reverted without data loss.

## Open questions
- Exact meta key names and caps (profile in BWB-040).
- Core revisions behaviour for registered meta on 7.0 (spike).
- Bulk "republish pages using this class" UX and permission model.

## Review log
- 2026-10-14 orchestrator draft, incorporating Codex proposal (BWB-007 response).
- 2026-10-14 Codex review (P0 ADR review): Blocker 3 (default-locale contradiction) accepted — default locale is a stream; Major 5 (atomic storage) accepted — per-stream rows, CAS, snapshot-then-pointer; Major 6 (global classes) accepted — site-wide option, by-value snapshot copy; `orphaned` status added. Post meta remains conditional on the BWB-040 spike.
- 2026-10-14 Codex re-review (`docs/coordination/reviews/P0-ADR-REREVIEW-codex-response.md`): 10 of 12 earlier findings resolved, 2 partly (post-meta atomicity stays conditional on the BWB-040 spike; PHP floor increase handled via `Requires PHP`). New findings applied here: source-comparison target and retention (blocker), global-class pending detection via `classVersion`/`classRefs`, combined-publish preflight with single atomic pointer advance, determinism inputs named.
- 2026-10-14 Codex final check (`docs/coordination/reviews/P0-ADR-FINAL-codex-response.md`): 4 earlier defects resolved; 3 further majors applied (classRefs refresh on publish, `classListVersion` for reorder/delete, default-locale revision in cache key). Not re-reviewed after this edit; the BWB-040 spike must test pending detection.
