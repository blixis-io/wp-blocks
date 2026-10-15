<?php
/**
 * Text direction of a locale.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Locale;

\defined( 'ABSPATH' ) || exit;

/** Right-to-left languages by language subtag (the set WordPress ships RTL locales for, plus common ones). */
final class Direction {
	private const RTL = [ 'ar', 'arc', 'az_ir', 'ckb', 'dv', 'fa', 'he', 'ps', 'sd', 'ug', 'ur', 'yi' ];

	/**
	 * Whether a locale is written right to left.
	 *
	 * @param string $locale WordPress locale such as `ar` or `he_IL`.
	 * @return bool
	 */
	public static function is_rtl( string $locale ): bool {
		$lower = \strtolower( $locale );
		return \in_array( \explode( '_', $lower )[0], self::RTL, true ) || \in_array( $lower, self::RTL, true );
	}

	/**
	 * `dir` value for a locale.
	 *
	 * @param string $locale WordPress locale.
	 * @return string `rtl` or `ltr`.
	 */
	public static function dir( string $locale ): string {
		return self::is_rtl( $locale ) ? 'rtl' : 'ltr';
	}
}
