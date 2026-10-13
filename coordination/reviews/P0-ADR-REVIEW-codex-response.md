## Findings

### Blocker

1. **ADR 0005, §1 and §3 — the resolver and CSS layers disagree.** The resolver ranks class order before state. If an earlier class sets `color: red` on hover and a later class sets `color: blue` at base, the resolver returns blue; `blx.class.state` beats `blx.class.base` and renders red. The single state layer also leaves mode, breakpoint and combined-state precedence unspecified. **Wording change:** define the full ordering key for state rules and require CSS generation to reproduce that key, including `classIds` order. Add browser fixtures for conflicting classes across states and modes.

2. **ADR 0005, §3 — the written mode selector does not match the element.** `.blx-a1:where([data-theme="dark"])` requires `data-theme` on the element, while the ADR puts it on `<html>`. Dark overrides would not apply. The proposed `auto` copy covers system dark, but does not specify how light-specific rules apply when `auto` leaves `<html>` without an attribute. **Wording change:** specify ancestor-scoped selectors such as `:where(html[data-theme="dark"]) .blx-a1`, plus explicit system-light and system-dark selectors; test all three preferences with JavaScript disabled.

3. **ADR 0003, §1 and ADR 0004, §1–2 — default-locale publication is contradictory.** Source text is stored in layout `props`, yet ADR 0004 says publishing the default locale publishes that text without publishing pending layout. Edit English text and Dutch layout, then publish English: either the pending layout leaks, or the new English text cannot go live. **Wording change:** make default-locale translatable values a locale stream in the canonical envelope and snapshots. Keep only invariant props in the layout stream, and define the source-hash baseline against the relevant published source revision.

### Major

4. **ADR 0004, §3 and §5 — rollback compatibility needs a precise pointer policy.** After a layout publish removes an element, an older Dutch publication remains pinned to the old layout. Restoring a different layout, then republishing Dutch from working translations can exclude the orphaned entry; the ADR does not define whether a locale rollback restores its original layout reference and content together. **Wording change:** state that a locale rollback republishes the *pair* `(baseLayout, locale snapshot)` atomically, and that pruning retains every referenced layout and locale snapshot.

5. **ADR 0003, §3 and ADR 0004, §6 — independent revisions are not yet an atomic storage contract.** One working envelope in one post-meta value can lose an English save when a Dutch save based on the same envelope completes concurrently, despite different locale revision counters. Snapshot creation and pointer advancement can also fail halfway. **Wording change:** require compare-and-swap or serialized writes for the envelope, merging untouched streams, and an atomic published-pointer advance only after durable snapshot creation. Test concurrent locales and interrupted publishes. Post meta remains defensible if the BWB-040 spike proves these operations and recovery.

6. **ADR 0003, §1 and Open questions; ADR 0004, §1 — global classes lack an authoritative home.** `globalStyle` is per document, while the feature matrix promises global CSS classes. Editing a shared class cannot reliably update all pages or identify which class version a pinned layout used. **Wording change:** decide site-wide class storage and versioned references before implementation, or explicitly rename these as document-local classes and specify a separate global-class contract.

7. **ADR 0005, §3 — unlayered theme CSS can defeat the promised cascade.** An ordinary unlayered theme rule for the same element/property beats every normal layered builder rule, regardless of the resolver’s winner. Calling this intentional does not make browser output match the reference resolver or editor preview. **Wording change:** define a reserved builder styling scope and a tested theme integration contract, or qualify the resolver’s guarantee as applying only within builder-owned CSS and test theme collisions.

8. **ADR 0006, Decision 3 and Consequences — routing and caches need stricter boundaries.** `/nl/about/` can collide with an existing page path; WordPress canonical redirects or a page cache can turn an intended unpublished-locale 404 into a redirect or cached 200. The stated cache key also omits theme/template changes and preview authorization. **Wording change:** require route-collision detection, post-status checks before alternates, canonical and sitemap output, 404 handling before redirects, and separate non-cacheable authorized previews. Specify public cache invalidation on publication, routing, fallback-policy and theme changes. `x-default` must point only to a published URL.

9. **ADR 0004, §1–3 — token revisions are referenced but not retained.** A layout snapshot names a token version, while ADR 0003 stores one versioned site option. If that option is overwritten, an old pinned page or rollback cannot reproduce its appearance. **Wording change:** either retain immutable token versions while referenced or state that tokens deliberately update all published pages and remove the snapshot’s implied pin.

10. **ADR 0008, Decision 4 — the license allow-list is too narrow for the stated policy.** It omits GPL-compatible licenses, so the proposed CI gate could reject legitimate WordPress dependencies while still requiring separate review of copied source and assets. **Wording change:** define a GPL-compatibility review policy for each distributed package and its assets, with automated inventory feeding human review rather than treating the listed licenses as exhaustive.

### Minor

11. **ADR 0001, Decision 2 — PHP rationale and upgrade promise need correction.** Typed properties, enums and `readonly` do not themselves require PHP 8.2. The promised move from 8.2 to 8.3 in a minor release conflicts with the ADR’s own statement that raising the floor is a SemVer breaking change. **Wording change:** justify 8.2 by support policy or actual required APIs, and require a breaking-version release for a floor increase. I could not verify the cited WordPress, PHP or Node lifecycle facts offline.

12. **ADR 0005, §2 — “nonoverlapping” breakpoints conflicts with its example.** The text says tablet and mobile rules can both match a phone and the narrower wins. **Wording change:** describe nested `max-width` conditions with a fixed widest-to-narrowest order, or use genuinely nonoverlapping ranges and remove inheritance by overlapping match.

## Challenge verdicts

| Challenge | Verdict |
|---|---|
| **0005 origin before layer** | **Agree as an authoring rule:** an explicit element base value beating a class dark value is defensible. **Disagree that the emitted CSS implements the full rule**, especially across class order and states. The owner’s single-origin worked example resolves as intended: dark mobile is light gray with the combined rule, white without it; light mobile is gray. |
| **0004 compatibility and rollback** | **Disagree as written.** The default-locale contradiction and undefined rollback pair block a reliable implementation. The owner’s independent-publish decision is sound. |
| **0003 envelope and post meta** | **Disagree on sufficiency; agree conditionally on post meta.** It needs an explicit default-locale stream, orphan state, published pointers, global-class ownership and atomic write contract. The own revision ring is reasonable if the WordPress spike and recovery tests pass. |
| **0006 routing and SEO** | **Agree with 404 and native prefixes in principle; disagree that the routing/cache contract is complete.** |
| **0001 version floors** | **Unsure on external facts offline.** No internal contradiction requires rejecting WP 7.0 or PHP 8.2, but the PHP rationale and upgrade promise need revision. |
| **0008 GSAP** | **Agree with the cautious decision and CSS/WAAPI default.** I could not independently verify the quoted license text offline. The broader dependency license gate needs adjustment. |
| **Security** | **Disagree that the ADRs fully close the gaps.** ADR 0005’s CSS allow-list needs parsing and escaping rules for functions, variables and generated identifiers; ADR 0006 needs explicit preview cache and authorization isolation. Registry classification, REST capabilities and output escaping are correctly identified as required controls. |

Review was read-only and offline. No files were edited or tests run.