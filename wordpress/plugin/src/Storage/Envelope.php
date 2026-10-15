<?php
/**
 * Minimal persisted-stream envelope checks (BWB-040).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Rejects malformed, oversized or excessively deep JSON; BWB-043 adds document validation. */
final class Envelope {
	public const MAX_BYTES   = 2097152;
	private const MAX_DEPTH  = 32;
	private const MAX_VALUES = 50000;

	/**
	 * Decode an envelope without discarding unknown document fields.
	 *
	 * @param string $value Value.
	 * @param string $key Value.
	 */
	public static function decode( string $value, string $key ): ?\stdClass {
		if ( '' === $value || \strlen( $value ) > self::MAX_BYTES ) {
			return null;
		}
		try {
			$data = \json_decode( $value, false, self::MAX_DEPTH, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $exception ) {
			return null;
		}
		if ( ! $data instanceof \stdClass || ! isset( $data->{'schemaVersion'} ) || ! \is_int( $data->{'schemaVersion'} ) || $data->{'schemaVersion'} < 1 ) {
			return null;
		}
		$stack  = [ $data ];
		$values = 0;
		while ( [] !== $stack ) {
			$value = \array_pop( $stack );
			if ( ++$values > self::MAX_VALUES ) {
				return null;
			}
			if ( $value instanceof \stdClass ) {
				foreach ( \get_object_vars( $value ) as $child ) {
					$stack[] = $child;
				}
			} elseif ( \is_array( $value ) ) {
				foreach ( $value as $child ) {
					$stack[] = $child;
				}
			}
		}
		$field = MetaKeys::revision_field( $key );
		if ( ! isset( $data->$field ) || ! \is_int( $data->$field ) || $data->$field < 1 ) {
			return null;
		}
		return $data;
	}

	/**
	 * Read the revision from a validated envelope.
	 *
	 * @param string $value Value.
	 * @param string $key Value.
	 */
	public static function revision( string $value, string $key ): ?int {
		$data = self::decode( $value, $key );
		return null === $data ? null : $data->{MetaKeys::revision_field( $key )};
	}

	/**
	 * Replace exactly one stream counter after envelope validation.
	 *
	 * @param string $value Value.
	 * @param string $key Value.
	 * @param int    $revision Value.
	 */
	public static function with_revision( string $value, string $key, int $revision ): ?string {
		$data = self::decode( $value, $key );
		if ( null === $data || $revision < 1 ) {
			return null;
		}
		$data->{MetaKeys::revision_field( $key )} = $revision;
		try {
			$encoded = \json_encode( $data, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure validator must work without WordPress.
		} catch ( \JsonException $exception ) {
			return null;
		}
		return \strlen( $encoded ) <= self::MAX_BYTES ? $encoded : null;
	}
}
