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
	private const FORBIDDEN_TAGS = [ 'html', 'body', 'script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base', 'style' ];
	private const SVG_TAGS       = [ 'svg', 'path', 'circle' ];
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
		$offset     = 0;
		$inside_svg = false;
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
			if ( \str_contains( $tag, '<' ) || ! self::accepts_tag( $tag, $inside_svg ) ) {
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
	 * @param bool   $inside_svg Whether the current tag is inside a permitted SVG.
	 */
	private static function accepts_tag( string $source, bool &$inside_svg ): bool {
		if ( 1 !== \preg_match( '~^\s*(/?)\s*([a-z][a-z0-9:-]*)(.*)$~isD', $source, $match ) ) {
			return false;
		}
		$name = \strtolower( $match[2] );
		if ( \in_array( $name, self::FORBIDDEN_TAGS, true ) || ( $inside_svg && ! \in_array( $name, self::SVG_TAGS, true ) ) ) {
			return false;
		}
		$rest = $match[3];
		if ( '/' === $match[1] ) {
			if ( '' !== \trim( $rest ) || ( $inside_svg && 'svg' !== $name ) || ( ! $inside_svg && \in_array( $name, self::SVG_TAGS, true ) ) ) {
				return false;
			}
			$inside_svg = false;
			return true;
		}
		if ( $inside_svg && 'svg' === $name ) {
			return false;
		}
		if ( ! $inside_svg && 'svg' === $name ) {
			if ( \str_ends_with( \trim( $rest ), '/' ) ) {
				return false;
			}
			$inside_svg = true;
		}
		if ( $inside_svg && 'svg' !== $name && ! \str_ends_with( \trim( $rest ), '/' ) ) {
			return false;
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
				if ( 'style' !== $key || ! self::accepts_style( $value ) ) {
					return false;
				}
			}
			if ( \in_array( $name, self::SVG_TAGS, true ) && ! self::accepts_svg_attribute( $key, $value ) ) {
				return false;
			}
			if ( \in_array( $key, self::URL_ATTRIBUTES, true ) && ! \Blixis\Builder\Registry\SafeUrl::accepts( $value ) ) {
				return false;
			}
			$rest = $attribute[5];
		}
		return true;
	}

	/** Accept only renderer-generated, non-executable style declarations.
	 *
	 * @param string $value Style value.
	 */
	private static function accepts_style( string $value ): bool {
		if ( 1 === \preg_match( '/^--blx-headline-index:(?:[0-9]|[1-9][0-9]|100)$/D', $value ) ) {
			return true;
		}
		return 1 === \preg_match( '/^background-image:linear-gradient\((?:360|3[0-5][0-9]|[12]?[0-9]{1,2}(?:\.[0-9]{1,2})?)deg,(?:#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?: (?:100|[1-9]?[0-9](?:\.[0-9]{1,2})?)%)?,?){2,8}\);-webkit-background-clip:text;background-clip:text;color:transparent$/D', $value );
	}

	/** Restrict inline SVG to the fixed geometry emitted by the icon renderer.
	 *
	 * @param string $key Attribute name.
	 * @param string $value Attribute value.
	 */
	private static function accepts_svg_attribute( string $key, string $value ): bool {
		$patterns = [
			'viewbox'         => '/^0 0 24 24$/D',
			'width'           => '/^(?:1em|[0-9]{1,2})$/D',
			'height'          => '/^(?:1em|[0-9]{1,2})$/D',
			'fill'            => '/^(?:none|currentColor)$/D',
			'stroke'          => '/^(?:none|currentColor)$/D',
			'stroke-width'    => '/^(?:[0-9](?:\.[0-9]{1,2})?)$/D',
			'stroke-linecap'  => '/^(?:round|butt|square)$/D',
			'stroke-linejoin' => '/^(?:round|bevel|miter)$/D',
			'focusable'       => '/^(?:true|false)$/D',
			'aria-hidden'     => '/^(?:true|false)$/D',
			'cx'              => '/^[0-9]{1,2}(?:\.[0-9]{1,2})?$/D',
			'cy'              => '/^[0-9]{1,2}(?:\.[0-9]{1,2})?$/D',
			'r'               => '/^[0-9]{1,2}(?:\.[0-9]{1,2})?$/D',
			'd'               => '/^[MmLlHhVvCcSsQqTtAaZz0-9 .,+-]+$/D',
		];
		return isset( $patterns[ $key ] ) && 1 === \preg_match( $patterns[ $key ], $value );
	}
}
