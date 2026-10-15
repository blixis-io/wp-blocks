<?php
/**
 * Cache key of a rendered public page.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

\defined( 'ABSPATH' ) || exit;

/** Every input that changes the rendered page is part of the key (ADR 0006), so a change makes the old entry unreachable. */
final class RenderCacheKey {
	/**
	 * Build the key.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $locale Selected locale.
	 * @param int    $layout_revision Published layout snapshot.
	 * @param int    $content_revision Published content snapshot (0 when none).
	 * @param string $epoch Site-wide epoch (design system, theme, media, classes).
	 * @param int    $compiler_version CSS compiler version.
	 * @param string $plugin_version Plugin version.
	 * @param string $theme Active stylesheet and version.
	 * @param string $compat_reason Effective compatibility reason.
	 * @return string Key of 64 hex characters prefixed for readability.
	 */
	public static function build( int $post_id, string $locale, int $layout_revision, int $content_revision, string $epoch, int $compiler_version, string $plugin_version, string $theme, string $compat_reason ): string {
		$parts = [ $post_id, $locale, $layout_revision, $content_revision, $epoch, $compiler_version, $plugin_version, $theme, $compat_reason ];
		return 'blx_' . \hash( 'sha256', \implode( "\0", \array_map( 'strval', $parts ) ) );
	}
}
