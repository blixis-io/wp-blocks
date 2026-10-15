<?php
/**
 * Alternate-language links.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

\defined( 'ABSPATH' ) || exit;

/** Builds alternate links for the published locales of a page, plus `x-default`. */
final class Alternates {
	/**
	 * Build the links.
	 *
	 * @param array<string, string> $urls Published locale to absolute URL (only locales that are published).
	 * @param string                $default_locale Default locale.
	 * @return list<array{hreflang: string, href: string}>
	 */
	public static function links( array $urls, string $default_locale ): array {
		if ( [] === $urls ) {
			return [];
		}
		$links = [];
		foreach ( $urls as $locale => $url ) {
			$links[] = [
				'hreflang' => LocaleConfig::tag( $locale ),
				'href'     => $url,
			];
		}
		// x-default points at a published URL: the default locale's, else the first published locale's.
		$links[] = [
			'hreflang' => 'x-default',
			'href'     => $urls[ $default_locale ] ?? \reset( $urls ),
		];
		return $links;
	}
}
