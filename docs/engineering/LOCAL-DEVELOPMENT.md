# Local development environment

A small Docker Compose stack (`docker/compose.yml`) gives every developer, and CI, the same WordPress. It replaces `@wordpress/env`, which would have added about 290 npm packages (including known high and critical advisories and packages without a declared licence) to a project that bans unvetted dependencies (ADR 0008, ADR 0010).

## Requirements
Docker (Docker Desktop, OrbStack or Docker Engine with Compose v2), Node 24 and pnpm (see the repository README). Nothing else.

## Commands

| Command | Does |
|---|---|
| `pnpm wp:start` | Start MariaDB and WordPress, install WordPress, install the Dutch language pack, seed fixtures. Safe to rerun. |
| `pnpm wp:seed` | Re-apply the fixtures only. Idempotent: pages and users are updated in place. |
| `pnpm wp:smoke` | Check front page, pretty permalinks, REST API, login page, 404, versions, language pack and fixture users. |
| `pnpm wp:cli -- <wp-cli args>` | Run WP-CLI, for example `pnpm wp:cli -- plugin list`. |
| `pnpm wp:logs` | Last 200 log lines. |
| `pnpm wp:stop` | Stop and remove the containers; data is kept. |
| `pnpm wp:reset` | Remove containers **and this project's volumes** (a clean slate). |

The site is at `http://127.0.0.1:8888` (override with `BLX_WP_PORT`). Administrator: `admin` / `password`. Fixture users for permission tests: `editor_ed`, `author_ann`, `contributor_con`, `subscriber_sub` (all with the password `password`). Fixture pages: `home` (front page), `about`, `contact`. These are development-only credentials; the stack binds to the loopback interface only and the database publishes no port. Never reuse them anywhere else.

## Versions
Defaults are the ADR 0001 floor: WordPress 7.0 on PHP 8.2, MariaDB 11.4, all pinned by image digest. Try other versions with environment variables, for example:

```bash
BLX_WP_IMAGE=wordpress:7.1.3-php8.5-apache@sha256:c12bed9c5af9d76261221c2af3a6216a074dd80b4fc2459588b3cbf2dd8e1798 \
BLX_CLI_IMAGE=wordpress:cli-php8.5@sha256:52d8832dc8b90022c22fe963e696e4107d86f68b9b891e9624d82fec94fdc3b7 \
pnpm wp:reset && pnpm wp:start
```

CI runs the smoke test on both the floor and the latest combination (`.github/workflows/ci.yml`, job `wordpress`). When you change an image, update its digest (`docker buildx imagetools inspect <image>`), the compose defaults and the CI matrix together.

## Safety notes
- The Compose project is named `blixis-wp-blocks`. Plain `blixis` collided with another Blixis stack on a developer machine; the reset command also never removes orphan containers, because they may belong to other projects.
- Volumes: `blixis-wp-blocks_db-data` and `blixis-wp-blocks_wp-data`.
- Packages (`wordpress/theme`, `wordpress/plugin`, add-ons) are mounted through `docker/compose.packages.yml` once they contain PHP, so Docker never creates empty host directories. That file and the WordPress PHPUnit integration bootstrap arrive with BWB-018 and BWB-039.

## Fixtures
`tooling/wp-env/fixtures/seed.php` is run with `wp eval-file`. Keep it deterministic and idempotent; locale- and mode-specific fixtures for the translation and appearance features are added by BWB-018 and the P2 issues.
