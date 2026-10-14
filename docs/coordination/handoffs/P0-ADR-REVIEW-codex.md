# Handoff: independent review of P0 ADRs 0001–0008

Issues: #4, #5, #7, #8, #101, #102, #103 (https://github.com/blixis-io/wp-blocks/issues). Branch: `docs/p0-architecture-adrs`.
Mode: READ-ONLY. Do not edit files. Do not run network commands.

## Your role
Independent reviewer. The ADRs were drafted by the orchestrator (ADR 0004, 0005, 0007 record owner decisions that are NOT up for debate: locale publish must not publish pending layout; dark beats mobile, dark+mobile beats both; manual translation and light/dark are Free). Review whether the ADRs implement those decisions correctly, are internally consistent and consistent with `product/PRD*.md`, `architecture/*.md`, `engineering/*.md`, and are implementable.

## Read
`architecture/adrs/*.md` (all), then as needed `product/PRD.md`, `product/PRD-ADDENDUM-MULTILINGUAL-THEMES.md`, `product/FEATURE-MATRIX.md`, `architecture/SYSTEM.md`, `architecture/SCHEMAS-AND-APIS.md`, `architecture/WORDPRESS.md`, `engineering/SECURITY.md`, `coordination/reviews/BWB-007-codex-response.md` (your earlier proposal).

## Specific challenges (answer each: agree / disagree / unsure + reasoning)
1. ADR 0005: the key order origin > state > layer > breakpoint. Is "origin outranks layer" right, or should a class dark rule beat an element base rule? Check the owner's worked example resolves correctly. Find any input where the algorithm and the emitted `@layer` order disagree. Is `:where()` zero-specificity plus layer order truly deterministic including states and `auto` media-query copies? Does unlayered theme CSS risk breaking it?
2. ADR 0004: are the compatibility rules sound? Find a sequence of publish/layout/delete/rollback actions that makes a live page inconsistent, leaks pending content, or cannot be rolled back. Is treating default-locale text as part of the layout stream coherent?
3. ADR 0003: is the envelope sufficient for 0004/0005? Any missing field (e.g. orphaned translations, per-locale published pointers, global class storage)? Is post meta + own revision ring defensible?
4. ADR 0006: 404 for unpublished locale, native path-prefix routing, hreflang, cache keys. Any SEO/security/caching flaw?
5. ADR 0001: PHP 8.2 floor and WP 7.0 floor. Any contradiction with the cited facts (not verifiable offline: say so).
6. ADR 0008: is the GSAP reading reasonable and is the decision proportionate? Any dependency/licence blind spot?
7. Security: anything in these ADRs that would create XSS/CSS-injection/authorisation gaps.

## Output
Findings ranked Blocker / Major / Minor, each with ADR file + section, concrete failure scenario, and proposed wording change. Then "Agreements" (short). Do not pad. If you could not verify something, say so.
