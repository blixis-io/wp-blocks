# ADR 0006: Locale storage and routing

- Status: Accepted
- Date: 2026-10-14
- Issues: #101 (BWB-101), #104, #110, #111, #112
- Deciders: owner, orchestrator
- Reviewers: Codex (see Review log)

## Context
Free must support manual multilingual content (ADR 0007). Content locale is distinct from the editor UI locale and from website appearance. The blueprint warns that public URL localisation cannot be solved by translating element props alone and forbids claiming compatibility with translation plugins before adapter tests exist (`ADDENDUM-PLAN.md`). Storage of translated values and publication states is fixed by ADR 0003/0004.

## Decision
1. **Locale identity.** A content locale is a WordPress locale id (`nl_NL`) with a derived BCP 47 tag (`nl-NL`) for `lang`/`hreflang`; direction (`ltr`/`rtl`) comes from WordPress locale data. Site languages are configured once in a versioned option: `defaultLocale`, `enabledLocales[]`, fallback policy. Editor interface locale (user locale) and content locale are separate state everywhere (UI, URLs, autosave).
2. **Storage.** Per ADR 0003: translations in the document envelope, locale snapshots per ADR 0004. One WordPress post per page; no duplicate posts in the native strategy.
3. **Routing — native strategy (Free default).**
   - Default locale at the canonical URL (`/about/`); other locales under a path prefix (`/nl/about/`) via a plugin rewrite rule and a `blx_locale` query var. Same post slug in all locales in Free 1.0.
   - `<html lang>` and `dir` set from the resolved locale. `rel="alternate" hreflang` for all *published* locales plus `x-default`; self-referencing canonical per locale URL.
   - A locale whose LocaleSnapshot is not published responds **404** on its URL and is omitted from hreflang, locale switcher and sitemap contributions (prevents mixed-language SEO). Within a published locale, a field without a translation uses the configured fallback (`source` default, or `blank`); fallback use is flagged in the editor and never alters stored data.
   - Locale never resolves from the appearance mode or vice versa; preview URLs carry both independently (`?blx_locale=nl_NL&blx_mode=dark`) and are only valid for authorised users.
   - **Route safety.** Enabling a locale prefix is refused if it collides with an existing top-level page/post slug or reserved route (collision report shown). Alternates, canonical URLs, sitemap entries and the locale switcher are emitted only after checking the target's post status and locale publication state. The unpublished-locale 404 is produced before WordPress canonical redirects can rewrite the URL (the router short-circuits `redirect_canonical` for blx routes). `x-default` always points to a *published* URL (the default locale's, or the first published locale).
   - **Caching.** Public cache key = `(post, locale, layoutRev, contentRev, tokenVersion, theme/template version, fallback-policy version)`. Appearance mode is CSS-side and not a cache dimension unless `data-theme` is server-rendered. Authorised previews (`?blx_locale=…&blx_mode=…`) are never cacheable: `Cache-Control: private, no-store`, `DONOTCACHEPAGE`, nonce/capability checked, and not reachable by unauthenticated URL guessing. Publication, routing, fallback-policy and theme changes invalidate affected public cache entries (documented hooks for page-cache plugins).
4. **Adapters.** Routing and slug translation for WPML/Polylang/TranslatePress etc. go behind a `LocaleRouter` interface (`resolve(request)`, `urlFor(post, locale)`, `alternates(post)`, `isPublished(post, locale)`). Free ships only the native strategy. No adapter is advertised until it has contract tests against that plugin (BWB-111). Translated slugs are out of scope for Free 1.0 native routing.
5. **Menus, media alt text, template strings:** each gets an explicit translatable-property contract in the registry (FR-056); menus are a follow-up issue because WordPress menus are not document content.
6. **RTL:** logical CSS properties in generated CSS where applicable; direction comes from the locale; fixtures for Arabic/Hebrew in BWB-118.

## Alternatives considered
- *Per-locale posts (WPML-style):* rejected as native default; breaks shared IDs/structure and multiplies publish states.
- *Query-string locale (`?lang=nl`):* rejected; weak for SEO.
- *Subdomain/domain per locale:* deferred (hosting/DNS dependent), could be a router strategy.
- *Fallback 200 with source language on unpublished locale URL:* rejected (duplicate/mixed-language content).

## Consequences
- Rewrite rules require flush on activation/locale change and must not conflict with existing multilingual plugins; detect and disable native routing when another router is active.
- Archive/term/search pages are not locale-aware in native Free routing; documented limitation.

## Test strategy
Route resolution matrix (default, prefix, unknown locale, unpublished locale 404 with and without canonical redirects, prefix/slug collision, draft post alternates), hreflang/canonical output, `lang`/`dir`, fallback behaviour, preview URL independence of mode, rewrite flush, detection of conflicting plugins, cache key correctness (no cross-locale leak), preview non-cacheability and authorisation, `x-default` correctness.

## Rollback
Disabling native routing leaves documents intact; only `/nl/` URLs stop resolving (301 redirect option to default locale is a documented operator choice).

## Open questions
- Owner: unpublished-locale response (404 chosen as default) vs redirect to default locale.
- Which plugin adapter, if any, is first (decision deferred until market validation; not in Free 1.0).
- Term/archive localisation strategy.

## Review log
- 2026-10-14 orchestrator draft.
- 2026-10-14 Codex review: Challenge 4 verdict "agree with 404 and prefix in principle, contract incomplete" — Major 8 accepted (collision detection, status checks, 404-before-redirect, preview isolation, wider cache key, x-default).
