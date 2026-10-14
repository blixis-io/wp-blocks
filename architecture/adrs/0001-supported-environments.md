# ADR 0001: Supported environments

- Status: Accepted (owner delegated the decision to the orchestrator, 2026-10-14)
- Date: 2026-10-14
- Issues: #4 (BWB-004)
- Deciders: owner (approves floors), orchestrator
- Reviewers: pending (see Review log)

## Context
The blueprint proposed WordPress 7.0+ because of the Font Library, and left PHP/Node/browser floors open (`PRD.md` §13, `WORDPRESS.md`). Facts checked on 2026-10-14 from primary sources:

- Font Library: introduced in WordPress 6.5 for block themes (site editor). WordPress documentation states: "Starting in 7.0, it is available globally for block themes and classic themes", under **Appearance > Fonts** (https://wordpress.org/documentation/article/the-font-library/, updated 2026-07-26). The blueprint claim is therefore correct for a classic/hybrid theme; below 7.0 a classic theme would not have the UI.
- WordPress 7.0 raised the minimum supported PHP to 7.4.0; recommended PHP stays 8.3 (https://make.wordpress.org/core/2026/01/09/dropping-support-for-php-7-2-and-7-3/).
- PHP: 8.5 and 8.4 are actively supported, 8.3 security-only, 8.2 reaches end of life 2026-12-31, 8.1 and older are end of life (php.net supported versions; secondary summaries agree). Re-verify at release.
- Node.js: 24 is Active LTS (Maintenance from 2026-10-20), 22 is Maintenance LTS until 2027-04, 26 is Current and becomes LTS 2026-10-28 (https://github.com/nodejs/release). Node is a build/dev dependency only; it never runs on a customer site.

## Decision
1. **WordPress:** minimum **7.0**; tested against the minimum and the latest stable release. Reason: Font Library is a hard product requirement for classic themes. No Font-Library fallback is built (no second font subsystem, per PRD FR-005).
2. **PHP:** minimum **8.2** for Blixis Theme, Builder, Plus and Pro; CI matrix 8.2 (minimum), 8.3 (WordPress-recommended), latest stable (8.5). We do not support PHP 7.4–8.1 even though WordPress itself runs on 7.4+. Rationale is support policy, not language features: 8.1 and below are end of life (no security fixes), and 8.2 is the oldest branch still receiving security fixes at decision time. When 8.2 reaches end of life (2026-12-31) the floor is expected to move to 8.3. A floor increase is an environment change, not an API break: it is announced one release ahead with an admin notice and changelog entry, and ships in a minor release; the plugin's `Requires PHP` header makes WordPress withhold the update from sites that do not meet it, so existing installs keep the last compatible version (activation is additionally guarded).
3. **Node (development and CI only):** the repository pins Active LTS 24 (`.nvmrc`, `engines: >=24`). Node 22 (Maintenance) is not a supported development version. When Node 26 becomes LTS (scheduled 2026-10-28) CI adds it to the matrix; Node 24 leaves the matrix when it leaves Maintenance. Node version is never a runtime requirement. (Amended 2026-10-14 in BWB-011: the earlier text also called for the oldest Maintenance LTS.)
4. **Package manager/tooling:** pnpm workspaces, Composer for PHP, Docker or `wp-env` for local WordPress (as in `CI-CD.md`), exact versions pinned in P1 (#11 onward).
5. **Browsers (editor and public site):** the current and previous stable release of Chromium-based browsers, Firefox and Safari (WebKit). Public pages must remain readable without JavaScript.
6. **Database/hosting:** whatever WordPress 7.0 requires; not further constrained. Multisite is tested but not promised in Free 1.0.
7. **Compatibility matrix** lives in `docs` and CI; no speculative compatibility claims (FR-074).

## Alternatives considered
- *WordPress 6.5+ with a Font Library fallback for classic themes:* rejected; doubles font logic and contradicts "no duplicated subsystem".
- *PHP 7.4 minimum to match WordPress:* rejected; end of life and constrains security tooling (PHPStan levels, readonly).
- *PHP 8.3 minimum now:* viable and simpler, but excludes hosts that still ship 8.2 for the remainder of its support window. Revisit at owner request.

## Consequences
- Some shared hosts on PHP < 8.2 or WordPress < 7.0 cannot install the product; the plugin must fail activation with a clear notice rather than fatal.
- Fewer matrix cells; modern PHP features allowed.

## Test strategy
- Activation guard unit/integration tests on unsupported WP/PHP versions (plugin and theme refuse to activate, no fatals, notice shown).
- CI matrix: WP {7.0, latest} × PHP {8.2, 8.3, latest}; Node {24, and 26 once it is LTS}.
- A scheduled job re-checks php.net/nodejs.org/wordpress.org lifecycle pages and opens an issue when a floor is about to go end of life.

## Rollback
Raise or lower floors by superseding ADR, following the one-release notice rule above.

## Open questions
- Decided 2026-10-14 (owner delegation): PHP 8.2 floor stays, revisit when 8.2 reaches end of life on 2026-12-31 (expected move to 8.3 per the one-release-notice rule).
- Verify WordPress 7.0 stable release date and current stable version against wordpress.org before release; search results disagreed on whether 7.1 exists.

## Review log
- 2026-10-14 orchestrator draft.
- 2026-10-14 Codex review: Minor 11 accepted (PHP rationale and SemVer wording corrected). Codex could not verify external facts offline; the facts were verified by the orchestrator from the cited sources on 2026-10-14.
- 2026-10-14 Codex re-review (`coordination/reviews/P0-ADR-REREVIEW-codex-response.md`): 10 of 12 earlier findings resolved, 2 partly (post-meta atomicity stays conditional on the BWB-040 spike; PHP floor increase handled via `Requires PHP`). New findings applied here: source-comparison target and retention (blocker), global-class pending detection via `classVersion`/`classRefs`, combined-publish preflight with single atomic pointer advance, determinism inputs named.
