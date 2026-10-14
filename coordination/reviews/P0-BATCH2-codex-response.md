## Findings

### Blocker

- **Add-on removal can still erase a published region** — [ADR 0009 §3](architecture/adrs/0009-distribution-and-package-boundaries.md:36). A generic semantic container cannot recreate a query loop, dynamic field, conditional result, or Plus template when its add-on is absent. The page may load without a fatal error yet lose its header or main content, contrary to ADR 0007’s rendering invariant. **Fix wording:** “For every premium output type, define a Free-owned published fallback projection or retained safe output and test deactivation, expiry, and restore against a previously published page. Where output cannot be preserved, specify an explicit compatibility state rather than promising content display.”

### Major

- **The style verifier is less independent than it claims** — [verify.py, `resolve_by_layers`](tests/fixtures/style-resolution/verify.py:61). It sorts by the same origin/state/layer/breakpoint/class tuple as `resolve_by_key`; both can agree on an incorrectly transcribed ADR order. It does not emit CSS or exercise `@layer`, selectors, media queries, specificity, token inheritance, PHP output, or browser computed style. Its random generator also creates token breakpoint/state rules outside ADR 0005’s per-mode token contract. **Fix wording:** call this an ordering simulation; add compiler-output assertions and browser computed-style tests, including explicit `auto`, manual theme, no-JS, and third-party unlayered CSS cases.

- **Pro’s dependency contract conflicts with the feature matrix** — [ADR 0009 §1](architecture/adrs/0009-distribution-and-package-boundaries.md:20), [FEATURE-MATRIX](product/FEATURE-MATRIX.md:15). ADR 0009 says Pro does not require Plus, while the matrix marks Plus template and dynamic-data capabilities “Yes” for Pro. A Pro-only installation has no stated way to provide them. **Fix wording:** define whether “Pro” means a stack including Plus, make Plus a declared dependency, or change those matrix cells to unavailable in a Pro-only installation.

- **Publication-pointer integrity lacks a direct control** — [THREAT-MODEL T9](engineering/THREAT-MODEL.md:42). Two-phase writes and CAS prevent races but do not, by themselves, reject a forged pointer to an incompatible, unpublished, or nonexistent snapshot. **Fix wording:** require pointer updates only through a publish/rollback endpoint with publish capability, nonce, snapshot identity and compatibility checks, and an atomic expected-pointer comparison; add forged-pointer and direct-meta-mutation negative tests.

- **Snapshot retention has no abuse bound** — [THREAT-MODEL T3/T18](engineering/THREAT-MODEL.md:36). ADR 0004 retains referenced snapshots and a ring per stream. An authorized low-privilege user who repeatedly publishes large documents can grow storage without hitting a single-document cap. **Fix wording:** add publish-rate and aggregate storage limits, retention accounting, and tests showing pruning never removes referenced snapshots while repeated publishing remains bounded or alerts operators.

- **Export/import is absent from the threat boundaries** — [THREAT-MODEL §3](engineering/THREAT-MODEL.md:31). The addendum proposes XLIFF/JSON workflows; a hostile import could inject translated URLs, remap IDs, expose another site’s content, or exhaust parsing resources. **Fix wording:** add a future import/export boundary with schema and locale/ID validation, size limits, safe parser rules, capability checks, and round-trip tests before that paid workflow ships.

- **Dragging criterion is misstated** — [ACCESSIBILITY-BASELINE §2.2](engineering/ACCESSIBILITY-BASELINE.md:13). WCAG 2.2 **2.5.7** requires a single-pointer way to perform a dragging function without dragging, unless an exception applies. Keyboard reorder satisfies keyboard access, but does not alone satisfy 2.5.7. **Fix wording:** require both keyboard reorder and a click/tap or menu based single-pointer move path; test each separately.

- **Publish journey suggests a bulk action forbidden by ADR 0004** — [UX-JOURNEYS J5](product/UX-JOURNEYS.md:27). “Local​es pending … confirm → live” can be read as publishing every pending locale. ADR 0004 allows the initial shortcut to publish layout plus the *current* locale only. **Fix wording:** name the selected action and exact revisions/locales it advances; assert other locales stay byte-identical live. Also show token edits as a separate site-wide apply/confirmation, since ADR 0004 makes tokens live without layout publish.

### Minor

- **AAA criterion is presented as part of the AA target** — [ACCESSIBILITY-BASELINE §2.1](engineering/ACCESSIBILITY-BASELINE.md:12). 2.4.11 is Focus Not Obscured (Minimum), AA; **2.4.13 Focus Appearance is AAA**. Keep 2.4.13 as an optional higher target or label it AAA. The other listed numbers match their stated topics: 2.5.7 dragging, 2.5.8 target size, 3.2.6 consistent help, and 3.3.7 redundant entry.

- **The automated accessibility gate permits known AA failures** — [ACCESSIBILITY-BASELINE §3](engineering/ACCESSIBILITY-BASELINE.md:25). Failing only axe “serious/critical” results can pass a moderate finding that violates the AA target. **Fix wording:** gate on mapped WCAG A/AA violations, with a reviewed exception record; use severity to triage, not to decide conformance.

- **The translator acceptance check precedes its role decision** — [UX-JOURNEYS J3/open questions](product/UX-JOURNEYS.md:19). J3 requires a translator-only capability test while §Open questions has not decided whether that role exists in Free 1.0. **Fix wording:** make the test conditional on the role decision; until then test locale editing with users who can edit the post.

## Agreements and checks

I independently derived these fixture outcomes from ADR 0005’s key order: `owner-example` dark/mobile → **lightgray**; `owner-example-without-combined` dark/mobile → **white**; `narrower-breakpoint-wins` mobile → **green**; `element-beats-class-dark` dark/mobile → **elementbase**; `class-state-vs-later-class-base` hover → **red**; `state-beats-layer` dark/mobile/hover → **orange**; `dark-mobile-hover-most-specific` dark/mobile/hover → **gold**. The stored expectations are correct. The `autoMode` table also matches the ADR’s explicit-theme and system-preference selectors, including light for “no preference.”

The offline verifier ran successfully: `cases=13 invalid=1 auto=7 matrix=192 random=3000 failures=0`. The working tree was unchanged.

I could not verify the current WordPress.org guideline text, actual browser CSS behavior, WordPress/plugin runtime behavior, or live GitHub issue contents while offline. ADR 0009’s guideline quotations and release-channel assumptions therefore still need source checks before approval.