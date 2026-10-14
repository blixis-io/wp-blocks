# Hands-on development with Laravel Herd

Two environments, two jobs:

| | Repo stack (`docker/compose.yml`) | Herd site (this page) |
|---|---|---|
| Purpose | Reproducible: CI and `pnpm wp:smoke`, exactly the ADR 0001 floor and latest images | Daily work: clicking through the admin, debugging, newest WordPress, real services |
| WordPress | pinned images (7.0 / 7.1) | `~/Sites/blixis`, WordPress 7.1.3 |
| PHP | 8.2 and 8.5 in containers | Herd's PHP (8.4 by default; install 8.2 in Herd to test the floor) |
| Database | MariaDB in the stack, no host port | MariaDB 11.4 on `127.0.0.1:3307` |
| Extras | none | Redis on `127.0.0.1:6380`, OpenSearch 2 on `127.0.0.1:9200` |

Keep using `pnpm wp:smoke` before every PR: the Herd site is not a substitute for it.

## One command

```bash
pnpm dev:site              # name "blixis", WordPress 7.1.3
tooling/herd/setup-site.sh myname 7.1.3
```

The script is idempotent. It starts the services, downloads WordPress into `~/Sites/<name>`, writes `wp-config.php` (development constants, Redis host), installs the site (`https://<name>.test`, user `admin`, password `password`, development only), symlinks `wordpress/theme` into `wp-content/themes/blixis` (and `wordpress/plugin` into `wp-content/plugins/blixis-builder` once the plugin exists), activates the theme and enables the Redis object cache (`redis-cache` plugin). Then run once inside the site folder:

```bash
cd ~/Sites/blixis && herd link blixis && herd secure blixis
```

Edits in the repository show up on reload because the theme is a symlink. Requirements: Herd, Docker (OrbStack or Docker Desktop) and WP-CLI (`wp`). WP-CLI needs more than PHP's default 128 MB to unpack WordPress; the script handles that, and for your own runs use `php -d memory_limit=512M "$(command -v wp)" ...`.

## Services

`pnpm dev:services` starts, and `pnpm dev:services:stop` stops, the services in `docker/compose.dev-services.yml` (project `blixis-dev-services`, images pinned by digest, ports bound to `127.0.0.1` only, no authentication: never expose them).

| Service | Address | Used for |
|---|---|---|
| MariaDB 11.4 | `127.0.0.1:3307`, database/user `blixis`, password `blixis-dev-only` (root: `root-dev-only`) | the site database (different port from other local projects) |
| Redis 8 | `127.0.0.1:6380` | persistent object cache; tests cache invalidation of tokens, render output and options (ADR 0004 cache keys) |
| OpenSearch 2 | `http://127.0.0.1:9200`, security plugin off | compatibility checks with search plugins such as ElasticPress; not needed for the Free builder |

Free does not need Redis or OpenSearch; they exist to catch problems with persistent object caches and search indexing early (autoloaded options such as `blixis_design_system`, cache keys, content filters).

## Useful commands

```bash
cd ~/Sites/blixis
wp theme list                       # Blixis should be active
wp redis status                     # Connected, drop-in valid
wp option get blixis_design_system --format=json
tail -f wp-content/debug.log        # PHP warnings (display is off)
herd php:list                       # installed PHP versions; `herd isolate 8.2` for one site
```

To start over: `wp db reset --yes && rm -rf ~/Sites/blixis` and run the script again. Volumes survive `pnpm dev:services:stop`; `docker compose -f docker/compose.dev-services.yml down --volumes` removes the data.

## Builder demo page

Before the editor exists (P5), `pnpm dev:demo` publishes a real builder page on the Herd site: it creates the page `/builder-demo/`, stores layout and Dutch/English content snapshots through the plugin's own storage classes, and publishes them with the publication pointer, so the public page shows the PHP renderers and the PHP CSS compiler at work (tokens from the design system, a breakpoint rule, a hover state and a library image). Run it again to publish a new revision; edit `tooling/herd/demo-page.php` to try other documents. Open https://blixis.test/builder-demo/ and try your system's dark mode. Development only.
