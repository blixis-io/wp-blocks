# BWB-007 — read-only architecture review

**Recommendation:** adopt one versioned authoring document with a shared element tree, locale overlays keyed by stable element and property IDs, and sparse style rules whose mode, breakpoint, and pseudo-state dimensions are explicit. Use **registered post meta as the initial primary store**, with WordPress revisions and autosaves subject to a compatibility spike. Do not add a custom table in P0. Record locale publication as an explicit snapshot operation so editing Dutch cannot publish changes to English or to shared layout by accident.

This is a proposal for owner review, not an approved ADR. BWB-007 asks for post meta, revisions, concurrency, and theme-switch fallback; BWB-101 owns locale storage and routing, and BWB-102 owns cascade precedence. [BWB-007 catalog](</roadmap/issues.csv:8>), [addendum catalog](</roadmap/issues-addendum.csv:2>).

## Findings against the handoff

1. **Two shapes: confirmed.** The addendum has a single `root`, translations, and mode styles; the API proposal has `root: ElementNode[]`, document metadata, and breakpoint-only styles. Both call their examples illustrative. Preserve the useful parts of each rather than treating either as canonical. [Addendum](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:50>), [API proposal](</architecture/SCHEMAS-AND-APIS.md:3>).
2. **ADR path: confirmed.** `architecture/SYSTEM.md` says `architecture/adrs/`; the promptbook says `architecture/adr/`. Neither directory exists in this copy. Pick **`architecture/adrs/`** and correct the promptbook when documentation edits are authorized. [System](</architecture/SYSTEM.md:87>), [promptbook](</agent/CODEX-CLAUDE-PROMPTBOOK.md:35>).
3. **Font Library / WP 7.0: unresolved.** The blueprint asserts global availability in WP 7.0 and calls the baseline provisional; it also instructs maintainers to confirm the release and host compatibility. I found no official WordPress source stored in this directory. The handoff prohibits external network calls, so I could **not independently verify the version claim**. BWB-004 should verify it from official WordPress documentation and API behavior before it sets a version floor. [System](</architecture/SYSTEM.md:75>), [WordPress specification](</architecture/WORDPRESS.md:3>), [README](</README.md:37>).
4. **Cascade ADR: confirmed.** FR-072 expressly says its order is illustrative, and P0 requires cascade fixtures before implementation. [Addendum](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:41>), [phasing](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:103>).
5. **Tier allocation: confirmed.** The feature matrix lists existing capabilities but has no translation or website mode row. FR-073 requires a written allocation before shipping and offers Free manual translation plus light/dark as a recommendation, not a decision. [Feature matrix](</product/FEATURE-MATRIX.md:5>), [FR-073](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:46>).

## Proposed canonical contract

```ts
type LocaleId = string;       // validated site locale, e.g. en_US
type ElementId = string;
type PropertyId = string;     // registered stable property path/ID
type BreakpointId = string;   // registered breakpoint; "base" is implicit
type Mode = "light" | "dark";
type State = "normal" | "hover" | "focus" | "focus-visible" | "active";

type SafeValue = unknown;     // narrowed by the element/property registry
type Declarations = Record<string, string | number>; // allowlisted server-side

interface StyleRule {
  mode?: Mode;
  breakpoint?: BreakpointId;
  state?: State;
  declarations: Declarations;
}

interface ElementNode {
  id: ElementId;
  type: string;
  props: Record<PropertyId, SafeValue>; // invariant + source-locale values
  classIds?: string[];
  styleRules?: StyleRule[];
  children: ElementNode[];
}

interface TranslationEntry {
  values: Record<PropertyId, SafeValue>;
  sourceHash: string;         // hash of relevant source fields
  status: "missing" | "draft" | "translated" | "reviewed" | "stale";
}

interface BuilderDocument {
  schemaVersion: number;
  documentId: string;
  revision: number;           // optimistic whole-document version
  defaultLocale: LocaleId;
  locales: LocaleId[];
  root: ElementNode[];        // ordered top-level siblings
  translations: Record<LocaleId, Record<ElementId, TranslationEntry>>;
  globalStyleRules: StyleRule[];
  metadata: { updatedAt: string; editorVersion: string };
}
```

Use a **virtual page root** during rendering; keep `root[]` on disk so a page can contain ordered sibling sections without an artificial, user-editable wrapper. Translation entries live outside the tree. The registry classifies each property as invariant, translatable, or locale-specific; only registered textual values enter translation overlays. A structured rich-text value needs stable nested IDs and its own validation, rather than translated HTML blobs. This follows the shared-tree and stable-ID requirements while incorporating the document ID and revision from the API proposal. [FR-050–053](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:17>), [data-model warning](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:80>), [API proposal](</architecture/SCHEMAS-AND-APIS.md:5>).

`auto` belongs to **site preference resolution**, not to stored element style rules: it resolves to light or dark before CSS is selected. Editor chrome preference and editor interface locale remain separate from website appearance and content locale. [Definitions](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:9>), [FR-060–067](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:30>).

Migration rules: singleton `root` becomes a one-item array; legacy breakpoint maps become `StyleRule`s; absent locale metadata takes the configured source locale; absent mode means both modes. Preserve unknown element data for round-trip and safe fallback, but never execute unknown CSS or translation payloads. [Schema requirements](</architecture/SCHEMAS-AND-APIS.md:25>), [FR-070](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:43>), [renderer fallback](</architecture/SYSTEM.md:67>).

## Persistence and publication

**Post meta first.** Store a validated, versioned envelope on the WordPress post containing the working document and immutable published snapshots keyed by content locale. A snapshot captures the shared tree/styles and that locale’s resolved translation overlay at publication time. Public rendering reads only the locale’s published snapshot. The snapshots are publication history, not separate authoring trees. This gives locale-specific publication despite WordPress post status being shared. The blueprint already proposes revision-enabled registered post meta, while requiring explicit autosave/revision tests. [Storage proposal](</architecture/SCHEMAS-AND-APIS.md:45>), [FR-059](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:28>).

A save must check `edit_post(postId)`, nonce, schema, size/depth, and an expected document revision; mismatch returns `409` with both revisions so the editor can recover. An autosave records the author and **content locale**, never promotes a published snapshot. Publication validates the selected locale and atomically advances only that locale’s snapshot and publication revision. Revisions must restore a complete consistent envelope; test whether the chosen supported WordPress versions reliably include registered meta in revisions and autosaves before finalizing the storage ADR. The proposed API already calls for an optimistic check, and the blueprint requires conflict recovery and locale-aware autosave. [REST proposal](</architecture/SCHEMAS-AND-APIS.md:30>), [FR-016](</product/PRD.md:74>), [FR-059](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:28>), [test scenarios](</engineering/TESTING.md:29>).

Do **not** introduce a custom table now. Reconsider one if measured document size, revision growth, locale publication volume, or concurrent save contention makes post meta unsuitable. If introduced, make the table the sole document source and keep post meta to an index/pointer; avoid dual writable copies. The post and stable `documentId` identify the source document. Locale is a separate validated identity used by routing, publication, preview, and caches; a translated slug/URL cannot be inferred from element props. The routing adapter and exact slug strategy remain BWB-101 decisions. [FR-055](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:24>), [URL warning](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:80>), [BWB-101/111](</roadmap/issues-addendum.csv:2>).

On an unsupported theme, disable builder editing but retain the JSON. The core plugin should render a safe, semantic fallback where its public hook remains available; exact placement and styling need the theme-switch ADR and a switch-back test. [Theme contract](</architecture/SYSTEM.md:81>), [PRD](</product/PRD.md:27>).

## Proposed cascade for BWB-102

For each property, resolve registered global tokens first. Apply global class rules, then element rules. Within each origin, select matching rules in this order: **base normal → breakpoint normal → mode normal → mode × breakpoint normal → state → breakpoint × state → mode × state → mode × breakpoint × state**. Thus a more specific dimension wins for the same property; absent declarations inherit the earlier value. Breakpoints use fixed, nonoverlapping intervals and a registered order. Class ordering is explicit in `classIds`, never incidental CSS emission order. Emit selectors at controlled equal specificity and in the above order, or use CSS layers, so browser specificity cannot silently reverse the contract. This is a proposed replacement for FR-072’s illustrative order. [FR-064 and FR-072](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:34>), [style safety](</architecture/SYSTEM.md:59>).

Conformance fixtures, all checking both compiled CSS and PHP/editor preview:

| Case | Matching declarations for one property | Expected |
|---|---|---|
| 1 | token `black`; class `blue`; element `red` | `red` |
| 2 | element base `red`; dark `white` | light `red`, dark `white` |
| 3 | base `16px`; mobile `14px`; dark `18px`; dark × mobile `15px` | light mobile `14px`, dark desktop `18px`, dark mobile `15px` |
| 4 | dark `white`; mobile `gray`; no dark × mobile | dark mobile `white` under the stated dimension order |
| 5 | base `blue`; hover `green`; dark `white`; dark × hover `yellow` | dark hover `yellow` |
| 6 | mobile hover `orange`; dark hover `yellow`; dark × mobile hover `purple` | dark mobile hover `purple` |
| 7 | two classes set `color`; later `classIds` entry wins; element rule sets `color` | element wins |
| 8 | `auto` resolves from system dark; manual light preference is set | light rule wins; changing locale has no effect |

Case 4 is the key owner-review choice: this proposal gives **mode precedence over breakpoint** when no intersection exists. If authors expect mobile to override dark in that situation, change the rule and fixtures before implementation.

## Top 10 risks, ranked

| Rank | Risk and needed control |
|---:|---|
| 1 | **Draft leakage across locales or shared layout.** Publish immutable locale snapshots; test source edits followed by target-locale publish. [FR-059](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:28>) |
| 2 | **Stored XSS/CSS injection through translations or styles.** Registry validation, safe rich text, URL/CSS allowlists, output escaping. [Security controls](</engineering/SECURITY.md:12>) |
| 3 | **Lost updates from two tabs or locales.** Expected-revision writes and recoverable `409`; test concurrent edits. [REST proposal](</architecture/SCHEMAS-AND-APIS.md:35>), [test scenario](</engineering/TESTING.md:33>) |
| 4 | **WP revisions/autosaves omit or inconsistently restore meta.** Gate the post-meta choice on a supported-version integration spike. [Storage proposal](</architecture/SCHEMAS-AND-APIS.md:45>) |
| 5 | **Schema drift loses unknown elements or future fields.** Versioned migration and round-trip fixtures, safe unknown renderer. [Schema proposal](</architecture/SCHEMAS-AND-APIS.md:25>), [renderer](</architecture/SYSTEM.md:69>) |
| 6 | **CSS precedence differs between preview and public page.** One rule ordering contract, shared fixtures across mode, breakpoint, and state. [FR-071–072](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:43>) |
| 7 | **Locale routing, slug, and SEO mismatch.** Keep routing identity outside props; require tested adapter and unpublished-locale policy. [FR-054–055](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:23>) |
| 8 | **Large meta/revision payloads and cache churn.** Set size/depth caps, profile snapshots, and define cache keys/invalidation. [Security](</engineering/SECURITY.md:14>), [cache requirements](</architecture/SYSTEM.md:73>), [addendum ADRs](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:94>) |
| 9 | **Blank or altered pages after theme switch/add-on loss.** Keep core fallback renderer and verify switch/deactivation journeys. [System](</architecture/SYSTEM.md:81>), [feature lifecycle](</product/FEATURE-MATRIX.md:20>) |
| 10 | **Unsupported WordPress assumptions, including Font Library and meta revision behavior.** Obtain official version/API evidence in BWB-004 before freezing the floor. [Provisional baseline](</architecture/WORDPRESS.md:3>), [open decision](</product/PRD.md:142>) |

## Owner decisions required

1. Should publishing a locale include pending shared-tree/style changes, or require a separate shared-layout publish step? FR-059 requires independent locale behavior but does not settle shared-layout publication. [FR-059](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:28>).
2. For missing or unpublished target content, should public routing return the source page, a blank field/page, a redirect, or 404? The addendum leaves fallback configurable and warns against mixed-language SEO. [FR-054–055](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:23>).
3. Which locale URL/slugs are authoritative, and which multilingual plugin adapters are in the initial supported set? [FR-055](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:24>), [phase minimum](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:114>).
4. Approve or change the proposed mode-over-breakpoint tie rule in conformance case 4. [FR-072](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:45>).
5. Approve Free manual translation and website light/dark rendering, including behavior after premium expiry. The current matrix does not allocate either. [FR-073](</product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md:46>), [matrix](</product/FEATURE-MATRIX.md:5>).
6. Approve the unsupported-theme public fallback’s placement and minimum styling. [System](</architecture/SYSTEM.md:83>).

**Verification performed:** read-only local file inspection and line-numbered searches. No files, dependencies, commits, or network resources were changed or accessed. No tests were run because this is a blueprint review. This directory has no `.git`, so branch/status and the linked GitHub issue’s current contents could not be verified locally.