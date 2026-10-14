<?php
/** Conservative final HTML rejection boundary.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Preview;

\defined( 'ABSPATH' ) || exit;

/** Inspects tags and attributes only; ordinary text is never treated as markup. */
final class PreviewSanitizer {
	private const FORBIDDEN_TAGS = [ 'html', 'body', 'script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base', 'style', 'svg' ];
	private const URL_ATTRIBUTES = [ 'href', 'src', 'xlink:href', 'action', 'formaction', 'poster' ];

	/**
	 * Apply the documented contract.
	 *
	 * @param string $html Html.
	 */
	public static function accepts( string $html ): bool {
		if ( 1 !== \preg_match( '//u', $html ) || \str_contains( $html, "\0" ) ) {
			return false;
		}
		$offset = 0;
		while ( true ) {
			$start = \strpos( $html, '<', $offset );
			if ( false === $start ) {
				break;
			}
			$end = \strpos( $html, '>', $start + 1 );
			if ( false === $end ) {
				return false;
			}
			$tag = \substr( $html, $start + 1, $end - $start - 1 );
			if ( \str_contains( $tag, '<' ) || ! self::accepts_tag( $tag ) ) {
				return false;
			}
			$offset = $end + 1;
		}
		return true;
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $value Value.
	 */
	private static function decode( string $value ): string {
		for ( $i = 0; $i < 5; ++$i ) {
			$next = \html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			if ( $next === $value ) {
				break;
			}
			$value = $next;
		}
		return $value;
	}

	/**
	 * Apply the documented contract.
	 *
	 * @param string $source Source.
	 */
	private static function accepts_tag( string $source ): bool {
		$decoded = self::decode( $source );
		if ( 1 !== \preg_match( '~^\s*(/?)\s*([a-z][a-z0-9:-]*)(.*)$~isD', $decoded, $match ) ) {
			return false;
		}
		$name = \strtolower( $match[2] );
		if ( \in_array( $name, self::FORBIDDEN_TAGS, true ) ) {
			return false;
		}
		$rest = $match[3];
		if ( '/' === $match[1] ) {
			return '' === \trim( $rest );
		}
		while ( '' !== \trim( $rest ) ) {
			if ( 1 === \preg_match( '~^\s*/\s*$~', $rest ) ) {
				return true;
			}
			if ( 1 !== \preg_match( '~^\s+([a-z_:][a-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'`=<>]+)))?(.*)$~isD', $rest, $attribute, PREG_UNMATCHED_AS_NULL ) ) {
				return false;
			}
			$key   = \strtolower( $attribute[1] );
			$value = self::decode( $attribute[2] ?? $attribute[3] ?? $attribute[4] ?? '' );
			if ( \str_starts_with( $key, 'on' ) || \in_array( $key, [ 'style', 'srcdoc' ], true ) ) {
				return false;
			}
			$compact = \preg_replace( '/[\x00-\x20\x7f-\x9f]+/u', '', $value );
			if ( null === $compact ) {
				return false;
			}
			if ( \in_array( $key, self::URL_ATTRIBUTES, true ) && 1 === \preg_match( '/^(?:javascript|vbscript|data):/i', $compact ) ) {
				return false;
			}
			if ( 1 === \preg_match( '/(?:on[a-z0-9_-]*\s*=|style\s*=|data:|<\/?(?:script|iframe|svg)\b)/i', $compact ) ) {
				return false;
			}
			$rest = $attribute[5];
		}
		return true;
	}
}
