<?php
/**
 * Route safety: refuse prefixes that would shadow existing content.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

\defined( 'ABSPATH' ) || exit;

/** Reports prefixes that collide with WordPress routes or existing top-level slugs (ADR 0006 route safety). */
final class Collisions {
	/**
	 * Collisions of a configuration.
	 *
	 * @param LocaleConfig  $config Site languages.
	 * @param array<string> $top_level_slugs Slugs of existing top-level pages, posts and terms.
	 * @return list<array{locale: string, prefix: string, reason: string}>
	 */
	public static function report( LocaleConfig $config, array $top_level_slugs ): array {
		$problems = [];
		$taken    = \array_flip( \array_map( 'strtolower', $top_level_slugs ) );
		foreach ( $config->prefixes() as $locale => $prefix ) {
			if ( RoutePath::is_reserved( '/' . $prefix ) ) {
				$problems[] = [
					'locale' => $locale,
					'prefix' => $prefix,
					'reason' => 'reserved-route',
				];
			} elseif ( isset( $taken[ $prefix ] ) ) {
				$problems[] = [
					'locale' => $locale,
					'prefix' => $prefix,
					'reason' => 'existing-slug',
				];
			}
		}
		return $problems;
	}
}
