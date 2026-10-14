<?php
/**
 * Conservative final HTML rejection boundary.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** Rejects suspicious fragments rather than repairing renderer output. */
final class PreviewSanitizer {
	/** Check HTML without mutating it; repair could silently change node identity or nesting.
	 *
	 * @param string $html HTML fragment.
	 */
	public static function accepts( string $html ): bool {
		if ( 1 !== \preg_match( '//u', $html ) || \str_contains( $html, "\0" ) ) {
			return false;
		}
		$decoded = $html;
		for ( $pass = 0; $pass < 5; ++$pass ) {
			$next = \html_entity_decode( $decoded, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			if ( $next === $decoded ) {
				break;
			}
			$decoded = $next;
		}
		$compact = \preg_replace( '/[\x00-\x20\x7f]+/u', '', $decoded );
		if ( null === $compact ) {
			return false;
		}
		if ( 1 === \preg_match( '/<\/?(?:html|body|script|iframe|object|embed|form|link|meta|base|style)(?:[\s\/>]|$)/i', $decoded ) ||
			1 === \preg_match( '/<\/?(?:html|body|script|iframe|object|embed|form|link|meta|base|style)(?:[\/>]|$)/i', $compact ) ||
			1 === \preg_match( '/(?:on[a-z0-9_-]*|style)=/i', $compact ) ||
			1 === \preg_match( '/(?:javascript:|vbscript:|data:)/i', $compact ) ) {
			return false;
		}
		return true;
	}
}
