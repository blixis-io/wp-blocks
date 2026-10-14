<?php
/**
 * Builder post-meta key grammar.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Storage;

\defined( 'ABSPATH' ) || exit;

/** Only these key families belong to the builder repository. */
final class MetaKeys {
	public const LAYOUT    = '_blixis_layout';
	public const PUBLISHED = '_blixis_published';

	/**
	 * Check a WordPress locale identifier.
	 *
	 * @param string $locale Value.
	 */
	public static function is_valid_locale( string $locale ): bool {
		return \strlen( $locale ) <= 20 && 1 === \preg_match( '/^[a-z]{2,3}(?:_[A-Za-z0-9]{2,8})*$/D', $locale );
	}

	/**
	 * Create a working-content key.
	 *
	 * @param string $locale Value.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	public static function content( string $locale ): string {
		if ( ! self::is_valid_locale( $locale ) ) {
			throw new \InvalidArgumentException( 'Invalid locale.' );
		}
		return '_blixis_content_' . $locale;
	}

	/**
	 * Create an immutable layout-snapshot key.
	 *
	 * @param int $revision Value.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	public static function snap_layout( int $revision ): string {
		if ( $revision < 1 ) {
			throw new \InvalidArgumentException( 'Snapshot revision must be positive.' );
		}
		return '_blixis_snap_layout_' . $revision;
	}

	/**
	 * Create an immutable content-snapshot key.
	 *
	 * @param string $locale Value.
	 * @param int    $revision Value.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	public static function snap_content( string $locale, int $revision ): string {
		if ( ! self::is_valid_locale( $locale ) || $revision < 1 ) {
			throw new \InvalidArgumentException( 'Invalid snapshot key.' );
		}
		return '_blixis_snap_content_' . $locale . '_' . $revision;
	}

	/**
	 * History row for an earlier value of a working stream (the revision ring).
	 *
	 * @param string $stream_key Layout or content stream key.
	 * @param int    $revision Revision the stored value had.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	public static function rev( string $stream_key, int $revision ): string {
		if ( $revision < 1 || ! self::is_valid_key( $stream_key ) || self::is_snapshot( $stream_key ) || self::is_revision( $stream_key ) || self::PUBLISHED === $stream_key ) {
			throw new \InvalidArgumentException( 'Invalid revision key.' );
		}
		$family = self::LAYOUT === $stream_key ? 'layout' : 'content_' . \substr( $stream_key, \strlen( '_blixis_content_' ) );
		return '_blixis_rev_' . $family . '_' . $revision;
	}

	/**
	 * Prefix shared by the history rows of one working stream.
	 *
	 * @param string $stream_key Layout or content stream key.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	public static function rev_prefix( string $stream_key ): string {
		return \substr( self::rev( $stream_key, 1 ), 0, -1 );
	}

	/**
	 * Whether a key is a revision-ring history row.
	 *
	 * @param string $key Value.
	 */
	public static function is_revision( string $key ): bool {
		return 1 === \preg_match( '/^_blixis_rev_(?:layout|content_.+)_[1-9][0-9]*$/D', $key ) && self::is_valid_key( $key );
	}

	/**
	 * Check the complete key, excluding zero-padded revision numbers.
	 *
	 * @param string $key Value.
	 */
	public static function is_valid_key( string $key ): bool {
		if ( self::LAYOUT === $key || self::PUBLISHED === $key ) {
			return true;
		}
		if ( 1 === \preg_match( '/^_blixis_content_(.+)$/D', $key, $parts ) ) {
			return self::is_valid_locale( $parts[1] );
		}
		if ( 1 === \preg_match( '/^_blixis_snap_layout_([1-9][0-9]*)$/D', $key ) || 1 === \preg_match( '/^_blixis_rev_layout_[1-9][0-9]*$/D', $key ) ) {
			return true;
		}
		if ( 1 === \preg_match( '/^_blixis_rev_content_(.+)_[1-9][0-9]*$/D', $key, $parts ) ) {
			return self::is_valid_locale( $parts[1] );
		}
		if ( 1 === \preg_match( '/^_blixis_snap_content_(.+)_([1-9][0-9]*)$/D', $key, $parts ) ) {
			return self::is_valid_locale( $parts[1] );
		}
		return false;
	}

	/**
	 * Whether a key names an immutable snapshot.
	 *
	 * @param string $key Value.
	 */
	public static function is_snapshot( string $key ): bool {
		return self::is_valid_key( $key ) && 0 === \strpos( $key, '_blixis_snap_' );
	}

	/**
	 * Revision property for a stream family.
	 *
	 * @param string $key Value.
	 * @throws \InvalidArgumentException When input is invalid.
	 */
	public static function revision_field( string $key ): string {
		if ( ! self::is_valid_key( $key ) ) {
			throw new \InvalidArgumentException( 'Invalid builder meta key.' );
		}
		if ( self::PUBLISHED === $key ) {
			return 'pointerRevision';
		}
		return 0 === \strpos( $key, '_blixis_content_' ) || 0 === \strpos( $key, '_blixis_snap_content_' ) ? 'contentRevision' : 'layoutRevision';
	}
}
