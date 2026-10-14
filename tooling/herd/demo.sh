#!/usr/bin/env bash
# Publishes (or republishes) the builder demo page on the Herd dev site. Usage: tooling/herd/demo.sh [site-name]
set -euo pipefail
NAME="${1:-blixis}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SITE="${HERD_SITES:-$HOME/Sites}/$NAME"
cd "$SITE"
php -d memory_limit=512M "$(command -v wp)" plugin activate blixis-builder >/dev/null 2>&1 || true
php -d memory_limit=512M "$(command -v wp)" eval-file "$ROOT/tooling/herd/demo-page.php"
