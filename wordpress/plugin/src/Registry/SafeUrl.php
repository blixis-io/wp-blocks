<?php
/** URL admission shared by property checks and rendering.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Registry;

\defined( 'ABSPATH' ) || exit;

/** PHP twin of packages/element-registry/src/url.ts. */
final class SafeUrl {
	/** Count UTF-16 code units like JavaScript string.length; invalid UTF-8 is refused.
	 *
	 * @param string $value Text.
	 */
	public static function utf16_length( string $value ): int {
		$points = \preg_match_all( '/./us', $value );
		$astral = \preg_match_all( '/[\x{10000}-\x{10ffff}]/u', $value );
		return false === $points || false === $astral ? PHP_INT_MAX : $points + $astral;
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $value Value.
	 */
	public static function accepts( string $value ): bool {
		if ( '' === $value ) {
			return true;
		}
		if ( self::utf16_length( $value ) > 2048 || \str_starts_with( $value, '//' ) || \str_contains( $value, '&#' ) || 1 === \preg_match( '/&[a-zA-Z0-9]+;/', $value ) || 1 === \preg_match( '/[<>"\x27]/', $value ) ) {
			return false;
		}
		if ( 1 === \preg_match( '/[\x00-\x20\x7f-\x9f\\\\\x{00a0}\x{1680}\x{2000}-\x{200f}\x{2028}-\x{202f}\x{205f}-\x{206f}\x{3000}\x{feff}]/u', $value ) ) {
			return false;
		}
		if ( 1 === \preg_match( '/^([a-zA-Z][a-zA-Z0-9+.-]*):/', $value, $match ) ) {
			return \in_array( \strtolower( $match[1] ), [ 'http', 'https', 'mailto', 'tel' ], true );
		}
		$head = \preg_split( '~[/?#]~', $value, 2 );
		return false !== $head && ! \str_contains( $head[0], ':' );
	}
}
