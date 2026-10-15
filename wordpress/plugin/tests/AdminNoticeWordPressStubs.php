<?php
/**
 * Minimal escaping functions for notice tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

// phpcs:disable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound -- Stands in for WordPress core.
/** Translation stub.
 *
 * @param string $message Source string.
 * @param string $domain Text domain.
 */
function __( string $message, string $domain ): string {
	unset( $domain );
	return $message;
}
/** HTML escape stub.
 *
 * @param string $value Raw value.
 */
function esc_html( string $value ): string {
	return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
}
/** URL escape stub.
 *
 * @param string $value Raw URL.
 */
function esc_url( string $value ): string {
	return \htmlspecialchars( $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8' );
}
/** Translated HTML escape stub.
 *
 * @param string $message Source string.
 * @param string $domain Text domain.
 */
function esc_html__( string $message, string $domain ): string {
	unset( $domain );
	return esc_html( $message );
}
// phpcs:enable WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedFunctionFound
