<?php
/**
 * Installs only manifest-selected bundled font files into the WordPress Font Library.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Templates;

/** Installer for the six local font families. */
final class FontInstaller {
	/** Install one allowlisted bundled family.
	 *
	 * @param string $slug Manifest family slug.
	 * @return FontInstallResult Installation outcome.
	 */
	public function install( string $slug ): FontInstallResult {
		$manifest = self::lookup_font_manifest_entry( $slug );
		if ( null === $manifest ) {
			return new FontInstallResult( false, null, [ 'Unknown bundled font.' ] ); }
		if ( ! function_exists( 'wp_insert_post' ) || ! function_exists( 'wp_get_font_dir' ) ) {
			return new FontInstallResult( false, null, [ 'WordPress Font Library requires WordPress 6.5 or later.' ] ); }
		if ( ! current_user_can( 'edit_theme_options' ) || ! current_user_can( 'upload_files' ) ) {
			return new FontInstallResult( false, null, [ 'Insufficient capabilities.' ] ); }
		$name     = $manifest['name'];
		$filename = $manifest['filename'];
		$existing = get_posts(
			[
				'post_type'   => 'wp_font_family',
				'post_status' => 'publish',
				'name'        => $slug,
				'numberposts' => 1,
			]
		);
		if ( $existing ) {
			return new FontInstallResult( true, (int) $existing[0]->ID ); }
		$source      = dirname( __DIR__, 2 ) . '/templates/' . $manifest['source'];
		$font_types  = function_exists( 'wp_get_allowed_font_mime_types' ) ? wp_get_allowed_font_mime_types() : [
			'ttf'   => 'font/ttf',
			'otf'   => 'font/otf',
			'woff'  => 'font/woff',
			'woff2' => 'font/woff2',
		];
		$file_type   = function_exists( 'wp_check_filetype' ) ? wp_check_filetype( $filename, $font_types ) : [ 'type' => null ];
		$extension   = strtolower( pathinfo( $source, PATHINFO_EXTENSION ) );
		$known_types = [
			'ttf'   => [ 'font/ttf', 'application/x-font-ttf' ],
			'otf'   => [ 'font/otf', 'application/x-font-opentype' ],
			'woff'  => [ 'font/woff', 'application/font-woff' ],
			'woff2' => [ 'font/woff2', 'application/font-woff2' ],
		];
		if ( ! is_file( $source ) || ! isset( $known_types[ $extension ] ) || ! in_array( $file_type['type'] ?? null, $known_types[ $extension ], true ) ) {
			return new FontInstallResult( false, null, [ 'Bundled font file failed manifest checks.' ] ); }
		$font_dir = wp_get_font_dir();
		if ( ! is_array( $font_dir ) || empty( $font_dir['path'] ) || ! wp_mkdir_p( $font_dir['path'] ) ) {
			return new FontInstallResult( false, null, [ 'Font Library directory is unavailable.' ] ); }
		$target = trailingslashit( $font_dir['path'] ) . wp_unique_filename( $font_dir['path'], $filename );
		if ( file_exists( $target ) ) {
			return new FontInstallResult( false, null, [ 'Font target already exists.' ] ); }
		if ( ! copy( $source, $target ) ) {
			return new FontInstallResult( false, null, [ 'Could not copy bundled font.' ] ); }
		$face           = [
			'fontFamily'  => $name,
			'fontStyle'   => $manifest['fontStyle'],
			'fontWeight'  => $manifest['fontWeight'],
			'fontDisplay' => $manifest['fontDisplay'],
			'src'         => [ trailingslashit( $font_dir['url'] ) . basename( $target ) ],
		];
		$family_content = wp_json_encode(
			[
				'fontFamily' => $name,
				'slug'       => $slug,
				'name'       => $name,
				'fontFace'   => [ $face ],
			]
		);
		if ( false === $family_content ) {
			wp_delete_file( $target );
			return new FontInstallResult( false, null, [ 'Font family settings could not be encoded.' ] ); }
		$family_id = wp_insert_post(
			[
				'post_type'    => 'wp_font_family',
				'post_status'  => 'publish',
				'post_title'   => $name,
				'post_name'    => $slug,
				'post_content' => $family_content,
			],
			true
		);
		if ( is_wp_error( $family_id ) || ! $family_id ) {
			wp_delete_file( $target );
			return new FontInstallResult( false, null, [ 'WordPress could not create font family.' ] ); }
		$face_content = wp_json_encode( $face );
		if ( false === $face_content ) {
			wp_delete_post( $family_id, true );
			wp_delete_file( $target );
			return new FontInstallResult( false, null, [ 'Font face settings could not be encoded.' ] ); }
		$face_id = wp_insert_post(
			[
				'post_type'    => 'wp_font_face',
				'post_status'  => 'publish',
				'post_title'   => $name . ' Regular',
				'post_parent'  => $family_id,
				'post_content' => $face_content,
			],
			true
		);
		if ( is_wp_error( $face_id ) || ! $face_id ) {
			wp_delete_post( $family_id, true );
			wp_delete_file( $target );
			return new FontInstallResult( false, null, [ 'WordPress could not create font face.' ] ); }
		if ( function_exists( 'update_post_meta' ) ) {
			update_post_meta( $face_id, '_wp_font_face_file', basename( $target ) ); }
		return new FontInstallResult( true, (int) $family_id );
	}
	/** Read one allowlisted family and file path from the bundled collection manifest.
	 *
	 * @param string $slug Family slug.
	 * @return array{name:string,filename:string,source:string,fontStyle:string,fontWeight:string,fontDisplay:string}|null Valid family definition.
	 */
	private static function lookup_font_manifest_entry( string $slug ): ?array {
		if ( ! preg_match( '/^[a-z0-9-]{1,64}$/D', $slug ) ) {
			return null; }
		$file = dirname( __DIR__, 2 ) . '/templates/fonts/collection.json';
		$data = json_decode( (string) file_get_contents( $file ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Read the bundled font manifest.
		foreach ( $data['font_families'] ?? [] as $family ) {
			$settings = $family['font_family_settings'] ?? [];
			if ( ( $settings['slug'] ?? null ) !== $slug || ! is_string( $settings['name'] ?? null ) ) {
				continue; }
			$face   = $settings['fontFace'][0] ?? [];
			$source = $face['src'] ?? null;
			if ( ! is_string( $source ) || ! preg_match( '~^fonts/' . preg_quote( $slug, '~' ) . '/([A-Za-z0-9-]+\.ttf)$~D', $source, $match ) ) {
				return null; }
			if ( ! in_array( $face['fontStyle'] ?? null, [ 'normal','italic' ], true ) || ! is_string( $face['fontWeight'] ?? null ) || ! is_string( $face['fontDisplay'] ?? null ) ) {
				return null; }
			return [
				'name'        => $settings['name'],
				'filename'    => $match[1],
				'source'      => $source,
				'fontStyle'   => $face['fontStyle'],
				'fontWeight'  => $face['fontWeight'],
				'fontDisplay' => $face['fontDisplay'],
			];
		}
		return null;
	}
}
