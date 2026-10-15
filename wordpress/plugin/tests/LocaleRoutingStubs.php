<?php
/**
 * Escaping stubs for the locale routing tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- Stands in for WordPress core.
if ( ! \function_exists( 'esc_html' ) ) {
	/** HTML escape stub.
	 *
	 * @param string $value Raw value.
	 */
	function esc_html( string $value ): string {
		return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
	}
}
if ( ! \function_exists( 'esc_url' ) ) {
	/** URL escape stub.
	 *
	 * @param string $value Raw URL.
	 */
	function esc_url( string $value ): string {
		return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
	}
}
if ( ! \function_exists( 'esc_attr' ) ) {
	/** Attribute escape stub.
	 *
	 * @param string $value Raw value.
	 */
	function esc_attr( string $value ): string {
		return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
	}
}
