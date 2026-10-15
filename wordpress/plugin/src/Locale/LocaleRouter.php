<?php
/**
 * The routing boundary for translation plugins (ADR 0006 section 4).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

\defined( 'ABSPATH' ) || exit;

/**
 * Everything the builder needs to know about locale URLs. The Free plugin ships only the native path-prefix strategy; an
 * adapter for WPML, Polylang or TranslatePress would implement this interface, and none is supported until it has contract
 * tests against that plugin (BWB-111 documentation).
 */
interface LocaleRouter {
	/**
	 * The locale of the current request.
	 *
	 * @return string
	 */
	public function current(): string;

	/**
	 * Missing-translation policy: `source` shows the default locale's text, `blank` shows nothing.
	 *
	 * @return string
	 */
	public function fallback_policy(): string;

	/**
	 * Whether a post has published content in a locale.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $locale Locale.
	 * @return bool
	 */
	public function is_published( int $post_id, string $locale ): bool;

	/**
	 * Absolute URL of a post in a locale, or null when that locale is not published for it.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $locale Locale.
	 * @return ?string
	 */
	public function url_for( int $post_id, string $locale ): ?string;

	/**
	 * Alternate-language links of a post: every published locale plus `x-default`.
	 *
	 * @param int $post_id Post ID.
	 * @return list<array{hreflang: string, href: string}>
	 */
	public function alternates( int $post_id ): array;
}
