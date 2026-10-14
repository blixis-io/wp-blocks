#!/usr/bin/env bash
# Creates (or updates) the hands-on development site for Laravel Herd: WordPress core in ~/Sites/<name>, the theme symlinked
# from this repository, backing services in Docker (docker/compose.dev-services.yml). Idempotent. Development only.
# Usage: tooling/herd/setup-site.sh [name] [wordpress-version]     e.g. tooling/herd/setup-site.sh blixis 7.1.3
set -euo pipefail

# WP-CLI extracts WordPress in memory; PHP's default 128M is not enough.
wpc() { php -d memory_limit=512M "$(command -v wp)" "$@"; }

NAME="${1:-blixis}"
WP_VERSION="${2:-7.1.3}"
SITES="${HERD_SITES:-$HOME/Sites}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE="$SITES/$NAME"
URL="https://$NAME.test"

command -v wp >/dev/null || { echo "WP-CLI is required (wp)"; exit 1; }
command -v docker >/dev/null || { echo "Docker is required"; exit 1; }

echo "== services"
docker compose -f "$ROOT/docker/compose.dev-services.yml" up --detach --wait

echo "== WordPress $WP_VERSION in $SITE"
mkdir -p "$SITE"
if [ ! -f "$SITE/wp-load.php" ]; then
  wpc core download --path="$SITE" --version="$WP_VERSION"
fi
if [ ! -f "$SITE/wp-config.php" ]; then
  wpc config create --path="$SITE" --dbname=blixis --dbuser=blixis --dbpass=blixis-dev-only --dbhost=127.0.0.1:3307 --skip-check
  wpc config set --path="$SITE" WP_ENVIRONMENT_TYPE local
  wpc config set --path="$SITE" WP_DEBUG true --raw
  wpc config set --path="$SITE" WP_DEBUG_LOG true --raw
  wpc config set --path="$SITE" WP_DEBUG_DISPLAY false --raw
  wpc config set --path="$SITE" SCRIPT_DEBUG true --raw
  wpc config set --path="$SITE" DISALLOW_FILE_EDIT true --raw
  wpc config set --path="$SITE" AUTOMATIC_UPDATER_DISABLED true --raw
  wpc config set --path="$SITE" WP_REDIS_HOST 127.0.0.1
  wpc config set --path="$SITE" WP_REDIS_PORT 6380 --raw
  wpc config set --path="$SITE" WP_REDIS_DATABASE 0 --raw
fi
if ! wpc core is-installed --path="$SITE" 2>/dev/null; then
  wpc core install --path="$SITE" --url="$URL" --title="Blixis Dev" --admin_user=admin --admin_password=password \
    --admin_email=admin@example.test --skip-email
  wpc rewrite structure '/%postname%/' --path="$SITE"
fi

echo "== theme symlink"
mkdir -p "$SITE/wp-content/themes"
ln -sfn "$ROOT/wordpress/theme" "$SITE/wp-content/themes/blixis"
if [ -d "$ROOT/wordpress/plugin" ] && [ -f "$ROOT/wordpress/plugin/blixis-builder.php" ]; then
  mkdir -p "$SITE/wp-content/plugins"
  ln -sfn "$ROOT/wordpress/plugin" "$SITE/wp-content/plugins/blixis-builder"
fi
wpc theme activate blixis --path="$SITE"

echo "== Redis object cache"
if ! wpc plugin is-installed redis-cache --path="$SITE" 2>/dev/null; then wpc plugin install redis-cache --path="$SITE"; fi
wpc plugin activate redis-cache --path="$SITE" 2>/dev/null || true
wpc redis enable --path="$SITE" 2>/dev/null || true

echo
echo "Site:   $URL  (admin / password, development only)"
echo "Herd:   run 'herd link $NAME' inside $SITE if the site is not listed yet, then 'herd secure $NAME' for HTTPS"
echo "DB:     127.0.0.1:3307 (blixis / blixis-dev-only)   Redis: 127.0.0.1:6380   OpenSearch: http://127.0.0.1:9200"
