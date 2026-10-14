**Read-only, offline re-review.** The branch is `docs/p0-architecture-adrs`; the ADRs are uncommitted. No files were changed or tests run.

| # | Status | ADR section and reason |
|---|---|---|
| 1 | **Resolved** | [0005 §§1, 3](architecture/adrs/0005-style-resolution-and-css-output.md:15): class and element layers now follow origin → state → layer; breakpoint and site-wide class order determine emission within a layer. |
| 2 | **Resolved** | [0005 §3](architecture/adrs/0005-style-resolution-and-css-output.md:38): selectors target an ancestor `<html>`, and `auto` has system-dark and system-light rules. |
| 3 | **Resolved** | [0003 §1](architecture/adrs/0003-document-model-and-persistence.md:58), [0004 §§1–2](architecture/adrs/0004-publication-model-and-revisions.md:15): default-locale text has its own stream and can publish without pending layout. |
| 4 | **Resolved** | [0004 §5](architecture/adrs/0004-publication-model-and-revisions.md:39): locale rollback restores its snapshot and layout reference together; retention protects referenced snapshots. |
| 5 | **Partly resolved** | [0003 §3](architecture/adrs/0003-document-model-and-persistence.md:69): per-stream CAS and snapshot-before-pointer order are specified, but a unique, atomic post-meta row remains conditional on the BWB-040 spike. |
| 6 | **Resolved** | [0003 §1](architecture/adrs/0003-document-model-and-persistence.md:59), [0004 §2](architecture/adrs/0004-publication-model-and-revisions.md:24): site-wide classes have an authoritative option and are copied by value into layout snapshots. |
| 7 | **Resolved** | [0005 §3](architecture/adrs/0005-style-resolution-and-css-output.md:48): Blixis theme CSS is layered below builder CSS; the guarantee explicitly excludes third-party unlayered CSS. |
| 8 | **Resolved** | [0006 Decision 3](architecture/adrs/0006-locale-storage-and-routing.md:15): collision checks, publication-aware SEO, redirect handling, preview isolation and cache invalidation are specified. |
| 9 | **Resolved** | [0004 §1](architecture/adrs/0004-publication-model-and-revisions.md:22): tokens are explicitly live and unpinned; snapshots no longer imply a token pin. |
| 10 | **Resolved** | [0008 Decision 4](architecture/adrs/0008-dependency-licensing-and-gsap.md:20): GPL compatibility and human review replace the exhaustive allow-list. |
| 11 | **Partly resolved** | [0001 Decision 2](architecture/adrs/0001-supported-environments.md:19): PHP 8.2 now has a support-policy rationale, but the promised 8.3 floor increase in a minor release remains a compatibility break for existing installations. External lifecycle claims were not checked offline. |
| 12 | **Resolved** | [0005 §2](architecture/adrs/0005-style-resolution-and-css-output.md:33): breakpoints are correctly described as nested `max-width` conditions. |

### New defects

- **Blocker — source comparison has no valid target.** [0004 §3](architecture/adrs/0004-publication-model-and-revisions.md:30) compares `sourceHash` with source values in `L{m}`, but [0003 §1](architecture/adrs/0003-document-model-and-persistence.md:24) removes translatable values from layout. `sourceContentRevision` names a default-locale snapshot, yet public rendering and retention do not bind or retain that snapshot for fallback and stale checks. Define the source snapshot used at publication and rendering.
- **Major — global class edits bypass the layout revision.** [0003 §1](architecture/adrs/0003-document-model-and-persistence.md:60) says a class edit changes working layouts immediately, while [0004 §1](architecture/adrs/0004-publication-model-and-revisions.md:15) counts class changes in `layoutRevision`. The site-wide option edit does not advance each affected layout revision, so pending-change detection and the Publish shortcut can miss it. Define class-version references or mark affected layouts dirty.
- **Major — the combined Publish shortcut can partly succeed.** [0004 §7](architecture/adrs/0004-publication-model-and-revisions.md:45) publishes layout first, then locale. If locale publication fails compatibility or CAS, the layout is already live. Specify a combined preflight and atomic pointer advance, or make partial success an explicit UI outcome.
- **Minor — CSS determinism is overstated.** [0005 §3](architecture/adrs/0005-style-resolution-and-css-output.md:57) says the same document yields byte-identical CSS, while class definitions are external snapshots and tokens are live. Name the class snapshot and token version among compiler inputs. A rollback restores class values but intentionally does not restore historical token appearance.

The expanded class/element `@layer` order matches the stated lexicographic key for normal declarations: origin, then state, then base/breakpoint/mode/mode+breakpoint. Site-wide class order is applied within a layer. The `auto` selectors cover absent or `auto` `data-theme`; the negated dark media query supplies light rules when the system is not dark. I found no additional defect in those two revisions from the written contract.

### Owner example

Assume all four rules are **element-origin, normal-state `color` rules**. The emitted declarations occupy `blx.el.s0.base` (black), `.bp` under mobile (gray), `.mode` under dark (white), and `.modebp` under dark plus mobile (light gray). Each applicable later layer wins:

| Context | Highest matching rule | Result from resolver and emitted layers |
|---|---|---|
| Light desktop | base | **Black** |
| Light mobile | mobile breakpoint | **Gray** |
| Dark desktop | dark mode | **White** |
| Dark mobile, combined rule present | dark + mobile | **Light gray** |
| Dark mobile, combined rule absent | dark mode, above generic mobile | **White** |
| Dark mobile + hover | same as dark mobile: no hover rule exists | **Light gray** with combined rule; **white** without it |

If a hover rule is later added at element origin, its `blx.el.hover.*` layer wins over every matching `blx.el.s0.*` layer, as §1 specifies.