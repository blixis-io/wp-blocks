# Threat Model (P0 baseline)

Status: Accepted (2026-10-14); updated whenever an ADR changes a boundary · Issue: #10 (BWB-010) · Companion: [ACCESSIBILITY-BASELINE.md](ACCESSIBILITY-BASELINE.md), [SECURITY.md](SECURITY.md), ADRs 0003–0006, 0009.
Scope: Blixis Theme, Builder (Free), Plus/Pro add-ons, editor, REST API, rendering, update/licence channels. Not a penetration test: it lists what must be designed and tested; findings feed BWB-048 and BWB-070.

## 1. Assets
| Asset | Why it matters |
|---|---|
| Stored documents (layout, locale content, snapshots) | Integrity and availability of the site's content; source of rendered HTML/CSS |
| Published pointers and snapshots | Decide what the public sees; tampering publishes arbitrary content |
| Unpublished drafts, unpublished locales, previews | Confidentiality |
| Design tokens, global classes | Site-wide appearance; CSS injection surface |
| Visitor browsers | Targets of stored XSS/CSS exfiltration |
| Editor sessions and nonces | Authority to change content |
| Licence keys and update channels (Plus/Pro) | Supply chain; commercial integrity |
| Source repository, CI secrets, release artifacts | Supply chain |

## 2. Roles and capabilities
| Actor | WordPress capability basis | May do |
|---|---|---|
| Anonymous visitor | none | read published locale snapshots only |
| Contributor/Author/Editor | `edit_post` on the specific post (object-level) | edit working streams of posts they may edit; publish only if `publish_posts`/`edit_published_posts` allows for that post |
| Translator (Free 1.0) | capability `blixis_translate_locale`, checked per locale stream; no new WordPress role | edit that locale's content streams only; no layout, other locales, layout publish or design settings |
| Administrator | `edit_theme_options`, `manage_options` | design system, locales, global classes, add-on screens |
| Network/other plugins | arbitrary PHP | trusted code boundary: can do anything PHP can; we only protect against *accidental* misuse via validated APIs |
| Premium add-on | registers elements via extension API | treated as trusted code but constrained by registry validation |
| Attacker (unauthenticated or low-privilege) | none or Subscriber | tries XSS, CSRF, IDOR, injection, DoS |

Principle: authorisation is decided on the server per object (`edit_post`, `publish_post`, locale capability); UI state is never trusted (SECURITY.md).

## 3. Trust boundaries and threats (STRIDE)
| # | Boundary | Threat | Required control | Verified by |
|---|---|---|---|---|
| T1 | Browser → REST | Spoofing/CSRF: forged writes using a victim's cookies | Cookie auth + `X-WP-Nonce`; `permission_callback` on every route; no state change on GET | REST auth/nonce tests (negative) |
| T2 | REST object access | Elevation/IDOR: editing or reading another post's document or an unpublished locale | `current_user_can( 'edit_post', $id )` per request; locale capability check; 403 not 404 leakage policy decided in BWB-041 | per-role matrix tests |
| T3 | Document payload → storage | Tampering/DoS: oversized, deeply nested, cyclic, duplicate-id documents | Schema validation, caps (depth, nodes, bytes, declarations), reject duplicates/cycles, rate/size limits on preview | [PHP matrix](SECURITY-TEST-MATRIX.md#php-plugin-security-test-matrix-bwb-048) T3 (partial; full schema BWB-043) |
| T4 | Translation payload → renderer | Stored XSS via translated text, links, alt text, rich text | Registry-classified properties; rich text as validated node list; escape on output (`esc_html`, `esc_attr`, `esc_url`); URL scheme allow-list; never feed translations to CSS compiler | [PHP matrix](SECURITY-TEST-MATRIX.md#php-plugin-security-test-matrix-bwb-048) T4 |
| T5 | Style rules → CSS output | CSS injection/exfiltration (`url()`, `@import`, attribute selectors, expression, escapes) | Tokenizing parser, property/value allow-list, `var()` limited to `--blx-*`, images by attachment id, generated identifiers only (ADR 0005 §4) | [PHP matrix](SECURITY-TEST-MATRIX.md#php-plugin-security-test-matrix-bwb-048) T5 |
| T6 | Editor ⇄ canvas iframe | Spoofing/tampering via `postMessage` from other windows/origins; clickjacking | Origin + `event.source` checks, strict message schema, sandboxed same-origin iframe flags as needed, no inline script execution from document data, `frame-ancestors` for the editor screen | iframe protocol tests (BWB-051) |
| T7 | Preview URLs | Information disclosure: unpublished content or other locales served to anonymous/cached users | Auth + capability + nonce; `Cache-Control: private, no-store`; not guessable-only security | preview authorisation and cache tests (ADR 0006) |
| T8 | Public cache | Cache poisoning/leak across locale, layout revision or theme | Cache key includes locale, layout/content/default-locale revisions, token and theme versions; invalidation on publish/routing/theme change | cache key tests |
| T9 | Publication model | Integrity: publishing pending drafts, partial publish, rollback to incompatible pair, **forged or direct mutation of the published pointer** | Two-phase publish, single pointer advance, CAS (ADR 0003/0004). The pointer row is written only by the publish/rollback endpoint, which requires the publish capability for that post (and locale), a nonce, an existing snapshot identity, the compatibility check, and an atomic expected-pointer comparison; the meta key is not writable via the REST meta API or `update_post_meta` callers outside the repository class (guarded by `auth_callback`/protected meta) | interrupted-publish, concurrency, **forged-pointer and direct-meta-mutation negative tests** (BWB-040) |
| T10 | Routing | Open redirect, route collision, unpublished locale reachable | Collision detection, 404 before canonical redirect, hreflang only for published locales | routing matrix (BWB-111) |
| T11 | Media | Malicious uploads/URLs, SVG scripts, SSRF via remote image | WordPress media library only; MIME allow-list; no remote fetch by the builder; SVG sanitisation or disallow | media tests (BWB-045) |
| T12 | Dynamic data (Plus/Pro) | Data disclosure, query abuse, SQL injection | Keyed adapters, field allow-list, bounded queries, `$wpdb->prepare`, capability checks on source | adapter tests (P8/P9) |
| T13 | Third-party elements | Malicious or buggy element code, version skew | Registry validation, namespaced types, extension API versioning, safe fallback; treat as trusted PHP but never trust *data* | registry tests |
| T14 | Licence/update channel | Supply chain: forged updates, key theft, SSRF in licence calls | Signed/verified updates where supported, HTTPS only, no licence call on public requests, secrets only in protected CI environments | release process review (BWB-074/083) |
| T15 | Source repo / CI | Supply chain: malicious dependency, leaked secrets, PR from fork exfiltrating secrets | Lockfiles, dependency + licence inventory (ADR 0008), secret scanning, no secrets for fork PRs, protected environments, pinned actions | CI policy (BWB-015/016) |
| T16 | Auto-translation (future) | Privacy: private content sent to a provider without consent; cost abuse | Opt-in provider config, explicit consent and cost disclosure, never in Free (ADR 0007) | design review in #123 |
| T17 | Repudiation | No audit trail for publish/rollback | Log actor, locale, revision, time for publish/rollback events (no PII beyond user id); retain per policy | [PHP matrix](SECURITY-TEST-MATRIX.md#php-plugin-security-test-matrix-bwb-048) T17 (hook contract only) |
| T18 | Denial of service | Expensive preview/compile loops, huge CSS, regex DoS | Size/time bounds on preview and compile, linear-time parsers, caching of compiled output | perf/fuzz tests |
| T19 | Disclosure via errors/logs | Leaking paths, tokens, content | Generic REST errors with stable codes; redaction in logs | [PHP matrix](SECURITY-TEST-MATRIX.md#php-plugin-security-test-matrix-bwb-048) T19 |
| T21 | Snapshot growth | DoS/storage exhaustion by an authorised low-privilege user publishing repeatedly (retention keeps referenced snapshots and a ring per stream) | Publish rate limit per user/post, aggregate storage cap per post and site with operator alert, retention accounting, pruning tests proving referenced snapshots are never removed while repeated publishing stays bounded | [PHP matrix](SECURITY-TEST-MATRIX.md#php-plugin-security-test-matrix-bwb-048) T21 (per-post controls only) |
| T22 | Import/export (future paid workflows: XLIFF/JSON) | Injection of URLs/markup, ID remapping, cross-site content exposure, parser exhaustion (XXE, zip/billion-laughs) | Schema + locale + element-ID validation against the target document, size and node limits, safe parser settings (no external entities), capability check, dry-run preview, round-trip tests; must exist before the workflow ships (#122) | import/export tests (P8) |
| T20 | Multisite | Cross-site data access | Per-site options/meta, capability checks in site context | multisite test (not promised in 1.0) |

## 4. Out of scope (accepted risks, documented)
Compromised WordPress core, server or database; malicious administrator; malicious but "trusted" plugin executing arbitrary PHP; browser zero-days. These are mitigated by WordPress itself and hosting, not by this product.

## 5. Security requirements derived (for issue acceptance)
1. Every REST route has a `permission_callback`, input schema, and negative tests per role (BWB-041).
2. All output is escaped at the point of output; no raw HTML from documents (BWB-043).
3. CSS only via the allow-list compiler; no user-supplied selectors (BWB-023/024).
4. Posting a document cannot publish it; publishing is a separate authorised action (ADR 0004).
5. Free makes no external requests without consent (ADR 0009).
6. Dependency and licence inventory runs in CI; GSAP workspace allowlist and scoped licence exception (ADR 0013).
7. Security review and fuzzing before Free 1.0 (BWB-070); zero known critical/high exploitable issues at release (PRD §10).
8. Vulnerability reporting address, severity SLA and advisory process selected before public launch (owner action; SECURITY.md).

## 6. Review
Drafted by the orchestrator. Independent review by Codex is recorded under `docs/coordination/reviews/`. Update this document whenever an ADR changes a boundary.
