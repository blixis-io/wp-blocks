<?php
/**
 * Template functions of the Builder plugin.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

use Blixis\Builder\Locale\NativeLocaleRouter;
use Blixis\Builder\Locale\Switcher;
use Blixis\Builder\Registry\FeatureCapabilityGate;

\defined( 'ABSPATH' ) || exit;

if ( ! \function_exists( 'blixis_builder_locale_switcher' ) ) {
	/**
	 * Print links to the published translations of the current page (nothing on single-language sites or untranslated pages).
	 *
	 * @return void
	 */
	function blixis_builder_locale_switcher(): void {
		$router = NativeLocaleRouter::instance();
		$post   = \is_singular() ? \get_queried_object() : null;
		if ( null === $router || ! $post instanceof \WP_Post ) {
			return;
		}
		$urls = [];
		foreach ( $router->alternates( $post->ID ) as $link ) {
			if ( 'x-default' !== $link['hreflang'] ) {
				$urls[ \str_replace( '-', '_', $link['hreflang'] ) ] = $link['href'];
			}
		}
		echo Switcher::html( $urls, $router->current(), \__( 'Language', 'blixis-builder' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped inside Switcher::html().
	}
}

if ( ! \function_exists( 'blixis_builder_extension_api_version' ) ) {
	/** Return the Builder's public extension API version.
	 *
	 * @return int
	 */
	function blixis_builder_extension_api_version(): int {
		return \Blixis\Builder\EXTENSION_API_VERSION;
	}
}

if ( ! \function_exists( 'blixis_builder_capability_api_version' ) ) {
	/** Return the server capability contract version.
	 *
	 * @return int
	 */
	function blixis_builder_capability_api_version(): int {
		return FeatureCapabilityGate::API_VERSION;
	}
}

if ( ! \function_exists( 'blixis_builder_has_capability' ) ) {
	/** Resolve a namespaced add-on capability on the server. False is the safe default.
	 *
	 * @param string $capability Capability id.
	 * @return bool
	 */
	function blixis_builder_has_capability( string $capability ): bool {
		return ( new FeatureCapabilityGate() )->allows( $capability );
	}
}
