<?php
/**
 * The Blixis compatibility declaration.
 *
 * A theme is "Blixis-compatible" when its stylesheet header (or its parent's) contains `Blixis-Compat: <integer>`
 * (ADR 0002). The Builder plugin reads the same header through its own ThemeCompat service (BWB-047); this class is the
 * theme's side of the contract and the reference for how the value is parsed.
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme;

defined( 'ABSPATH' ) || exit;

/**
 * Reads and validates the compatibility version.
 */
final class Compat {

	/**
	 * Name of the stylesheet header.
	 */
	public const HEADER = 'Blixis-Compat';

	/**
	 * The compatibility version this theme implements.
	 */
	public const CURRENT = 1;

	/**
	 * Largest accepted value; anything bigger is treated as garbage.
	 */
	public const MAX = 9999;

	/**
	 * Parses a header value: a positive integer written in plain digits (no sign, no leading zero, no spaces inside).
	 *
	 * @param string|false|null $value Raw header value (`get_file_data` returns false for a missing header).
	 * @return int|null The version, or null when the header is absent or invalid.
	 */
	public static function from_value( string|false|null $value ): ?int {
		if ( ! is_string( $value ) ) {
			return null;
		}
		$value = trim( $value );
		if ( 1 !== preg_match( '/^[1-9][0-9]{0,3}$/', $value ) ) {
			return null;
		}
		$version = (int) $value;
		return $version <= self::MAX ? $version : null;
	}

	/**
	 * The version a theme directory declares in its `style.css`.
	 *
	 * @param string $directory Theme directory (with or without trailing slash).
	 * @return int|null
	 */
	public static function declared( string $directory ): ?int {
		$header = get_file_data( rtrim( $directory, '/\\' ) . '/style.css', array( 'compat' => self::HEADER ) );
		return self::from_value( $header['compat'] );
	}

	/**
	 * The version the active theme declares: its own, or its parent's for a child theme without a header.
	 *
	 * @return int|null
	 */
	public static function active(): ?int {
		$own = self::declared( get_stylesheet_directory() );
		return $own ?? self::declared( get_template_directory() );
	}
}
