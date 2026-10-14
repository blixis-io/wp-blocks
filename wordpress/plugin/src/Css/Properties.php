<?php
/**
 * Properties implementation.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Css;

/** Properties contract. */
final class Properties {
	/** Cached generated manifest.
	 *
	 * @var array<string, mixed>|null
	 */
	private static ?array $manifest = null;

	/**
	 * Manifest.
	 *
	 * @return array<string, mixed>
	 */
	public static function manifest(): array {
		if ( null === self::$manifest ) {
			$path = \dirname( __DIR__, 2 ) . '/data/css-properties.json';
			/**
		 * Bundled data.
		 *
		 * @var array<string, mixed> $data
		 */
			$data           = \json_decode( (string) \file_get_contents( $path ), true, 512, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bundled static data.
			self::$manifest = $data;
		}
		return self::$manifest;
	}

	/**
	 * Kind.
	 *
	 * @param string $name Name.
	 * @return array<string, mixed>|null
	 */
	public static function kind( string $name ): ?array {
		$kind = self::manifest()['properties'][ $name ] ?? null;
		return \is_array( $kind ) ? $kind : null;
	}

	/**
	 * Names.
	 *
	 * @param string $group Group.
	 * @param string $key List.
	 * @return list<string>
	 */
	public static function names( string $group, string $key ): array {
		/**
		 * Manifest names.
		 *
		 * @var list<string> $names
		 */
		$names = self::manifest()[ $group ][ $key ] ?? [];
		return $names;
	}

	/**
	 * Colors.
	 *
	 * @return list<string>
	 */
	public static function colors(): array {
		/**
		 * Manifest colours.
		 *
		 * @var list<string> $colors
		 */
		$colors = self::manifest()['namedColors'];
		return $colors;
	}

	/**
	 * Wide.
	 *
	 * @return list<string>
	 */
	public static function wide(): array {
		/**
		 * Wide keywords.
		 *
		 * @var list<string> $wide
		 */
		$wide = self::manifest()['wideKeywords'];
		return $wide;
	}
}
