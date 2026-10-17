<?php
/**
 * Registers bundled fonts in the WordPress Font Library collection.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Templates;

/** Font Collection adapter. */
final class FontCollection {
	/** Register the local collection on supported core versions. */
	public static function register(): void {
		if ( ! function_exists( 'wp_register_font_collection' ) ) {
			return; }
		$file = dirname( __DIR__, 2 ) . '/templates/fonts/collection.json';
		$data = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read local collection manifest.
		if ( ! is_array( $data ) ) {
			return; }
		$data['font_families'] = $data['font_families'] ?? [];
		foreach ( $data['font_families'] as &$family ) {
			foreach ( $family['font_family_settings']['fontFace'] as &$face ) {
				$face['src'] = plugins_url( 'templates/' . $face['src'], dirname( __DIR__, 2 ) . '/blixis-builder.php' );
			} unset( $face ); }
		unset( $family );
		wp_register_font_collection( 'blixis', $data );
	}
}
