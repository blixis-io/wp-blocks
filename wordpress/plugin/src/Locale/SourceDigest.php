<?php
/**
 * Source markers of translations.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

\defined( 'ABSPATH' ) || exit;

/**
 * PHP twin of `sourceDigest` in `@blixis/wp-core`: the first 16 hex characters of the SHA-256 of the canonical JSON of the
 * default-locale values that count as source text (FR-053, ADR 0003). Verified against the shared corpus
 * `packages/core/corpus/source-digest.json`.
 */
final class SourceDigest {
	/**
	 * Digest of default-locale values.
	 *
	 * @param \stdClass          $values Default-locale values (decoded JSON object).
	 * @param ?array<int,string> $property_ids Property ids that count as source text (translatable ones); null for all.
	 * @return string 16 lowercase hex characters.
	 */
	public static function of( \stdClass $values, ?array $property_ids = null ): string {
		$wanted = null === $property_ids ? \array_keys( \get_object_vars( $values ) ) : \array_values( \array_unique( $property_ids ) );
		$subset = new \stdClass();
		foreach ( $wanted as $id ) {
			$id = (string) $id;
			if ( \property_exists( $values, $id ) ) {
				$subset->$id = $values->$id;
			}
		}
		return \substr( \hash( 'sha256', self::canonical( $subset ) ), 0, 16 );
	}

	/**
	 * Canonical JSON: keys in UTF-8 byte order at every level, no whitespace, unescaped slashes and Unicode.
	 *
	 * @param mixed $value Decoded JSON value.
	 * @return string
	 */
	public static function canonical( mixed $value ): string {
		return (string) \json_encode( self::sorted( $value ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure helper used without WordPress.
	}

	/**
	 * Sort object keys recursively (arrays keep their order).
	 *
	 * @param mixed $value Decoded JSON value.
	 * @return mixed
	 */
	private static function sorted( mixed $value ): mixed {
		if ( \is_array( $value ) ) {
			return \array_map( [ self::class, 'sorted' ], $value );
		}
		if ( ! $value instanceof \stdClass ) {
			return $value;
		}
		$vars = \get_object_vars( $value );
		\uksort( $vars, static fn ( string|int $a, string|int $b ): int => \strcmp( (string) $a, (string) $b ) );
		$out = new \stdClass();
		foreach ( $vars as $key => $item ) {
			$out->{ (string) $key} = self::sorted( $item );
		}
		return $out;
	}
}
