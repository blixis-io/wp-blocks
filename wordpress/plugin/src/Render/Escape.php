<?php
/** Pure PHP output escaping.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Render;

use Blixis\Builder\Registry\SafeUrl;

\defined( 'ABSPATH' ) || exit;

/** No WordPress dependency, so golden tests can run in PHPUnit. */
final class Escape {
	/**
	 * Apply the documented contract.
	 *
	 * @param string $value Value.
	 */
	public static function html( string $value ): string {
		return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8' );
	}
	/**
	 * Apply the documented contract.
	 *
	 * @param string $value Value.
	 */
	public static function attr( string $value ): string {
		return self::html( $value );
	}
	/**
	 * Apply the documented contract.
	 *
	 * @param string $value Value.
	 */
	public static function url( string $value ): string {
		return SafeUrl::accepts( $value ) ? self::attr( $value ) : '#';
	}
	/**
	 * Apply the documented contract.
	 *
	 * @param ElementNode $node Node.
	 * @param string      $base_class Fixed class of the element type, if any.
	 */
	public static function hooks( ElementNode $node, string $base_class = '' ): string {
		$classes = [];
		if ( '' !== $base_class ) {
			$classes[] = $base_class;
		}
		// Generated class names come from the CSS compiler (`blx-<hex>` or `blx-c-<hex>`); anything else is dropped.
		foreach ( $node->classes as $name ) {
			if ( \is_string( $name ) && 1 === \preg_match( '/^blx-(?:c-)?[0-9a-f]{12}$/D', $name ) ) {
				$classes[] = $name;
			}
		}
		return ' data-blx-id="' . self::attr( $node->id ) . '" data-blx-type="' . self::attr( $node->type ) . '"' . ( [] === $classes ? '' : ' class="' . self::attr( \implode( ' ', $classes ) ) . '"' );
	}
}
