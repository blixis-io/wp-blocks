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
	 */
	public static function hooks( ElementNode $node ): string {
		return ' data-blx-id="' . self::attr( $node->id ) . '" data-blx-type="' . self::attr( $node->type ) . '"';
	}
}
