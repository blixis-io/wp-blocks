# ADR 0008: Dependency licensing and GSAP

- Status: Accepted (owner delegated the decision to the orchestrator, 2026-10-14)
- Date: 2026-10-14
- Issues: #8 (BWB-008), #87, #88 (Pro animation)
- Deciders: owner (legal), orchestrator
- Reviewers: Codex (see Review log)

## Context
The Free plugin and theme target WordPress.org and GPL-compatible distribution; paid add-ons ship separately. The blueprint blocks GSAP pending a licence review for a visual animation builder.

Findings (2026-10-14; this is engineering diligence, not legal advice):
- The "Standard 'No Charge' GSAP License" (Webflow, effective 2025-04-30, modified 2025-05-30; https://gsap.com/community/standard-license/) permits use on any website, web app or digital interface, including by companies competing with Webflow elsewhere, but defines **Prohibited Uses** as use "in tools that allow users to build visual animations without code" that "encourage[s], induce[s], or materially assist[s] in creating a solution that competes with Webflow's visual animation" capabilities, and forbids such use "without prior written consent". It also forbids reverse engineering to build competing products and removing branding.
- Blixis Pro plans an "animation abstraction/controls" feature inside a visual no-code builder (FR-034). That is squarely within the plain reading of the Prohibited Uses. Generated *output* animating a page is a different question from *shipping GSAP inside the builder tool*, and the licence does not clearly resolve it.

## Decision
1. **GSAP is not adopted** in any Blixis package (theme, Builder, Plus, Pro, docs examples, tooling) and must not be added as a dependency or vendored. A CI check (dependency denylist) enforces this from P1.
2. **Default animation engine: CSS transitions/animations and the Web Animations API** (browser-native, no licence exposure). FR-034 remains "approved engine only".
3. **Reopening** requires (a) written consent from Webflow/GSAP or a legal opinion by counsel covering our exact use, (b) an owner-approved superseding ADR. Until then the Pro animation issues (#87 engine decision, #88 controls) are scoped to CSS/WAAPI.
4. **Licence policy.** P1 adds an automated inventory (`license-checker`/Composer licences, SPDX) covering npm, Composer and bundled assets (fonts, icons, images, copied shadcn/ui source). Inventory output *feeds human review*; it is not the policy. Policy: every package distributed in a Free artifact must be GPL-compatible per the FSF list (permissive licences such as MIT/ISC/BSD/Apache-2.0/0BSD are expected; GPL-2.0-or-later and compatible LGPL also qualify; MPL-2.0 needs review). Dev-only tooling that is not distributed is out of scope for compatibility but is still recorded. Unknown, missing or non-listed licences fail CI until a recorded decision is added to `LICENSES.md`. The planned stack (React, TypeScript, Vite, Zustand, dnd-kit, Radix UI/shadcn/ui, Tailwind CSS, Vitest, Playwright) is **expected** to be compatible but must be confirmed from package metadata before first release. NOTICE is generated from the inventory.
5. **Fonts:** preset fonts are installed through the WordPress Font Library; no font files are bundled unless their licence permits redistribution (SIL OFL or equivalent) and it is recorded in NOTICE.
6. **Distribution:** Free plugin/theme source is GPL-compatible and contains no inactive premium code (WordPress.org guideline; re-read the current guidelines at submission). Paid add-ons are independent distributions; counsel reviews derivative-work implications before launch (owner action).

## Alternatives considered
- *Adopt GSAP under the standard licence and rely on interpretation:* rejected; the risk falls on the whole Pro product.
- *Anime.js / Motion One / similar MIT libraries:* possible later via ADR if WAAPI is insufficient; evaluate maintenance and size first.

## Consequences
Advanced timeline animation (scroll-driven, sequencing) is limited to what CSS/WAAPI (and scroll-driven animation CSS where supported) provide.

## Test strategy
Dependency denylist test in CI (fails if `gsap` or `@gsap/*` resolves in any lockfile); licence inventory job; docs build check for GSAP references.

## Rollback
Superseding ADR with written consent.

## Open questions
- Decided 2026-10-14 (owner delegation): GSAP stays excluded and no legal review or consent request is started now. Reopening requires a superseding ADR with written consent or counsel opinion (see Decision 3). Counsel review of the overall GPL plus paid-services model remains an owner action before launch (ADR 0009).
- Confirm compatibility of each planned dependency licence with GPL distribution (done by the inventory job).

## Review log
- 2026-10-14 orchestrator draft; licence text read from gsap.com page (third-party mirrors corroborate).
- 2026-10-14 Codex review: GSAP decision agreed (could not verify licence text offline; verified by orchestrator from gsap.com). Major 10 accepted — allow-list replaced by GPL-compatibility policy with human review.
